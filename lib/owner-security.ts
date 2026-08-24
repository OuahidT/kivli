import { ensureSchema, getD1, queryFirst } from "../db";
import { readCookie } from "./auth";
import { makeId, sha256 } from "./ids";
import { sendOwnerNewDeviceEmail } from "./mailer";

export const OWNER_DEVICE_COOKIE = "__Host-kivli_owner_device";
export const OWNER_RECOVERY_COOKIE = "__Host-kivli_owner_recovery";
const DEVICE_DAYS = 180;
const INCIDENT_TOKEN_HOURS = 24;
const RECOVERY_TOKEN_MINUTES = 20;

type TrustedDeviceRow = { id: string; merchantId: string };

function randomToken(prefix: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `${prefix}.${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}

function deviceLabel(request: Request) {
  const agent = request.headers.get("user-agent") ?? "";
  const device = /iPhone/i.test(agent) ? "iPhone"
    : /iPad/i.test(agent) ? "iPad"
      : /Android/i.test(agent) ? "Appareil Android"
        : /Windows/i.test(agent) ? "Ordinateur Windows"
          : /Macintosh|Mac OS/i.test(agent) ? "Mac"
            : /Linux/i.test(agent) ? "Ordinateur Linux"
              : "Nouvel appareil";
  const browser = /Edg\//i.test(agent) ? "Edge"
    : /CriOS|Chrome\//i.test(agent) ? "Chrome"
      : /FxiOS|Firefox\//i.test(agent) ? "Firefox"
        : /Safari\//i.test(agent) ? "Safari"
          : null;
  return browser ? `${device} · ${browser}` : device;
}

function countryLabel(request: Request) {
  const code = (request.headers.get("cf-ipcountry") ?? "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || code === "XX") return null;
  try {
    return new Intl.DisplayNames(["fr"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function secureCookie(name: string, value: string, maxAge: number) {
  return `${name}=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

export function clearOwnerDeviceCookie() {
  return secureCookie(OWNER_DEVICE_COOKIE, "", 0);
}

export function clearOwnerRecoveryCookie() {
  return secureCookie(OWNER_RECOVERY_COOKIE, "", 0);
}

export async function registerOrRecognizeOwnerDevice(request: Request, merchant: {
  id: string;
  email: string;
  firstName?: string;
  businessName: string;
}) {
  await ensureSchema();
  const db = getD1();
  const existingToken = readCookie(request, OWNER_DEVICE_COOKIE);
  if (existingToken) {
    const existing = await queryFirst<TrustedDeviceRow>(
      `SELECT id, merchant_id AS merchantId FROM owner_trusted_devices
       WHERE token_hash = ? AND merchant_id = ? AND revoked_at IS NULL
         AND datetime(expires_at) > CURRENT_TIMESTAMP`,
      await sha256(existingToken),
      merchant.id,
    );
    if (existing) {
      await db.prepare("UPDATE owner_trusted_devices SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ? AND merchant_id = ?")
        .bind(existing.id, merchant.id)
        .run();
      return { recognized: true, cookie: null as string | null };
    }
  }

  const deviceToken = randomToken("device");
  const incidentToken = randomToken("incident");
  const deviceId = makeId("otd");
  const tokenId = makeId("ost");
  const expiresAt = new Date(Date.now() + DEVICE_DAYS * 86_400_000).toISOString();
  const incidentExpiresAt = new Date(Date.now() + INCIDENT_TOKEN_HOURS * 3_600_000).toISOString();
  const label = deviceLabel(request);
  await db.batch([
    db.prepare(
      `INSERT INTO owner_trusted_devices
       (id, merchant_id, token_hash, device_label, expires_at) VALUES (?, ?, ?, ?, ?)`,
    ).bind(deviceId, merchant.id, await sha256(deviceToken), label, expiresAt),
    db.prepare(
      `INSERT INTO owner_security_tokens
       (id, merchant_id, trusted_device_id, purpose, token_hash, expires_at)
       VALUES (?, ?, ?, 'unrecognized_device', ?, ?)`,
    ).bind(tokenId, merchant.id, deviceId, await sha256(incidentToken), incidentExpiresAt),
  ]);

  try {
    await sendOwnerNewDeviceEmail({
      email: merchant.email,
      firstName: merchant.firstName ?? "",
      businessName: merchant.businessName,
      loginDate: new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: "Europe/Paris",
      }).format(new Date()),
      deviceLabel: label,
      country: countryLabel(request),
      securityUrl: `https://kivli.fr/security/not-me?token=${encodeURIComponent(incidentToken)}`,
    });
  } catch (error) {
    await db.batch([
      db.prepare("DELETE FROM owner_security_tokens WHERE id = ? AND merchant_id = ?").bind(tokenId, merchant.id),
      db.prepare("DELETE FROM owner_trusted_devices WHERE id = ? AND merchant_id = ?").bind(deviceId, merchant.id),
    ]);
    throw error;
  }

  return {
    recognized: false,
    cookie: secureCookie(OWNER_DEVICE_COOKIE, deviceToken, DEVICE_DAYS * 86_400),
  };
}

