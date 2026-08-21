import { ensureSchema, getD1, queryFirst } from "../../../../../db";
import { cleanText, jsonError, readJson, safeApiError } from "../../../../../lib/http";
import { MARKETING_CONSENT_VERSION } from "../../../../../lib/legal";

type CardOwner = { customerId: string; marketingConsent: number };

export async function PATCH(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    const body = await readJson<{ action?: string }>(request);
    const action = cleanText(body?.action, 40);
    if (action !== "withdrawMarketing") return jsonError("Action non reconnue.");
    await ensureSchema();
    const owner = await queryFirst<CardOwner>(`SELECT c.id AS customerId, c.marketing_consent AS marketingConsent FROM memberships mb JOIN customers c ON c.id = mb.customer_id WHERE mb.code = ?`, code.toUpperCase());
    if (!owner) return jsonError("Carte introuvable.", 404);
    if (owner.marketingConsent) {
      await getD1().prepare(`UPDATE customers SET marketing_consent = 0, marketing_withdrawn_at = ?, marketing_consent_version = COALESCE(marketing_consent_version, ?) WHERE id = ?`)
        .bind(new Date().toISOString(), MARKETING_CONSENT_VERSION, owner.customerId).run();
    }
    return Response.json({ ok: true, marketingConsent: false });
  } catch (error) {
    return safeApiError(error);
  }
}
