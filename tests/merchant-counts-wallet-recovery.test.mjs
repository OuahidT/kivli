import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import {
  EXPIRE_STALE_MARKETING_DELIVERIES_SQL,
  MARKETING_CAMPAIGN_TARGETS_SQL,
  REQUEUE_INTERRUPTED_MARKETING_DELIVERIES_SQL,
} from "../lib/wallet-campaign-quota.ts";
import { classifyApplePushRejection } from "../lib/apple-wallet-apns.ts";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("merchant clients and segments are computed from every active card, not the former first 60", async () => {
  const dashboard = await source("app/api/merchant/dashboard/route.ts");
  const ui = await source("components/DashboardApp.tsx");
  assert.match(dashboard, /mb\.merchant_id = \? AND mb\.deleted_at IS NULL ORDER BY mb\.updated_at DESC`/);
  assert.doesNotMatch(dashboard, /ORDER BY mb\.updated_at DESC LIMIT 60/);
  assert.match(dashboard, /customers\.filter\(\(customer\) => customer\.segment === "new"\)\.length/);
  assert.match(ui, /data\.stats\.customers/);
  assert.match(ui, /aria-pressed=\{segment === id\}/);
});

test("admin uses active cards, non-reversed purchases and redeemed rewards", async () => {
  const admin = await source("admin/src/index.ts");
  assert.match(admin, /SELECT merchant_id, COUNT\(\*\) AS customerCount FROM memberships WHERE deleted_at IS NULL/);
  assert.match(admin, /reason IN \('visit', 'purchase'\) AND reversed_at IS NULL/);
  assert.match(admin, /SELECT merchant_id, COUNT\(\*\) AS rewardCount FROM rewards WHERE status = 'redeemed'/);
  assert.match(admin, /SELECT COUNT\(\*\) FROM memberships WHERE merchant_id = m\.id AND deleted_at IS NULL/);
});

test("a campaign snapshots only relevant cards and stays idempotent when processing resumes", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE wallet_notification_campaigns (
    id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, program_id TEXT NOT NULL,
    title TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE memberships (
    id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, customer_id TEXT NOT NULL,
    program_id TEXT NOT NULL, created_at TEXT NOT NULL, deleted_at TEXT
  );
  CREATE TABLE apple_wallet_passes (
    membership_id TEXT PRIMARY KEY, serial_number TEXT NOT NULL,
    pass_type_identifier TEXT NOT NULL, voided_at TEXT
  );
  CREATE TABLE apple_wallet_registrations (
    serial_number TEXT NOT NULL, pass_type_identifier TEXT NOT NULL
  );
  CREATE TABLE google_wallet_passes (membership_id TEXT PRIMARY KEY);
  CREATE TABLE wallet_notification_deliveries (
    id TEXT PRIMARY KEY, idempotency_key TEXT UNIQUE NOT NULL,
    merchant_id TEXT NOT NULL, customer_id TEXT NOT NULL, membership_id TEXT NOT NULL,
    program_id TEXT NOT NULL, campaign_id TEXT NOT NULL, notification_type TEXT NOT NULL,
    cycle_key TEXT NOT NULL, platform TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL
  );`);
  db.prepare("INSERT INTO wallet_notification_campaigns VALUES (?, ?, ?, ?, ?, ?)")
    .run("campaign", "merchant", "program", "Offre", "Bonjour", "2026-10-17 10:00:00");
  const member = db.prepare("INSERT INTO memberships VALUES (?, 'merchant', ?, 'program', ?, ?)");
  member.run("apple-card", "apple-customer", "2026-10-16 10:00:00", null);
  member.run("google-card", "google-customer", "2026-10-16 10:00:00", null);
  member.run("no-wallet", "web-customer", "2026-10-16 10:00:00", null);
  member.run("late-card", "late-customer", "2026-10-17 10:01:00", null);
  member.run("deleted-card", "deleted-customer", "2026-10-16 10:00:00", "2026-10-17 09:00:00");
  const apple = db.prepare("INSERT INTO apple_wallet_passes VALUES (?, ?, 'pass.type', NULL)");
  apple.run("apple-card", "serial-apple");
  apple.run("late-card", "serial-late");
  apple.run("deleted-card", "serial-deleted");
  const registration = db.prepare("INSERT INTO apple_wallet_registrations VALUES (?, 'pass.type')");
  registration.run("serial-apple");
  registration.run("serial-late");
  registration.run("serial-deleted");
  db.prepare("INSERT INTO google_wallet_passes VALUES ('google-card')").run();
  assert.equal(db.prepare(MARKETING_CAMPAIGN_TARGETS_SQL).run("campaign").changes, 2);
  assert.deepEqual(db.prepare("SELECT membership_id AS membershipId, platform FROM wallet_notification_deliveries ORDER BY platform").all().map((row) => ({ ...row })), [
    { membershipId: "apple-card", platform: "apple" },
    { membershipId: "google-card", platform: "google" },
  ]);
  assert.equal(db.prepare(MARKETING_CAMPAIGN_TARGETS_SQL).run("campaign").changes, 0);
});

