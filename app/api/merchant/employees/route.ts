import { ensureSchema, getD1, queryFirst } from "../../../../db";
import { createPinHash, getMerchant, isOwner } from "../../../../lib/auth";
import { cleanText, jsonError, readJson, safeApiError, validEmail } from "../../../../lib/http";
import { makeCode, makeId, slugify } from "../../../../lib/ids";

type EmployeePayload = {
  action?: "set_active" | "reset_pin";
  employeeId?: string;
  displayName?: string;
  email?: string;
  pin?: string;
  active?: boolean;
};

type EmployeeRow = {
  id: string;
  displayName: string;
  email: string | null;
  loginCode: string;
  active: number;
  createdAt: string;
};

async function revokeEmployeeSessions(employeeId: string) {
  const db = getD1();
  await db.batch([
    db.prepare(
      "DELETE FROM merchant_sessions WHERE id IN (SELECT session_id FROM employee_sessions WHERE employee_id = ?)",
    ).bind(employeeId),
    db.prepare("DELETE FROM employee_sessions WHERE employee_id = ?").bind(employeeId),
  ]);
}

export async function GET(request: Request) {
  try {
    const merchant = await getMerchant(request);
    if (!merchant) return jsonError("Session expirée.", 401);
    if (!isOwner(merchant)) return jsonError("Accès réservé au propriétaire.", 403);
    const { queryAll } = await import("../../../../db");
    const employees = await queryAll<EmployeeRow>(
      `SELECT id, display_name AS displayName, email, login_code AS loginCode,
        active, created_at AS createdAt
       FROM employees WHERE merchant_id = ? ORDER BY active DESC, display_name`,
      merchant.id,
    );
    return Response.json({ employees });
  } catch (error) {
    return safeApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const merchant = await getMerchant(request);
    if (!merchant) return jsonError("Session expirée.", 401);
    if (!isOwner(merchant)) return jsonError("Accès réservé au propriétaire.", 403);

    const payload = await readJson<EmployeePayload>(request);
    const displayName = cleanText(payload?.displayName, 60);
    const email = cleanText(payload?.email, 160).toLowerCase();
    const pin = cleanText(payload?.pin, 12);
    if (displayName.length < 2) return jsonError("Indique le prénom de l’employé.");
    if (email && !validEmail(email)) return jsonError("L’adresse e-mail de l’employé est invalide.");
    if (!/^\d{6}$/.test(pin)) return jsonError("Le code employé doit contenir 6 chiffres.");

    if (email) {
      const duplicate = await queryFirst<{ email: string }>(
        `SELECT email FROM merchants WHERE LOWER(email) = ?
         UNION ALL SELECT email FROM employees WHERE LOWER(email) = ? LIMIT 1`,
        email,
        email,
      );
      if (duplicate) return jsonError("Cette adresse e-mail est déjà utilisée.", 409);
    }

    const employeeId = makeId("emp");
    const prefix = slugify(displayName).replaceAll("-", "").toUpperCase().slice(0, 10) || "EQUIPE";
    const loginCode = `${prefix}-${makeCode(4)}`;
    await ensureSchema();
    await getD1().prepare(
      `INSERT INTO employees (id, merchant_id, display_name, email, login_code, pin_hash)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(employeeId, merchant.id, displayName, email || null, loginCode, await createPinHash(pin)).run();
    return Response.json(
      { employee: { id: employeeId, displayName, email: email || null, loginCode, active: 1 } },
      { status: 201 },
    );
  } catch (error) {
    return safeApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const merchant = await getMerchant(request);
    if (!merchant) return jsonError("Session expirée.", 401);
    if (!isOwner(merchant)) return jsonError("Accès réservé au propriétaire.", 403);

    const payload = await readJson<EmployeePayload>(request);
    const employeeId = cleanText(payload?.employeeId, 80);
    const employee = await queryFirst<{ id: string }>(
      "SELECT id FROM employees WHERE id = ? AND merchant_id = ?",
      employeeId,
      merchant.id,
    );
    if (!employee) return jsonError("Employé introuvable.", 404);

    await ensureSchema();
    if (payload?.action === "set_active") {
      const active = payload.active === true;
      await getD1().prepare(
        "UPDATE employees SET active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND merchant_id = ?",
      ).bind(active ? 1 : 0, employeeId, merchant.id).run();
      if (!active) await revokeEmployeeSessions(employeeId);
      return Response.json({ ok: true, active });
    }

    if (payload?.action === "reset_pin") {
      const pin = cleanText(payload.pin, 12);
      if (!/^\d{6}$/.test(pin)) return jsonError("Le nouveau code doit contenir 6 chiffres.");
      await getD1().prepare(
        "UPDATE employees SET pin_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND merchant_id = ?",
      ).bind(await createPinHash(pin), employeeId, merchant.id).run();
      await revokeEmployeeSessions(employeeId);
      return Response.json({ ok: true });
    }

    return jsonError("Action inconnue.");
  } catch (error) {
    return safeApiError(error);
  }
}
