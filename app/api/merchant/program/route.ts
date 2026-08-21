import { ensureSchema, getD1, queryFirst } from "../../../../db";
import { getMerchant, isOwner } from "../../../../lib/auth";
import { cleanText, isHexColor, jsonError, readJson, safeApiError } from "../../../../lib/http";
import { DEFAULT_PROGRAM_TERMS } from "../../../../lib/program-style";
import { makeId } from "../../../../lib/ids";

type ProgramPayload = { name?: string; goal?: number; rewardText?: string; terms?: string; accentColor?: string; earningMode?: string; spendAmountEuros?: number | string; rewardTiers?: Array<{ threshold?: number; rewardText?: string }> };

function readProgram(payload: ProgramPayload | null, fallbackColor: string) {
  const name = cleanText(payload?.name, 80);
  const rewardText = cleanText(payload?.rewardText, 120);
  const terms = cleanText(payload?.terms, 200);
  const accentColor = isHexColor(payload?.accentColor ?? "") ? payload!.accentColor! : fallbackColor;
  const goal = Math.max(3, Math.min(20, Math.round(Number(payload?.goal) || 10)));
  const earningMode = payload?.earningMode === "spend" ? "spend" : "visits";
  const spendAmountCents = Math.max(50, Math.min(100_000, Math.round(Number(payload?.spendAmountEuros || 1) * 100)));
  const suppliedTiers = Array.isArray(payload?.rewardTiers) ? payload!.rewardTiers! : [];
  const rewardTiers = suppliedTiers.map((tier) => ({ threshold: Math.round(Number(tier.threshold)), rewardText: cleanText(tier.rewardText, 120) }))
    .filter((tier) => tier.threshold >= 1 && tier.threshold <= 1000 && tier.rewardText)
    .sort((a, b) => a.threshold - b.threshold)
    .filter((tier, index, list) => index === 0 || tier.threshold !== list[index - 1].threshold)
    .slice(0, 6);
  if (!rewardTiers.length && rewardText) rewardTiers.push({ threshold: goal, rewardText });
  const cycleGoal = rewardTiers.length ? Math.max(...rewardTiers.map((tier) => tier.threshold)) : goal;
  return { name, rewardText: rewardTiers[0]?.rewardText ?? rewardText, terms, accentColor, goal: cycleGoal, earningMode, spendAmountCents, rewardTiers };
}

export async function POST(request: Request) {
  try {
    const merchant = await getMerchant(request);
    if (!merchant) return jsonError("Session expirée.", 401);
    if (!isOwner(merchant)) return jsonError("Seul le propriétaire peut créer la carte.", 403);
    const programExists = await queryFirst<{ id: string }>("SELECT id FROM programs WHERE merchant_id = ?", merchant.id);
    if (programExists) return jsonError("Une carte existe déjà pour ce commerce.", 409);

    const values = readProgram(await readJson<ProgramPayload>(request), merchant.accentColor);
    if (!values.name || !values.rewardTiers.length) return jsonError("Le nom de la carte et au moins une récompense sont obligatoires.");

    await ensureSchema();
    const db = getD1();
    const programId = makeId("prg");
    await db.batch([
      db.prepare(
        `INSERT INTO programs (id, merchant_id, name, goal, reward_text, terms, earning_mode, spend_amount_cents)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(programId, merchant.id, values.name, values.goal, values.rewardText, values.terms || DEFAULT_PROGRAM_TERMS, values.earningMode, values.spendAmountCents),
      db.prepare("UPDATE merchants SET accent_color = ? WHERE id = ?").bind(values.accentColor, merchant.id),
    ]);
    await db.batch(values.rewardTiers.map((tier, index) => db.prepare(`INSERT INTO program_reward_tiers (id, program_id, threshold, reward_text, sort_order) VALUES (?, ?, ?, ?, ?)`)
      .bind(makeId("tier"), programId, tier.threshold, tier.rewardText, index)));
    return Response.json({ program: { id: programId, ...values, terms: values.terms || DEFAULT_PROGRAM_TERMS } }, { status: 201 });
  } catch (error) {
    return safeApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const merchant = await getMerchant(request);
    if (!merchant) return jsonError("Session expirée.", 401);
    if (!isOwner(merchant)) return jsonError("Seul le propriétaire peut modifier le programme.", 403);
    const values = readProgram(await readJson<ProgramPayload>(request), merchant.accentColor);
    if (!values.name || !values.rewardTiers.length) return jsonError("Le nom de la carte et au moins une récompense sont obligatoires.");

    await ensureSchema();
    const db = getD1();
    const program = await queryFirst<{ id: string }>("SELECT id FROM programs WHERE merchant_id = ?", merchant.id);
    if (!program) return jsonError("Programme introuvable.", 404);
    const progress = await queryFirst<{ highest: number }>("SELECT COALESCE(MAX(points), 0) AS highest FROM memberships WHERE merchant_id = ?", merchant.id);
    if ((progress?.highest ?? 0) >= values.goal) return jsonError(`Le dernier palier doit dépasser la progression actuelle la plus élevée (${progress?.highest ?? 0} points).`);
    await db.batch([
      db.prepare("UPDATE programs SET name = ?, goal = ?, reward_text = ?, terms = ?, earning_mode = ?, spend_amount_cents = ?, updated_at = CURRENT_TIMESTAMP WHERE merchant_id = ?")
        .bind(values.name, values.goal, values.rewardText, values.terms || DEFAULT_PROGRAM_TERMS, values.earningMode, values.spendAmountCents, merchant.id),
      db.prepare("UPDATE merchants SET accent_color = ? WHERE id = ?").bind(values.accentColor, merchant.id),
      db.prepare("UPDATE program_reward_tiers SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE program_id = ?").bind(program.id),
    ]);
    for (const [index, tier] of values.rewardTiers.entries()) {
      await db.prepare(`INSERT INTO program_reward_tiers (id, program_id, threshold, reward_text, sort_order, active)
        VALUES (?, ?, ?, ?, ?, 1)
        ON CONFLICT(program_id, threshold) DO UPDATE SET reward_text = excluded.reward_text, sort_order = excluded.sort_order, active = 1, updated_at = CURRENT_TIMESTAMP`)
        .bind(makeId("tier"), program.id, tier.threshold, tier.rewardText, index).run();
    }
    return Response.json({ ok: true });
  } catch (error) {
    return safeApiError(error);
  }
}
