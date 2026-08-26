import { ensureSchema, getD1, queryFirst } from "../../../../db";
import { createPasswordHash, validOwnerPassword } from "../../../../lib/auth";
import { cleanText, isSameOrigin, jsonError, normalizePhone, readJson, safeApiError, validEmail } from "../../../../lib/http";
import { makeId, sha256 } from "../../../../lib/ids";
import { sendMerchantVerificationEmail } from "../../../../lib/mailer";

type SignupPayload = { firstName?: string; lastName?: string; businessName?: string; email?: string; phone?: string; password?: string; confirmPassword?: string };
type RecentVerification = { lastSentAt: string };

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) return jsonError("Origine de la requête refusée.", 403);
    const payload = await readJson<SignupPayload>(request);
    if (!payload) return jsonError("Les informations envoyées sont invalides.");
    const firstName = cleanText(payload.firstName, 60);
    const lastName = cleanText(payload.lastName, 60);
    const businessName = cleanText(payload.businessName, 80);
    const email = cleanText(payload.email, 160).toLowerCase();
    const phone = payload.phone ? normalizePhone(payload.phone) : null;
    const password = typeof payload.password === "string" ? payload.password : "";
    const confirmPassword = typeof payload.confirmPassword === "string" ? payload.confirmPassword : "";
    if (firstName.length < 2) return jsonError("Indique ton prénom.");
    if (lastName.length < 2) return jsonError("Indique ton nom.");
    if (businessName.length < 2) return jsonError("Indique le nom du commerce.");
    if (!validEmail(email)) return jsonError("Indique un e-mail valide.");
    if (payload.phone && !phone) return jsonError("Indique un numéro de téléphone valide.");
    if (!/^\d{6}$/.test(password)) return jsonError("Choisis un code confidentiel composé de 6 chiffres.");
    if (!validOwnerPassword(password)) return jsonError("Choisis un code moins prévisible, sans suite simple ni répétition.");
    if (password !== confirmPassword) return jsonError("Les deux codes confidentiels ne correspondent pas.");

    await ensureSchema();
    if (await queryFirst<{ id: string }>("SELECT id FROM merchants WHERE email = ?", email)) return jsonError("Un compte existe déjà avec cet e-mail.", 409);
    const recent = await queryFirst<RecentVerification>(`SELECT last_sent_at AS lastSentAt FROM merchant_email_verifications WHERE email = ? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1`, email);
    if (recent && Date.now() - new Date(`${recent.lastSentAt.replace(" ", "T")}Z`).getTime() < 60_000) return jsonError("Un e-mail vient déjà d’être envoyé. Patiente une minute avant de recommencer.", 429);

    const id = makeId("mev");
    const token = `${makeId("verify")}.${crypto.randomUUID()}`;
    const tokenHash = await sha256(token);
    const passwordHash = await createPasswordHash(password);
    const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
    const pending = { firstName, lastName, businessName, email, phone, passwordHash };
    const db = getD1();
    await db.batch([
      db.prepare("DELETE FROM merchant_email_verifications WHERE datetime(expires_at) < datetime('now', '-1 day')"),
      db.prepare("UPDATE merchant_email_verifications SET used_at = CURRENT_TIMESTAMP WHERE email = ? AND used_at IS NULL").bind(email),
      db.prepare(`INSERT INTO merchant_email_verifications (id, email, token_hash, payload_json, expires_at) VALUES (?, ?, ?, ?, ?)`)
        .bind(id, email, tokenHash, JSON.stringify(pending), expiresAt),
    ]);
    try {
      await sendMerchantVerificationEmail({ email, firstName, businessName, verificationUrl: `https://kivli.fr/verify-email?token=${encodeURIComponent(token)}` });
    } catch (error) {
      await db.prepare("DELETE FROM merchant_email_verifications WHERE id = ?").bind(id).run();
      throw error;
    }
    return Response.json({ pending: true, email, expiresInMinutes: 30 }, { status: 202 });
  } catch (error) { return safeApiError(error); }
}
