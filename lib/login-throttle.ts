import { ensureSchema, getD1, queryFirst } from "../db";
import {
  failureState,
  type LoginThrottleScope,
} from "./owner-auth-policy";
import { sha256 } from "./ids";

type AttemptRow = {
  failedCount: number;
  windowStartedAt: string;
  lockedUntil: string | null;
};

export type LoginThrottle = {
  keys: Record<LoginThrottleScope, string>;
  lockedUntil: Date | null;
};

function asDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function clientNetwork(request: Request) {
  return request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";
}

async function throttleKey(scope: LoginThrottleScope, value: string) {
  return sha256(`kivli-login-v2:${scope}:${value}`);
}

export async function loginThrottle(request: Request, normalizedIdentifier: string): Promise<LoginThrottle> {
  const network = clientNetwork(request);
  const keys = {
    pair: await throttleKey("pair", `${normalizedIdentifier}:${network}`),
    account: await throttleKey("account", normalizedIdentifier),
    network: await throttleKey("network", network),
  };
  let lockedUntil: Date | null = null;
  for (const key of Object.values(keys)) {
    const row = await queryFirst<AttemptRow>(
      `SELECT failed_count AS failedCount, window_started_at AS windowStartedAt, locked_until AS lockedUntil
       FROM login_attempts WHERE key_hash = ?`,
      key,
    );
    const candidate = asDate(row?.lockedUntil);
    if (candidate && candidate.getTime() > Date.now() && (!lockedUntil || candidate > lockedUntil)) lockedUntil = candidate;
  }
  return { keys, lockedUntil };
}

async function recordScopeFailure(scope: LoginThrottleScope, key: string) {
  const row = await queryFirst<AttemptRow>(
    `SELECT failed_count AS failedCount, window_started_at AS windowStartedAt, locked_until AS lockedUntil
     FROM login_attempts WHERE key_hash = ?`,
    key,
  );
  const now = Date.now();
  const state = failureState({
    scope,
    previousFailedCount: row?.failedCount ?? 0,
    windowStartedAt: asDate(row?.windowStartedAt)?.getTime() ?? null,
    previousLockedUntil: asDate(row?.lockedUntil)?.getTime() ?? null,
    now,
  });
  await getD1().prepare(
    `INSERT INTO login_attempts (key_hash, failed_count, window_started_at, locked_until, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(key_hash) DO UPDATE SET failed_count = excluded.failed_count,
       window_started_at = excluded.window_started_at, locked_until = excluded.locked_until,
       updated_at = excluded.updated_at`,
  ).bind(
    key,
    state.failedCount,
    new Date(state.windowStartedAt).toISOString(),
    state.lockedUntil ? new Date(state.lockedUntil).toISOString() : null,
    new Date(now).toISOString(),
  ).run();
}

export async function recordLoginFailure(throttle: LoginThrottle) {
  await ensureSchema();
  await Promise.all((Object.entries(throttle.keys) as Array<[LoginThrottleScope, string]>)
    .map(([scope, key]) => recordScopeFailure(scope, key)));
}

export async function clearSuccessfulLoginFailures(throttle: LoginThrottle) {
  await ensureSchema();
  await getD1().prepare("DELETE FROM login_attempts WHERE key_hash IN (?, ?)")
    .bind(throttle.keys.pair, throttle.keys.account)
    .run();
}