export async function claimUnknownDeviceIncident(rawToken: string) {
  await ensureSchema();
  const db = getD1();
  const tokenHash = await sha256(rawToken);
  const token = await queryFirst<{ id: string; merchantId: string }>(
    `SELECT id, merchant_id AS merchantId FROM owner_security_tokens
     WHERE token_hash = ? AND purpose = 'unrecognized_device' AND used_at IS NULL
       AND datetime(expires_at) > CURRENT_TIMESTAMP`,
    tokenHash,
  );
  if (!token) return null;
  const claim = await db.prepare(
    `UPDATE owner_security_tokens SET used_at = CURRENT_TIMESTAMP
     WHERE id = ? AND merchant_id = ? AND used_at IS NULL AND datetime(expires_at) > CURRENT_TIMESTAMP`,
  ).bind(token.id, token.merchantId).run();
  if (Number(claim.meta.changes ?? 0) !== 1) return null;

  const recoveryToken = randomToken("recovery");
  const recoveryId = makeId("ost");
  const recoveryExpiresAt = new Date(Date.now() + RECOVERY_TOKEN_MINUTES * 60_000).toISOString();
  await db.batch([
    db.prepare(
      "DELETE FROM employee_sessions WHERE session_id IN (SELECT id FROM merchant_sessions WHERE merchant_id = ? AND role = 'owner')",
    ).bind(token.merchantId),
    db.prepare("DELETE FROM merchant_sessions WHERE merchant_id = ? AND role = 'owner'").bind(token.merchantId),
    db.prepare(
      "UPDATE owner_trusted_devices SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP) WHERE merchant_id = ?",
    ).bind(token.merchantId),
    db.prepare(
      "UPDATE owner_security_tokens SET used_at = COALESCE(used_at, CURRENT_TIMESTAMP) WHERE merchant_id = ?",
    ).bind(token.merchantId),
    db.prepare("UPDATE merchants SET owner_pin_change_required = 1 WHERE id = ?").bind(token.merchantId),
    db.prepare(
      `INSERT INTO owner_security_tokens
       (id, merchant_id, purpose, token_hash, expires_at)
       VALUES (?, ?, 'forced_pin_change', ?, ?)`,
    ).bind(recoveryId, token.merchantId, await sha256(recoveryToken), recoveryExpiresAt),
  ]);
  return {
    merchantId: token.merchantId,
    recoveryCookie: secureCookie(OWNER_RECOVERY_COOKIE, recoveryToken, RECOVERY_TOKEN_MINUTES * 60),
  };
}

export async function ownerRecoveryToken(request: Request) {
  const rawToken = readCookie(request, OWNER_RECOVERY_COOKIE);
  if (!rawToken) return null;
  return queryFirst<{ id: string; merchantId: string }>(
    `SELECT t.id, t.merchant_id AS merchantId FROM owner_security_tokens t
     JOIN merchants m ON m.id = t.merchant_id
     WHERE t.token_hash = ? AND t.purpose = 'forced_pin_change' AND t.used_at IS NULL
       AND datetime(t.expires_at) > CURRENT_TIMESTAMP AND m.owner_pin_change_required = 1`,
    await sha256(rawToken),
  );
}
