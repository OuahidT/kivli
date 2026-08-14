import { ensureSchema, getD1, queryFirst } from "../../../../db";
import { createSession, verifyPin } from "../../../../lib/auth";
import { cleanText, jsonError, readJson, safeApiError, validEmail } from "../../../../lib/http";
import { sha256 } from "../../../../lib/ids";

type LoginPayload = { identifier?: string; email?: string; pin?: string };
type MerchantRow = {
  id: string;
  businessName: string;
  slug: string;
  email: string;
  pinHash: string;
  accentColor: string;
};
type EmployeeRow = MerchantRow & {
  employeeId: string;
  employeeName: string;
  employeePinHash: string;
};
type LoginAttemptRow = { failedCount: number; windowStartedAt: string; lockedUntil: string | null };

const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;

function asDate(value: string | null) {
  if (!value) return null;
  return new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
}

async function attemptKey(value: string) {
  return sha256(`kivli-login:${value}`);
}

async function getActiveLock(keys: string[]) {
  for (const key of keys) {
    const row = await queryFirst<LoginAttemptRow>(
      `SELECT failed_count AS failedCount, window_started_at AS windowStartedAt, locked_until AS lockedUntil
       FROM login_attempts WHERE key_hash = ?`,
      key,
    );
    const lockedUntil = asDate(row?.lockedUntil ?? null);
    if (lockedUntil && lockedUntil.getTime() > Date.now()) return lockedUntil;
  }
  return null;
}

async function recordFailure(key: string, limit: number) {
  const row = await queryFirst<LoginAttemptRow>(
    `SELECT failed_count AS failedCount, window_started_at AS windowStartedAt, locked_until AS lockedUntil
     FROM login_attempts WHERE key_hash = ?`,
    key,
  );
  const now = new Date();
  const windowStart = asDate(row?.windowStartedAt ?? null);
  const inWindow = windowStart && now.getTime() - windowStart.getTime() < WINDOW_MS;
  const failedCount = inWindow ? (row?.failedCount ?? 0) + 1 : 1;
  const lockedUntil = failedCount >= limit ? new Date(now.getTime() + LOCK_MS).toISOString() : null;
  await ensureSchema();
  await getD1().prepare(
    `INSERT INTO login_attempts (key_hash, failed_count, window_started_at, locked_until, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(key_hash) DO UPDATE SET failed_count = excluded.failed_count,
       window_started_at = excluded.window_started_at, locked_until = excluded.locked_until,
       updated_at = excluded.updated_at`,
  ).bind(key, failedCount, inWindow ? row!.windowStartedAt : now.toISOString(), lockedUntil, now.toISOString()).run();
}

export async function POST(request: Request) {
  try {
    const payload = await readJson<LoginPayload>(request);
    const identifier = cleanText(payload?.identifier ?? payload?.email, 160);
    const normalizedIdentifier = identifier.toLowerCase();
    const pin = cleanText(payload?.pin, 12);
    const identifierIsEmail = validEmail(normalizedIdentifier);
    const identifierIsCode = /^[a-z0-9-]{4,40}$/i.test(identifier);
    if ((!identifierIsEmail && !identifierIsCode) || !/^\d{6}$/.test(pin)) {
      return jsonError("Identifiant ou code d’accès incorrect.", 401);
    }

    const network = request.headers.get("cf-connecting-ip")
      ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? "unknown";
    const networkKey = await attemptKey(`${normalizedIdentifier}:${network}`);
    const accountKey = await attemptKey(`${normalizedIdentifier}:account`);
    const lockedUntil = await getActiveLock([networkKey, accountKey]);
    if (lockedUntil) {
      const seconds = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 1000));
      return Response.json(
        { error: "Trop de tentatives. Réessaie dans quelques minutes." },
        { status: 429, headers: { "Retry-After": String(seconds) } },
      );
    }

    const [owner, employee] = await Promise.all([
      identifierIsEmail
        ? queryFirst<MerchantRow>(
          `SELECT id, business_name AS businessName, slug, email, pin_hash AS pinHash,
            accent_color AS accentColor FROM merchants WHERE email = ?`,
          normalizedIdentifier,
        )
        : Promise.resolve(null),
      queryFirst<EmployeeRow>(
        `SELECT m.id, m.business_name AS businessName, m.slug, m.email, m.pin_hash AS pinHash,
          m.accent_color AS accentColor, e.id AS employeeId, e.display_name AS employeeName,
          e.pin_hash AS employeePinHash
         FROM employees e JOIN merchants m ON m.id = e.merchant_id
         WHERE e.active = 1 AND (LOWER(e.email) = ? OR UPPER(e.login_code) = ?)
         LIMIT 1`,
        normalizedIdentifier,
        identifier.toUpperCase(),
      ),
    ]);
    const ownerMatch = owner ? await verifyPin(pin, owner.pinHash) : false;
    const employeeMatch = employee
      ? await verifyPin(pin, employee.employeePinHash)
      : false;
    const merchant = ownerMatch ? owner : employeeMatch ? employee : null;
    if (!merchant) {
      await recordFailure(networkKey, 5);
      await recordFailure(accountKey, 12);
      return jsonError("Identifiant ou code d’accès incorrect.", 401);
    }

    const adminState = await queryFirst<{ status: string }>(
      "SELECT status FROM merchant_admin_state WHERE merchant_id = ?",
      merchant.id,
    );
    if (adminState?.status === "suspended") {
      return jsonError("Ce compte est temporairement suspendu. Contacte l’assistance Kivli.", 403);
    }

    await ensureSchema();
    const cleanup = [
      getD1().prepare("DELETE FROM login_attempts WHERE key_hash IN (?, ?)").bind(networkKey, accountKey),
    ];
    await getD1().batch(cleanup);

    const role = ownerMatch ? "owner" : "employee";
    const employeeId = role === "employee" ? employee!.employeeId : null;
    const cookie = await createSession(merchant.id, request.url, role, employeeId);
    const safeMerchant = {
      id: merchant.id,
      businessName: merchant.businessName,
      slug: merchant.slug,
      email: merchant.email,
      accentColor: merchant.accentColor,
    };
    return Response.json(
      { merchant: { ...safeMerchant, role, employeeName: role === "employee" ? employee!.employeeName : null } },
      { headers: { "Set-Cookie": cookie } },
    );
  } catch (error) {
    return safeApiError(error);
  }
}
