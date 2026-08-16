import { ensureSchema, getD1, queryFirst } from "../../../../db";
import { getMerchant, isOwner } from "../../../../lib/auth";
import { cleanText, isHexColor, jsonError, readJson, safeApiError } from "../../../../lib/http";
import { DEFAULT_PROGRAM_TERMS } from "../../../../lib/program-style";
import { makeId } from "../../../../lib/ids";

type ProgramPayload = { name?: string; goal?: number; rewardText?: string; terms?: string; accentColor?: string };

function readProgram(payload: ProgramPayload | null, fallbackColor: string) {
  const name = cleanText(payload?.name, 80);
  const rewardText = cleanText(payload?.rewardText, 120);
  const terms = cleanText(payload?.terms, 200);
  const accentColor = isHexColor(payload?.accentColor ?? "") ? payload!.accentColor! : fallbackColor;
  const goal = Math.max(3, Math.min(20, Math.round(Number(payload?.goal) || 10)));
  return { name, rewardText, terms, accentColor, goal };
}

export async function POST(request: Request) {
  try {
    const merchant = await getMerchant(request);
    if (!merchant) return jsonError("Session expirée.", 401);
    if (!isOwner(merchant)) return jsonError("Seul le propriétaire peut créer la carte.", 403);
    const programExists = await queryFirst<{ id: string }>("SELECT id FROM programs WHERE merchant_id = ?", merchant.id);
    if (programExists) return jsonError("Une carte existe déjà pour ce commerce.", 409);

    const values = readProgram(await readJson<ProgramPayload>(request), merchant.accentColor);
    if (!values.name || !values.rewardText) return jsonError("Le nom de la carte et la récompense sont obligatoires.");

    await ensureSchema();
    const db = getD1();
    const programId = makeId("prg");
    await db.batch([
      db.prepare(
        `INSERT INTO programs (id, merchant_id, name, goal, reward_text, terms)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(programId, merchant.id, values.name, values.goal, values.rewardText, values.terms || DEFAULT_PROGRAM_TERMS),
      db.prepare("UPDATE merchants SET accent_color = ? WHERE id = ?").bind(values.accentColor, merchant.id),
    ]);
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
    if (!values.name || !values.rewardText) return jsonError("Le nom de la carte et la récompense sont obligatoires.");

    await ensureSchema();
    const db = getD1();
    await db.batch([
      db.prepare("UPDATE programs SET name = ?, goal = ?, reward_text = ?, terms = ?, updated_at = CURRENT_TIMESTAMP WHERE merchant_id = ?")
        .bind(values.name, values.goal, values.rewardText, values.terms || DEFAULT_PROGRAM_TERMS, merchant.id),
      db.prepare("UPDATE merchants SET accent_color = ? WHERE id = ?").bind(values.accentColor, merchant.id),
    ]);
    return Response.json({ ok: true });
  } catch (error) {
    return safeApiError(error);
  }
}
