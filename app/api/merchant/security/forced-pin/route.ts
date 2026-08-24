import { ensureSchema, getD1 } from "../../../../../db";
import { clearSessionCookie, createPasswordHash, validOwnerPassword } from "../../../../../lib/auth";
import { isSameOrigin, jsonError, readJson, safeApiError } from "../../../../../lib/http";
import {
  clearOwnerDeviceCookie,
  clearOwnerRecoveryCookie,
  ownerRecoveryToken,
} from "../../../../../lib/owner-security";

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) return jsonError("Origine de la requête refusée.", 403);
    const body = await readJson<{ newPin?: string; confirmPin?: string }>(request);
    const newPin = typeof body?.newPin === "string" ? body.newPin.trim() : "";
    const confirmPin = typeof body?.confirmPin === "string" ? body.confirmPin.trim() : "";
    if (!/^\d{6}$/.test(newPin)) return jsonError("Le nouveau code doit contenir exactement 6 chiffres.");
    if (newPin !== confirmPin) return jsonError("Les deux codes confidentiels ne correspondent pas.");
    if (!validOwnerPassword(newPin)) return jsonError("Choisis un code moins prévisible, sans suite simple ni répétition.");

    await ensureSchema();
    const recovery = await ownerRecoveryToken(request);
    if (!recovery) return jsonError("Cette autorisation a expiré. Reprends le lien reçu par e-mail.", 410);
    const db = getD1();
    const claim = await db.prepare(
      `UPDATE owner_security_tokens SET used_at = CURRENT_TIMESTAMP
       WHERE id = ? AND merchant_id = ? AND purpose = 'forced_pin_change'
         AND used_at IS NULL AND datetime(expires_at) > CURRENT_TIMESTAMP`,
    ).bind(recovery.id, recovery.merchantId).run();
    if (Number(claim.meta.changes ?? 0) !== 1) {
      return jsonError("Cette autorisation a expiré ou a déjà été utilisée.", 410);
    }

    await db.batch([
      db.prepare("UPDATE merchants SET pin_hash = ?, owner_pin_change_required = 0 WHERE id = ? AND owner_pin_change_required = 1")
        .bind(await createPasswordHash(newPin), recovery.merchantId),
      db.prepare(
        "DELETE FROM employee_sessions WHERE session_id IN (SELECT id FROM merchant_sessions WHERE merchant_id = ? AND role = 'owner')",
      ).bind(recovery.merchantId),
      db.prepare("DELETE FROM merchant_sessions WHERE merchant_id = ? AND role = 'owner'").bind(recovery.merchantId),
      db.prepare(
        "UPDATE owner_trusted_devices SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP) WHERE merchant_id = ?",
      ).bind(recovery.merchantId),
      db.prepare(
        "UPDATE owner_security_tokens SET used_at = COALESCE(used_at, CURRENT_TIMESTAMP) WHERE merchant_id = ?",
      ).bind(recovery.merchantId),
    ]);
    const headers = new Headers();
    headers.append("Set-Cookie", clearSessionCookie(request.url));
    headers.append("Set-Cookie", clearOwnerDeviceCookie());
    headers.append("Set-Cookie", clearOwnerRecoveryCookie());
    return Response.json({ ok: true, reauthenticate: true }, { headers });
  } catch (error) {
    return safeApiError(error);
  }
}
