export const OWNER_PIN_LENGTH = 6;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export type LoginThrottleScope = "pair" | "account" | "network";

export type LoginThrottlePolicy = {
  scope: LoginThrottleScope;
  hardLimit: number;
  hardLockMs: number;
  progressiveDelays: ReadonlyArray<readonly [number, number]>;
};

export const LOGIN_THROTTLE_POLICIES: Record<LoginThrottleScope, LoginThrottlePolicy> = {
  pair: {
    scope: "pair",
    hardLimit: 8,
    hardLockMs: 15 * 60 * 1000,
    progressiveDelays: [[3, 2_000], [4, 5_000], [5, 15_000], [6, 30_000], [7, 60_000]],
  },
  account: {
    scope: "account",
    hardLimit: 10,
    hardLockMs: 15 * 60 * 1000,
    progressiveDelays: [[4, 2_000], [5, 5_000], [6, 15_000], [7, 30_000], [8, 60_000], [9, 120_000]],
  },
  network: {
    scope: "network",
    hardLimit: 30,
    hardLockMs: 10 * 60 * 1000,
    progressiveDelays: [[10, 2_000], [15, 15_000], [20, 60_000], [25, 120_000]],
  },
};

const COMMON_WEAK_PINS = new Set([
  "000000", "111111", "222222", "333333", "444444", "555555", "666666", "777777", "888888", "999999",
  "123456", "654321", "012345", "543210", "987654", "456789", "789012",
  "121212", "212121", "101010", "696969", "112233", "221100", "123123", "321321",
  "159753", "357159", "258025", "147258", "085208", "520520",
]);

export function isWeakOwnerPin(pin: string) {
  if (!/^\d{6}$/.test(pin)) return true;
  if (COMMON_WEAK_PINS.has(pin)) return true;
  if (/^(\d)\1{5}$/.test(pin)) return true;
  if (/^(\d{2})\1{2}$/.test(pin)) return true;
  if (/^(\d{3})\1$/.test(pin)) return true;
  const ascending = "0123456789012345";
  const descending = "9876543210987654";
  return ascending.includes(pin) || descending.includes(pin);
}

export function validStrongOwnerPin(pin: string) {
  return /^\d{6}$/.test(pin) && !isWeakOwnerPin(pin);
}

export function delayForFailure(scope: LoginThrottleScope, failedCount: number) {
  const policy = LOGIN_THROTTLE_POLICIES[scope];
  if (failedCount >= policy.hardLimit) return policy.hardLockMs;
  let delay = 0;
  for (const [threshold, duration] of policy.progressiveDelays) {
    if (failedCount >= threshold) delay = duration;
  }
  return delay;
}

export function failureState(input: {
  scope: LoginThrottleScope;
  previousFailedCount: number;
  windowStartedAt: number | null;
  previousLockedUntil: number | null;
  now: number;
}) {
  const lockExpired = input.previousLockedUntil !== null && input.previousLockedUntil <= input.now;
  const windowExpired = input.windowStartedAt === null || input.now - input.windowStartedAt >= LOGIN_WINDOW_MS;
  const reachedPriorHardLimit = input.previousFailedCount >= LOGIN_THROTTLE_POLICIES[input.scope].hardLimit;
  const reset = windowExpired || (lockExpired && reachedPriorHardLimit);
  const failedCount = reset ? 1 : input.previousFailedCount + 1;
  const windowStartedAt = reset ? input.now : (input.windowStartedAt ?? input.now);
  const delayMs = delayForFailure(input.scope, failedCount);
  return {
    failedCount,
    windowStartedAt,
    lockedUntil: delayMs > 0 ? input.now + delayMs : null,
    delayMs,
  };
}
