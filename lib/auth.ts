import { queryFirst } from "../db";
import { makeId, sha256 } from "./ids";

const COOKIE_NAME = "tampo_session";
const SESSION_DAYS = 30;

export type MerchantIdentity = {
  id: string;
  businessName: string;
  slug: string;
  email: string;
  accentColor: string;
  role: "owner" | "employee";
  employeeId: string | null;
  employeeName: string | null;
};

const PIN_ITERATIONS = 100_000;

export async function hashPin(merchantId: string, pin: string) {
  return sha256(`tampo:${merchantId}:${pin}`);
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string) {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2) return null;
  return new Uint8Array(value.match(/.{2}/g)!.map((pair) => Number.parseInt(pair, 16)));
}

function safeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function derivePin(pin: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const result = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    256,
  );
  return new Uint8Array(result);
}

export async function createPinHash(pin: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await derivePin(pin, salt, PIN_ITERATIONS);
  return `pbkdf2$${PIN_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(derived)}`;
}

export async function verifyPin(merchantId: string, pin: string, storedHash: string) {
  if (!storedHash.startsWith("pbkdf2$")) {
    const legacy = await hashPin(merchantId, pin);
    return safeEqual(new TextEncoder().encode(legacy), new TextEncoder().encode(storedHash));
  }
  const [, iterationValue, saltValue, expectedValue] = storedHash.split("$");
  const iterations = Number(iterationValue);
  const salt = hexToBytes(saltValue ?? "");
  const expected = hexToBytes(expectedValue ?? "");
  if (!salt || !expected || !Number.isInteger(iterations) || iterations < 100_000) return false;
  return safeEqual(await derivePin(pin, salt, iterations), expected);
}

function readCookie(request: Request, name: string) {
  const raw = request.headers.get("cookie") ?? "";
  const item = raw.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : null;
}

export async function createSession(
  merchantId: string,
  requestUrl: string,
  role: MerchantIdentity["role"] = "owner",
  employeeId: string | null = null,
) {
  const token = `${makeId("sess")}.${crypto.randomUUID()}`;
  const tokenHash = await sha256(token);
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
  const sessionId = makeId("ms");
  const { getD1, ensureSchema } = await import("../db");
  await ensureSchema();
  const db = getD1();
  const statements = [
    db.prepare("INSERT INTO merchant_sessions (id, merchant_id, token_hash, role, expires_at) VALUES (?, ?, ?, ?, ?)")
      .bind(sessionId, merchantId, tokenHash, role, expires.toISOString()),
  ];
  if (role === "employee" && employeeId) {
    statements.push(
      db.prepare("INSERT INTO employee_sessions (session_id, employee_id) VALUES (?, ?)")
        .bind(sessionId, employeeId),
    );
  }
  await db.batch(statements);
  const secure = new URL(requestUrl).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}${secure}`;
}

export async function getMerchant(request: Request): Promise<MerchantIdentity | null> {
  const token = readCookie(request, COOKIE_NAME);
  if (!token) return null;
  const tokenHash = await sha256(token);
  return queryFirst<MerchantIdentity>(
    `SELECT m.id, m.business_name AS businessName, m.slug, m.email, m.accent_color AS accentColor,
       CASE WHEN s.role = 'employee' THEN 'employee' ELSE 'owner' END AS role,
       es.employee_id AS employeeId, e.display_name AS employeeName
     FROM merchant_sessions s
     JOIN merchants m ON m.id = s.merchant_id
     LEFT JOIN merchant_admin_state mas ON mas.merchant_id = m.id
     LEFT JOIN employee_sessions es ON es.session_id = s.id
     LEFT JOIN employees e ON e.id = es.employee_id AND e.merchant_id = m.id AND e.active = 1
     WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP
       AND COALESCE(mas.status, 'active') = 'active'
       AND (s.role = 'owner' OR (s.role = 'employee' AND e.id IS NOT NULL))`,
    tokenHash,
  );
}

export async function destroySession(request: Request) {
  const token = readCookie(request, COOKIE_NAME);
  if (!token) return;
  const tokenHash = await sha256(token);
  const { ensureSchema, getD1 } = await import("../db");
  await ensureSchema();
  const db = getD1();
  await db.batch([
    db.prepare(
      "DELETE FROM employee_sessions WHERE session_id IN (SELECT id FROM merchant_sessions WHERE token_hash = ?)",
    ).bind(tokenHash),
    db.prepare("DELETE FROM merchant_sessions WHERE token_hash = ?").bind(tokenHash),
  ]);
}

export function isOwner(merchant: MerchantIdentity | null): merchant is MerchantIdentity & { role: "owner" } {
  return merchant?.role === "owner";
}

export function clearSessionCookie(requestUrl: string) {
  const secure = new URL(requestUrl).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
}
