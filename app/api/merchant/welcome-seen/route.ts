import { getD1, ensureSchema } from "../../../../db";
import { getMerchant, isOwner } from "../../../../lib/auth";
import { isSameOrigin, jsonError, safeApiError } from "../../../../lib/http";

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) return jsonError("Origine de la requête refusée.", 403);
    const merchant = await getMerchant(request);
    if (!merchant) return jsonError("Connecte-toi pour continuer.", 401);
    if (!isOwner(merchant)) return jsonError("Action réservée au propriétaire.", 403);
    await ensureSchema();
    await getD1().prepare("UPDATE merchants SET welcome_seen_at = CURRENT_TIMESTAMP WHERE id = ? AND welcome_seen_at IS NULL").bind(merchant.id).run();
    return Response.json({ ok: true });
  } catch (error) {
    return safeApiError(error);
  }
}