test("campaign recovery is scheduled but expired messages are not sent later", async () => {
  const notifications = await source("lib/wallet-notifications.ts");
  const worker = await source("worker/index.ts");
  const config = await source("wrangler.jsonc");
  assert.match(config, /\*\/5 \* \* \* \*/);
  assert.match(worker, /drainPendingMarketingCampaigns/);
  assert.match(notifications, /EXPIRE_STALE_MARKETING_DELIVERIES_SQL/);
  assert.match(notifications, /d\.campaign_id = \? AND mb\.deleted_at IS NULL/);
  assert.match(notifications, /status = 'processing'/);
  assert.match(notifications, /LIMIT 80/);
});

test("Wallet retries check Google installation state and retry partial Apple APNs failures", async () => {
  const google = await source("lib/google-wallet.ts");
  const apple = await source("lib/apple-wallet.ts");
  assert.match(google, /if \(!localPass\) return \{ active: false, sent: false \}/);
  assert.doesNotMatch(google, /if \(!localPass\?\.active\)/);
  assert.match(google, /existingObject\.messages\?\.some\(\(entry\) => entry\.id === messageId\)/);
  assert.match(apple, /const retryableFailure = results\.find/);
  assert.match(apple, /const sent = results\.some\(\(result\) => result\.ok\) && !retryableFailure/);
});

test("APNs configuration errors never unregister an Apple Wallet device", () => {
  assert.deepEqual(classifyApplePushRejection(400, '{"reason":"BadTopic"}'), {
    invalidToken: false, retryable: true, reason: "BadTopic",
  });
  assert.deepEqual(classifyApplePushRejection(400, '{"reason":"BadDeviceToken"}'), {
    invalidToken: true, retryable: false, reason: "BadDeviceToken",
  });
  assert.deepEqual(classifyApplePushRejection(410, '{"reason":"Unregistered"}'), {
    invalidToken: true, retryable: false, reason: "Unregistered",
  });
  assert.deepEqual(classifyApplePushRejection(503, "temporarily unavailable"), {
    invalidToken: false, retryable: true, reason: null,
  });
});

test("stale campaigns expire without erasing terminal failures or touching recent notifications", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE wallet_notification_deliveries (
    id TEXT PRIMARY KEY, notification_type TEXT NOT NULL, status TEXT NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0, error_message TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, next_attempt_at TEXT
  );`);
  const insert = db.prepare(`INSERT INTO wallet_notification_deliveries
    (id, notification_type, status, attempt_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)`);
  insert.run("old-pending", "marketing", "pending", 0, "2026-01-01 00:00:00", "2026-01-01 00:00:00");
  insert.run("old-terminal", "marketing", "failed", 3, "2026-01-01 00:00:00", "2026-01-01 00:00:00");
  insert.run("old-automatic", "near_reward", "pending", 0, "2026-01-01 00:00:00", "2026-01-01 00:00:00");
  insert.run("interrupted", "marketing", "processing", 1, "2026-10-17 10:00:00", "2026-10-17 10:01:00");
  db.prepare(EXPIRE_STALE_MARKETING_DELIVERIES_SQL).run();
  assert.equal(db.prepare("SELECT status FROM wallet_notification_deliveries WHERE id = 'old-pending'").get().status, "skipped");
  assert.equal(db.prepare("SELECT status FROM wallet_notification_deliveries WHERE id = 'old-terminal'").get().status, "failed");
  assert.equal(db.prepare("SELECT status FROM wallet_notification_deliveries WHERE id = 'old-automatic'").get().status, "pending");
  // The requeue query is exercised against a relative recent timestamp so it
  // remains valid irrespective of the date on which the test is run.
  db.prepare("UPDATE wallet_notification_deliveries SET created_at = datetime('now', '-1 hour'), updated_at = datetime('now', '-15 minutes') WHERE id = 'interrupted'").run();
  db.prepare(REQUEUE_INTERRUPTED_MARKETING_DELIVERIES_SQL).run();
  assert.equal(db.prepare("SELECT status FROM wallet_notification_deliveries WHERE id = 'interrupted'").get().status, "failed");
  db.prepare(REQUEUE_INTERRUPTED_MARKETING_DELIVERIES_SQL).run();
  assert.equal(db.prepare("SELECT status FROM wallet_notification_deliveries WHERE id = 'interrupted'").get().status, "failed");
});
