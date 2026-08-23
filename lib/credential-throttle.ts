import { ensureSchema, getD1, queryFirst } from "../db";
import { sha256 } from "./ids";

type AttemptRow = {
  failedCount: number;
  windowStartedAt: string;
  lockedUntil: string | null;
};

const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;

function asDate(value: string | null) {
  if (!value) return null;
  return new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
}

async function keyFor(value: string) {
  return sha256(`kivli-security:${value}`);
}

async function activeLock(keys: string[]) {
  for (const key of keys) {
    const row = await queryFirst<AttemptRow>(
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
  const row = await queryFirst<AttemptRow>(
    `SELECT failed_count AS failedCount, window_started_at AS windowStartedAt, locked_until AS lockedUntil
     FROM login_attempts WHERE key_hash = ?`,
    key,
  );
  const now = new Date();
  const windowStart = asDate(row?.windowStartedAt ?? null);
  const inWindow = Boolean(windowStart && now.getTime() - windowStart.getTime() < WINDOW_MS);
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

export async function credentialThrottle(request: Request, subject: string) {
  const network = request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";
  const keys = [await keyFor(`${subject}:${network}`), await keyFor(`${subject}:account`)];
  return { keys, lockedUntil: await activeLock(keys) };
}

export async function recordCredentialFailure(keys: string[]) {
  await recordFailure(keys[0], 5);
  await recordFailure(keys[1], 12);
}

export async function clearCredentialFailures(keys: string[]) {
  await ensureSchema();
  await getD1().prepare("DELETE FROM login_attempts WHERE key_hash IN (?, ?)").bind(keys[0], keys[1]).run();
}
