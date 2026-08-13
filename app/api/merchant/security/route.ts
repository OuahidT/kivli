import { ensureSchema, getD1, queryFirst } from "../../../../db";
import {
  clearSessionCookie,
  createPinHash,
  getMerchant,
  isOwner,
  verifyPin,
} from "../../../../lib/auth";
import { cleanText, jsonError, readJson, safeApiError } from "../../../../lib/http";

type SecurityPayload = {
  action?: "change_owner_pin";
  currentPin?: string;
  newPin?: string;
};

type SecurityRow = { pinHash: string };

export async function PATCH(request: Request) {
  try {
    const merchant = await getMerchant(request);
    if (!merchant) return jsonError("Session expirée.", 401);
    if (!isOwner(merchant)) return jsonError("Seul le propriétaire peut modifier les accès.", 403);

    const payload = await readJson<SecurityPayload>(request);
    const action = payload?.action;
    const currentPin = cleanText(payload?.currentPin, 12);
    const newPin = cleanText(payload?.newPin, 12);
    if (!/^\d{6}$/.test(currentPin)) return jsonError("Saisis ton code propriétaire actuel.");

    const security = await queryFirst<SecurityRow>(
      `SELECT pin_hash AS pinHash FROM merchants WHERE id = ?`,
      merchant.id,
    );
    if (!security || !(await verifyPin(merchant.id, currentPin, security.pinHash))) {
      return jsonError("Le code propriétaire actuel est incorrect.", 401);
    }

    await ensureSchema();
    const db = getD1();

    if (action === "change_owner_pin") {
      if (!/^\d{6}$/.test(newPin)) return jsonError("Le nouveau code doit contenir 6 chiffres.");
      if (await verifyPin(merchant.id, newPin, security.pinHash)) {
        return jsonError("Choisis un nouveau code différent de l’ancien.");
      }
      await db.batch([
        db.prepare("UPDATE merchants SET pin_hash = ? WHERE id = ?").bind(await createPinHash(newPin), merchant.id),
        db.prepare(
          "DELETE FROM employee_sessions WHERE session_id IN (SELECT id FROM merchant_sessions WHERE merchant_id = ?)",
        ).bind(merchant.id),
        db.prepare("DELETE FROM merchant_sessions WHERE merchant_id = ?").bind(merchant.id),
      ]);
      return Response.json(
        { ok: true, reauthenticate: true },
        { headers: { "Set-Cookie": clearSessionCookie(request.url) } },
      );
    }

    return jsonError("Action de sécurité inconnue.");
  } catch (error) {
    return safeApiError(error);
  }
}
