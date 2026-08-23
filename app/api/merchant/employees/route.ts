import { ensureSchema, getD1, queryFirst } from "../../../../db";
import { createPinHash, getMerchant, isOwner } from "../../../../lib/auth";
import { cleanText, isSameOrigin, jsonError, readJson, safeApiError, validEmail } from "../../../../lib/http";
import { makeCode, makeId, slugify } from "../../../../lib/ids";

type EmployeePayload = {
  action?: "set_active" | "reset_pin";
  employeeId?: string;
  displayName?: string;
  email?: string;
  active?: boolean;
};

type EmployeeRow = {
  id: string;
  displayName: string;
  email: string | null;
  loginCode: string;
  active: number;
  mustChangePin: number;
  createdAt: string;
};

function generateTemporaryPin() {
  const value = crypto.getRandomValues(new Uint32Array(1))[0];
  return String(100000 + (value % 900000));
}

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
        active, must_change_pin AS mustChangePin, created_at AS createdAt
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
    if (!isSameOrigin(request)) return jsonError("Origine de la requête refusée.", 403);
    const merchant = await getMerchant(request);
    if (!merchant) return jsonError("Session expirée.", 401);
    if (!isOwner(merchant)) return jsonError("Accès réservé au propriétaire.", 403);

    const payload = await readJson<EmployeePayload>(request);
    const displayName = cleanText(payload?.displayName, 60);
    const email = cleanText(payload?.email, 160).toLowerCase();
    if (displayName.length < 2) return jsonError("Indique le prénom de l’employé.");
    if (email && !validEmail(email)) return jsonError("L’adresse e-mail de l’employé est invalide.");

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
    const temporaryPin = generateTemporaryPin();
    await ensureSchema();
    await getD1().prepare(
      `INSERT INTO employees (id, merchant_id, display_name, email, login_code, pin_hash, must_change_pin)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
    ).bind(employeeId, merchant.id, displayName, email || null, loginCode, await createPinHash(temporaryPin)).run();
    return Response.json(
      { employee: { id: employeeId, displayName, email: email || null, loginCode, temporaryPin, active: 1, mustChangePin: 1 } },
      { status: 201 },
    );
  } catch (error) {
    return safeApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    if (!isSameOrigin(request)) return jsonError("Origine de la requête refusée.", 403);
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
      const temporaryPin = generateTemporaryPin();
      await getD1().prepare(
        "UPDATE employees SET pin_hash = ?, must_change_pin = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND merchant_id = ?",
      ).bind(await createPinHash(temporaryPin), employeeId, merchant.id).run();
      await revokeEmployeeSessions(employeeId);
      return Response.json({ ok: true, temporaryPin });
    }

    return jsonError("Action inconnue.");
  } catch (error) {
    return safeApiError(error);
  }
}
