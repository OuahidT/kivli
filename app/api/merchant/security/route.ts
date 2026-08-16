import { ensureSchema, getD1, queryFirst } from "../../../../db";
import {
  clearSessionCookie,
  createPasswordHash,
  createPinHash,
  getMerchant,
  isOwner,
  validOwnerPassword,
  verifyPassword,
  verifyPin,
} from "../../../../lib/auth";
import { jsonError, readJson, safeApiError } from "../../../../lib/http";

type SecurityPayload = {
  action?: "change_owner_password" | "change_employee_pin";
  currentPassword?: string;
  newPassword?: string;
  currentPin?: string;
  newPin?: string;
};

type SecurityRow = { pinHash: string };

export async function PATCH(request: Request) {
  try {
    const merchant = await getMerchant(request);
    if (!merchant) return jsonError("Session expirée.", 401);

    const payload = await readJson<SecurityPayload>(request);
    const action = payload?.action;
    await ensureSchema();
    const db = getD1();

    if (action === "change_employee_pin") {
      if (merchant.role !== "employee" || !merchant.employeeId) {
        return jsonError("Cet accès est réservé aux employés.", 403);
      }
      const currentPin = typeof payload?.currentPin === "string" ? payload.currentPin.slice(0, 12) : "";
      const newPin = typeof payload?.newPin === "string" ? payload.newPin.slice(0, 12) : "";
      if (!/^\d{6}$/.test(currentPin) || !/^\d{6}$/.test(newPin)) {
        return jsonError("Les deux codes PIN doivent contenir exactement 6 chiffres.");
      }
      const employee = await queryFirst<SecurityRow>(
        "SELECT pin_hash AS pinHash FROM employees WHERE id = ? AND merchant_id = ? AND active = 1",
        merchant.employeeId,
        merchant.id,
      );
      if (!employee || !(await verifyPin(currentPin, employee.pinHash))) {
        return jsonError("Le code PIN actuel est incorrect.", 401);
      }
      if (await verifyPin(newPin, employee.pinHash)) {
        return jsonError("Choisis un code PIN différent de l’ancien.");
      }
      await db.prepare(
        "UPDATE employees SET pin_hash = ?, must_change_pin = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND merchant_id = ?",
      ).bind(await createPinHash(newPin), merchant.employeeId, merchant.id).run();
      return Response.json({ ok: true });
    }

    if (!isOwner(merchant)) return jsonError("Seul le propriétaire peut modifier ce mot de passe.", 403);
    const currentPassword = typeof payload?.currentPassword === "string" ? payload.currentPassword.slice(0, 128) : "";
    const newPassword = typeof payload?.newPassword === "string" ? payload.newPassword.slice(0, 128) : "";
    if (!currentPassword) return jsonError("Saisis ton mot de passe actuel.");

    const security = await queryFirst<SecurityRow>(
      `SELECT pin_hash AS pinHash FROM merchants WHERE id = ?`,
      merchant.id,
    );
    if (!security || !(await verifyPassword(currentPassword, security.pinHash))) {
      return jsonError("Le mot de passe actuel est incorrect.", 401);
    }

    if (action === "change_owner_password") {
      if (!validOwnerPassword(newPassword)) {
        return jsonError("Le nouveau mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule et un chiffre.");
      }
      if (await verifyPassword(newPassword, security.pinHash)) {
        return jsonError("Choisis un nouveau mot de passe différent de l’ancien.");
      }
      await db.batch([
        db.prepare("UPDATE merchants SET pin_hash = ? WHERE id = ?").bind(await createPasswordHash(newPassword), merchant.id),
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
