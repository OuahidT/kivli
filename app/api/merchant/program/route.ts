import { ensureSchema, getD1 } from "../../../../db";
import { getMerchant, isOwner } from "../../../../lib/auth";
import { cleanText, jsonError, readJson, safeApiError } from "../../../../lib/http";

type ProgramPayload = { name?: string; goal?: number; rewardText?: string; terms?: string; accentColor?: string };

export async function PATCH(request: Request) {
  try {
    const merchant = await getMerchant(request);
    if (!merchant) return jsonError("Session expirée.", 401);
    if (!isOwner(merchant)) return jsonError("Seul le propriétaire peut modifier le programme.", 403);
    const payload = await readJson<ProgramPayload>(request);
    const name = cleanText(payload?.name, 80);
    const rewardText = cleanText(payload?.rewardText, 120);
    const terms = cleanText(payload?.terms, 200);
    const goal = Math.max(3, Math.min(20, Math.round(Number(payload?.goal) || 10)));
    if (!name || !rewardText) return jsonError("Le nom du programme et la récompense sont obligatoires.");

    await ensureSchema();
    await getD1()
      .prepare("UPDATE programs SET name = ?, goal = ?, reward_text = ?, terms = ?, updated_at = CURRENT_TIMESTAMP WHERE merchant_id = ?")
      .bind(name, goal, rewardText, terms || "Une visite par jour et par client.", merchant.id)
      .run();
    return Response.json({ ok: true });
  } catch (error) {
    return safeApiError(error);
  }
}
