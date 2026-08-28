import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("customer deletion migration is additive and keeps historical rows", async () => {
  const migration = await read("drizzle/0010_customer_deletion.sql");
  assert.match(migration, /ALTER TABLE memberships ADD COLUMN deleted_at TEXT/);
  assert.match(migration, /ALTER TABLE customers ADD COLUMN anonymized_at TEXT/);
  assert.match(migration, /ALTER TABLE apple_wallet_passes ADD COLUMN voided_at TEXT/);
  assert.match(migration, /CREATE TABLE wallet_invalidation_jobs/);
  assert.doesNotMatch(migration, /\b(?:DELETE|DROP|UPDATE)\b/i);
});

test("only an authenticated owner can confirm a tenant-scoped deletion", async () => {
  const [route, service] = await Promise.all([
    read("app/api/merchant/customers/[membershipId]/route.ts"),
    read("lib/customer-deletion.ts"),
  ]);
  assert.match(route, /isSameOrigin\(request\)/);
  assert.match(route, /isOwner\(merchant\)/);
  assert.match(route, /requireCurrentPilotAcceptance/);
  assert.match(route, /body\?\.confirmed !== true/);
  assert.match(service, /WHERE id = \? AND merchant_id = \?/);
  assert.match(service, /if \(membership\.deletedAt\)/);
  assert.match(service, /INSERT OR IGNORE INTO wallet_invalidation_jobs/);
});

test("deletion revokes the card, anonymizes PII and preserves anonymous history", async () => {
  const service = await read("lib/customer-deletion.ts");
  assert.match(service, /SET code = \?, points = 0, deleted_at = \?/);
  assert.match(service, /first_name = CASE/);
  assert.match(service, /THEN 'Client supprimé'/);
  assert.match(service, /phone = CASE/);
  assert.match(service, /marketing_consent = 0/);
  assert.match(service, /UPDATE stamps SET note = NULL/);
  assert.match(service, /UPDATE rewards SET status = 'cancelled'/);
  assert.doesNotMatch(service, /DELETE FROM (?:customers|memberships|stamps|rewards)/);
});

test("deleted cards cannot be scanned, mutated, searched or notified", async () => {
  const files = await Promise.all([
    "lib/data.ts",
    "app/api/merchant/scan/route.ts",
    "app/api/merchant/stamp/route.ts",
    "app/api/merchant/bonus/route.ts",
    "app/api/merchant/redeem/route.ts",
    "app/api/merchant/stamp/undo/route.ts",
    "app/api/merchant/redeem/undo/route.ts",
    "app/api/merchant/dashboard/route.ts",
    "lib/wallet-notifications.ts",
  ].map(read));
  for (const source of files) assert.match(source, /deleted_at IS NULL/);
});

test("the same phone can register again without recovering the old balance", async () => {
  const [join, service] = await Promise.all([
    read("app/api/join/[slug]/route.ts"),
    read("lib/customer-deletion.ts"),
  ]);
  assert.match(join, /mb\.deleted_at IS NULL AND c\.phone = \?/);
  assert.match(join, /INSERT INTO customers/);
  assert.match(join, /INSERT INTO memberships/);
  assert.match(service, /THEN NULL ELSE phone END/);
  assert.match(service, /SET code = \?, points = 0/);
});

test("Apple and Google Wallet invalidation is durable and retryable", async () => {
  const [service, apple, google, schedule] = await Promise.all([
    read("lib/customer-deletion.ts"),
    read("lib/apple-wallet.ts"),
    read("lib/google-wallet.ts"),
    read("lib/wallet-notifications.ts"),
  ]);
  assert.match(apple, /voided\?: boolean/);
  assert.match(apple, /voided: true/);
  assert.match(apple, /invalidateAppleWalletPass/);
  assert.match(apple, /APPLE_WALLET_APNS/);
  assert.match(google, /invalidateGoogleWalletPass/);
  assert.match(google, /state: "INACTIVE"/);
  assert.match(google, /accountName: "Client supprimé"/);
  assert.match(google, /accountId: "Carte supprimée"/);
  assert.match(google, /textModulesData: \[\{ id: "kivli_status"/);
  assert.match(service, /status = 'failed'/);
  assert.match(service, /attempt_count < 8/);
  assert.match(service, /Promise\.allSettled/);
  assert.match(schedule, /retryWalletInvalidationJobs/);
});

test("owner UI requires an explicit accessible confirmation and is not an employee action", async () => {
  const [dashboard, styles] = await Promise.all([
    read("components/DashboardApp.tsx"),
    read("app/globals.css"),
  ]);
  assert.match(dashboard, /Supprimer le client/);
  assert.match(dashboard, /Ses points, ses récompenses et l’accès à sa carte seront perdus/);
  assert.match(dashboard, /type="checkbox" required/);
  assert.match(dashboard, /method: "DELETE"/);
  assert.match(dashboard, /item\.id === "scan"/);
  assert.match(styles, /\.delete-customer-button/);
  assert.match(styles, /\.customer-delete-confirm/);
  assert.match(styles, /\.button-danger/);
});
