import { ensureSchema, getD1, queryFirst } from "../../../../../db";
import { createSessionDetails } from "../../../../../lib/auth";
import { cleanText, isSameOrigin, jsonError, readJson, safeApiError } from "../../../../../lib/http";
import { makeCode, makeId, sha256, slugify } from "../../../../../lib/ids";
import { registerOrRecognizeOwnerDevice } from "../../../../../lib/owner-security";

type PendingSignup = { id: string; payloadJson: string; expiresAt: string; usedAt: string | null };
type PendingData = { firstName: string; lastName: string; businessName: string; email: string; phone: string | null; passwordHash: string };

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) return jsonError("Origine de la requête refusée.", 403);
    const body = await readJson<{ token?: string }>(request);
    const token = cleanText(body?.token, 240);
    if (!token) return jsonError("Lien de confirmation invalide.");
    const pending = await queryFirst<PendingSignup>(`SELECT id, payload_json AS payloadJson, expires_at AS expiresAt, used_at AS usedAt FROM merchant_email_verifications WHERE token_hash = ?`, await sha256(token));
    if (!pending || pending.usedAt) return jsonError("Ce lien de confirmation n’est plus valide.", 410);
    if (new Date(pending.expiresAt).getTime() <= Date.now()) return jsonError("Ce lien a expiré. Demande un nouvel e-mail.", 410);
    const data = JSON.parse(pending.payloadJson) as PendingData;
    if (await queryFirst<{ id: string }>("SELECT id FROM merchants WHERE email = ?", data.email)) return jsonError("Un compte existe déjà avec cet e-mail.", 409);
    await ensureSchema();
    const merchantId = makeId("mer");
    const slug = `${slugify(data.businessName)}-${makeCode(4).toLowerCase()}`;
    const db = getD1();
    await db.batch([
      db.prepare(`INSERT INTO merchants (id, first_name, last_name, business_name, slug, email, phone, pin_hash, email_verified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
        .bind(merchantId, data.firstName, data.lastName, data.businessName, slug, data.email, data.phone, data.passwordHash),
      db.prepare("UPDATE merchant_email_verifications SET used_at = CURRENT_TIMESTAMP WHERE id = ? AND used_at IS NULL").bind(pending.id),
    ]);
    const session = await createSessionDetails(merchantId, request.url);
    let deviceCookie: string | null = null;
    try {
      deviceCookie = (await registerOrRecognizeOwnerDevice(request, {
        id: merchantId,
        email: data.email,
        firstName: data.firstName,
        businessName: data.businessName,
      })).cookie;
    } catch (error) {
      await db.prepare("DELETE FROM merchant_sessions WHERE id = ? AND merchant_id = ?")
        .bind(session.sessionId, merchantId)
        .run();
      throw error;
    }
    const headers = new Headers();
    headers.append("Set-Cookie", session.cookie);
    if (deviceCookie) headers.append("Set-Cookie", deviceCookie);
    return Response.json({ ok: true }, { status: 201, headers });
  } catch (error) { return safeApiError(error); }
}
