import { ensureSchema, getD1, queryFirst } from "../../../../../db";
import { cleanText, isSameOrigin, jsonError, readJson, safeApiError, validEmail } from "../../../../../lib/http";
import { makeId, sha256 } from "../../../../../lib/ids";
import { sendMerchantVerificationEmail } from "../../../../../lib/mailer";

type Pending = { id: string; payloadJson: string; lastSentAt: string };
type PendingData = { firstName: string; businessName: string };

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) return jsonError("Origine de la requête refusée.", 403);
    const body = await readJson<{ email?: string }>(request);
    const email = cleanText(body?.email, 160).toLowerCase();
    if (!validEmail(email)) return jsonError("Indique un e-mail valide.");
    const pending = await queryFirst<Pending>(`SELECT id, payload_json AS payloadJson, last_sent_at AS lastSentAt FROM merchant_email_verifications WHERE email = ? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1`, email);
    if (!pending) return Response.json({ ok: true });
    if (Date.now() - new Date(`${pending.lastSentAt.replace(" ", "T")}Z`).getTime() < 60_000) return jsonError("Patiente une minute avant de renvoyer l’e-mail.", 429);
    const data = JSON.parse(pending.payloadJson) as PendingData;
    const id = makeId("mev");
    const token = `${makeId("verify")}.${crypto.randomUUID()}`;
    const tokenHash = await sha256(token);
    const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
    await ensureSchema();
    const db = getD1();
    await db.batch([
      db.prepare("UPDATE merchant_email_verifications SET used_at = CURRENT_TIMESTAMP WHERE id = ?").bind(pending.id),
      db.prepare(`INSERT INTO merchant_email_verifications (id, email, token_hash, payload_json, expires_at) VALUES (?, ?, ?, ?, ?)`).bind(id, email, tokenHash, pending.payloadJson, expiresAt),
    ]);
    try {
      await sendMerchantVerificationEmail({ email, firstName: data.firstName, businessName: data.businessName, verificationUrl: `https://kivli.fr/verify-email?token=${encodeURIComponent(token)}` });
    } catch (error) {
      await db.batch([
        db.prepare("DELETE FROM merchant_email_verifications WHERE id = ?").bind(id),
        db.prepare("UPDATE merchant_email_verifications SET used_at = NULL WHERE id = ?").bind(pending.id),
      ]);
      throw error;
    }
    return Response.json({ ok: true });
  } catch (error) { return safeApiError(error); }
}
