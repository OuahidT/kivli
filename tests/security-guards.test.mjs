import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const mutationRoutes = [
  "app/api/merchant/login/route.ts",
  "app/api/merchant/signup/route.ts",
  "app/api/merchant/signup/resend/route.ts",
  "app/api/merchant/signup/verify/route.ts",
  "app/api/merchant/bonus/route.ts",
  "app/api/merchant/employees/route.ts",
  "app/api/merchant/feedback/route.ts",
  "app/api/merchant/logout/route.ts",
  "app/api/merchant/pilot-acceptance/route.ts",
  "app/api/merchant/program/route.ts",
  "app/api/merchant/redeem/route.ts",
  "app/api/merchant/redeem/undo/route.ts",
  "app/api/merchant/security/route.ts",
  "app/api/merchant/security/not-me/route.ts",
  "app/api/merchant/security/forced-pin/route.ts",
  "app/api/merchant/stamp/route.ts",
  "app/api/merchant/stamp/undo/route.ts",
  "app/api/merchant/wallet-notifications/route.ts",
  "app/api/merchant/welcome-seen/route.ts",
  "app/api/join/[slug]/route.ts",
  "app/api/card/[code]/privacy/route.ts",
  "app/api/card/[code]/google-wallet/route.ts",
];

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("all browser mutation routes enforce same-origin requests", async () => {
  for (const route of mutationRoutes) {
    const contents = await source(route);
    assert.match(contents, /isSameOrigin\(request\)/, `${route} must enforce same-origin requests`);
  }
});

test("merchant write routes keep tenant predicates", async () => {
  for (const route of [
    "app/api/merchant/bonus/route.ts",
    "app/api/merchant/employees/route.ts",
    "app/api/merchant/program/route.ts",
    "app/api/merchant/redeem/route.ts",
    "app/api/merchant/redeem/undo/route.ts",
    "app/api/merchant/stamp/route.ts",
    "app/api/merchant/stamp/undo/route.ts",
  ]) {
    assert.match(await source(route), /merchant_id\s*=\s*\?/, `${route} must scope database access to the session merchant`);
  }
});

test("owner-only routes keep explicit role checks", async () => {
  for (const route of [
    "app/api/merchant/bonus/route.ts",
    "app/api/merchant/employees/route.ts",
    "app/api/merchant/feedback/route.ts",
    "app/api/merchant/program/route.ts",
    "app/api/merchant/wallet-notifications/route.ts",
    "app/api/merchant/pilot-acceptance/route.ts",
  ]) {
    assert.match(await source(route), /isOwner\(merchant\)/, `${route} must remain owner-only`);
  }
});

test("credential changes are throttled and revoke sessions", async () => {
  const contents = await source("app/api/merchant/security/route.ts");
  assert.match(contents, /credentialThrottle/);
  assert.match(contents, /recordCredentialFailure/);
  assert.match(contents, /DELETE FROM merchant_sessions/);
  assert.match(contents, /reauthenticate:\s*true/);
});

test("the public card response uses an explicit data-minimized DTO", async () => {
  const contents = await source("app/api/card/[code]/route.ts");
  assert.match(contents, /const publicCard: PublicCardData/);
  assert.doesNotMatch(contents, /Response\.json\(\{\s*card[,}]/);
  assert.doesNotMatch(contents, /membershipId:\s*card\.membershipId/);
  assert.doesNotMatch(contents, /merchantId:\s*card\.merchantId/);
});

test("merchant session cookie retains its security attributes", async () => {
  const contents = await source("lib/auth.ts");
  assert.match(contents, /HttpOnly; SameSite=Lax; Path=\//);
  assert.match(contents, /; Secure/);
  assert.match(contents, /sha256\(token\)/);
});

test("public and admin workers set baseline browser security headers", async () => {
  const publicWorker = await source("worker/index.ts");
  const adminWorker = await source("admin/src/index.ts");
  for (const contents of [publicWorker, adminWorker]) {
    assert.match(contents, /Strict-Transport-Security/);
    assert.match(contents, /X-Content-Type-Options/);
    assert.match(contents, /X-Frame-Options/);
    assert.match(contents, /Referrer-Policy/);
  }
  assert.match(publicWorker, /frame-ancestors 'none'/);
});

test("Apple Wallet pass and device routes verify the pass token", async () => {
  for (const route of [
    "app/api/apple-wallet/v1/passes/[passTypeIdentifier]/[serialNumber]/route.ts",
    "app/api/apple-wallet/v1/devices/[deviceLibraryIdentifier]/registrations/[passTypeIdentifier]/[serialNumber]/route.ts",
  ]) {
    assert.match(await source(route), /verifyAppleWalletRequest/);
  }
});

test("Wallet campaigns and targets remain scoped to one merchant and program", async () => {
  const notifications = await source("lib/wallet-notifications.ts");
  assert.match(notifications, /FROM memberships mb WHERE mb\.merchant_id = \? AND mb\.program_id = \?/);
  assert.match(notifications, /FROM programs WHERE merchant_id = \? AND active = 1/);
  assert.match(notifications, /INSERT(?: OR IGNORE)? INTO wallet_notification_deliveries/);
  assert.match(notifications, /idempotencyKey/);
  assert.match(notifications, /validateCampaignRequestKey/);
  assert.match(notifications, /MARKETING_CAMPAIGN_INSERT_SQL/);
});
