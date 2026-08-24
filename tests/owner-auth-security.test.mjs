import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  delayForFailure,
  failureState,
  isWeakOwnerPin,
  LOGIN_THROTTLE_POLICIES,
  LOGIN_WINDOW_MS,
  validStrongOwnerPin,
} from "../lib/owner-auth-policy.ts";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("owner PIN remains exactly six digits and rejects predictable values", () => {
  for (const weak of ["123456", "654321", "000000", "111111", "121212", "123123", "012345", "987654"]) {
    assert.equal(isWeakOwnerPin(weak), true, `${weak} must be rejected`);
    assert.equal(validStrongOwnerPin(weak), false);
  }
  for (const invalid of ["12345", "1234567", "abcdef", "12 345"]) assert.equal(validStrongOwnerPin(invalid), false);
  for (const strong of ["482917", "730461", "594028"]) assert.equal(validStrongOwnerPin(strong), true, `${strong} should remain usable`);
});

test("login throttling combines account, network and pair limits", () => {
  assert.equal(LOGIN_THROTTLE_POLICIES.pair.hardLimit, 8);
  assert.equal(LOGIN_THROTTLE_POLICIES.account.hardLimit, 10);
  assert.equal(LOGIN_THROTTLE_POLICIES.network.hardLimit, 30);
  assert.equal(delayForFailure("pair", 3), 2_000);
  assert.equal(delayForFailure("account", 9), 120_000);
  assert.equal(delayForFailure("network", 30), 10 * 60_000);
});

test("temporary locks expire and cannot become permanent", () => {
  const locked = failureState({
    scope: "account",
    previousFailedCount: 9,
    windowStartedAt: 1_000,
    previousLockedUntil: null,
    now: 2_000,
  });
  assert.equal(locked.failedCount, 10);
  assert.equal(locked.delayMs, 15 * 60_000);
  const afterExpiry = failureState({
    scope: "account",
    previousFailedCount: locked.failedCount,
    windowStartedAt: locked.windowStartedAt,
    previousLockedUntil: locked.lockedUntil,
    now: locked.lockedUntil + 1,
  });
  assert.equal(afterExpiry.failedCount, 1);
  assert.equal(afterExpiry.lockedUntil, null);
  const afterWindow = failureState({
    scope: "pair",
    previousFailedCount: 4,
    windowStartedAt: 1_000,
    previousLockedUntil: null,
    now: 1_000 + LOGIN_WINDOW_MS,
  });
  assert.equal(afterWindow.failedCount, 1);
});

test("login errors remain generic and absent accounts use constant-cost verification", async () => {
  const login = await source("app/api/merchant/login/route.ts");
  assert.match(login, /DUMMY_PIN_HASH/);
  assert.match(login, /Identifiant ou accès incorrect\./);
  assert.doesNotMatch(login, /Aucun compte/);
  assert.match(login, /loginThrottle/);
  assert.match(login, /recordLoginFailure/);
  assert.match(await source("lib/login-throttle.ts"), /pair:[\s\S]*account:[\s\S]*network:/);
});

test("new owner devices use hashed random tokens and secure cookies", async () => {
  const devices = await source("lib/owner-security.ts");
  assert.match(devices, /crypto\.getRandomValues\(new Uint8Array\(32\)\)/);
  assert.match(devices, /sha256\(deviceToken\)/);
  assert.match(devices, /__Host-kivli_owner_device/);
  assert.match(devices, /HttpOnly; Secure; SameSite=Strict; Path=\//);
  assert.match(devices, /revoked_at IS NULL/);
  assert.match(devices, /datetime\(expires_at\) > CURRENT_TIMESTAMP/);
  assert.match(devices, /registerOrRecognizeOwnerDevice/);
});

test("recognized devices do not generate a second alert", async () => {
  const devices = await source("lib/owner-security.ts");
  const recognizedBranch = devices.slice(devices.indexOf("if (existingToken)"), devices.indexOf("const deviceToken"));
  assert.match(recognizedBranch, /return \{ recognized: true, cookie: null/);
  assert.doesNotMatch(recognizedBranch, /sendOwnerNewDeviceEmail/);
});

test("incident links require POST confirmation and enforce expiry plus one-time use", async () => {
  const incident = await source("lib/owner-security.ts");
  const route = await source("app/api/merchant/security/not-me/route.ts");
  const page = await source("components/OwnerSecurityIncident.tsx");
  assert.match(incident, /purpose = 'unrecognized_device'/);
  assert.match(incident, /used_at IS NULL/);
  assert.match(incident, /datetime\(expires_at\) > CURRENT_TIMESTAMP/);
  assert.match(incident, /WHERE id = \? AND merchant_id = \? AND used_at IS NULL/);
  assert.match(route, /export async function POST/);
  assert.match(page, /fetch\("\/api\/merchant\/security\/not-me"/);
  assert.doesNotMatch(page, /useEffect/);
});

test("incident confirmation globally revokes owner access and requires a new PIN", async () => {
  const devices = await source("lib/owner-security.ts");
  const forced = await source("app/api/merchant/security/forced-pin/route.ts");
  assert.match(devices, /DELETE FROM merchant_sessions WHERE merchant_id = \? AND role = 'owner'/);
  assert.match(devices, /UPDATE owner_trusted_devices SET revoked_at/);
  assert.match(devices, /owner_pin_change_required = 1/);
  assert.match(forced, /owner_pin_change_required = 0/);
  assert.match(forced, /validOwnerPassword\(newPin\)/);
  assert.match(forced, /UPDATE owner_security_tokens SET used_at/);
  assert.match(forced, /merchant_id = \?/);
  assert.doesNotMatch(forced, /body\?\.merchantId/);
});

test("voluntary PIN changes revoke sessions and recognized devices", async () => {
  const security = await source("app/api/merchant/security/route.ts");
  assert.match(security, /validOwnerPassword\(newPassword\)/);
  assert.match(security, /DELETE FROM merchant_sessions WHERE merchant_id = \?/);
  assert.match(security, /UPDATE owner_trusted_devices SET revoked_at/);
  assert.match(security, /clearOwnerDeviceCookie/);
});
