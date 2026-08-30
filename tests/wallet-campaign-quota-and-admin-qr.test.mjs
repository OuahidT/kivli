import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import jsQR from "jsqr";
import {
  MARKETING_CAMPAIGN_INSERT_SQL,
  MARKETING_CAMPAIGN_QUOTA_SQL,
  marketingCampaignQuotaFromRow,
} from "../lib/wallet-campaign-quota.ts";
import { ENROLLMENT_QR_SIZE, enrollmentQrFilename, renderEnrollmentQrPng } from "../admin/src/enrollment-qr.ts";

function createCampaignDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE wallet_notification_campaigns (
    id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, program_id TEXT NOT NULL,
    title TEXT NOT NULL, message TEXT NOT NULL, request_key TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  ); CREATE UNIQUE INDEX idx_wallet_notification_campaign_request
    ON wallet_notification_campaigns(merchant_id, request_key) WHERE request_key IS NOT NULL;`);
  return db;
}

function insertCampaign(db, id, merchantId, requestKey) {
  return db.prepare(MARKETING_CAMPAIGN_INSERT_SQL).run(id, merchantId, "program", "Titre", "Message", requestKey, merchantId);
}

test("four campaigns fit in a rolling seven-day window, the fifth is refused, and merchants remain isolated", () => {
  const db = createCampaignDatabase();
  for (let index = 1; index <= 4; index += 1) {
    assert.equal(insertCampaign(db, `c${index}`, "merchant-a", `request-key-merchant-a-${index}`).changes, 1);
  }
  assert.equal(insertCampaign(db, "c5", "merchant-a", "request-key-merchant-a-5").changes, 0);
  assert.equal(insertCampaign(db, "other-1", "merchant-b", "request-key-merchant-b-1").changes, 1);
  const quota = marketingCampaignQuotaFromRow(db.prepare(MARKETING_CAMPAIGN_QUOTA_SQL).get("merchant-a"));
  assert.deepEqual({ used: quota.used, remaining: quota.remaining, limit: quota.limit }, { used: 4, remaining: 0, limit: 4 });
  assert.ok(quota.nextAllowedAt);
});

test("idempotent retries do not consume quota and one slot returns when its campaign leaves the window", () => {
  const db = createCampaignDatabase();
  for (let index = 1; index <= 4; index += 1) insertCampaign(db, `c${index}`, "merchant", `stable-request-key-${index}`);
  assert.equal(insertCampaign(db, "retry", "merchant", "stable-request-key-1").changes, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM wallet_notification_campaigns").get().count, 4);
  db.prepare("UPDATE wallet_notification_campaigns SET created_at = datetime('now', '-8 days') WHERE id = 'c1'").run();
  assert.equal(insertCampaign(db, "replacement", "merchant", "stable-request-key-5").changes, 1);
  assert.equal(db.prepare(MARKETING_CAMPAIGN_QUOTA_SQL).get("merchant").used, 4);
});

async function decodeOneBitQrPng(png) {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  const idat = [];
  let offset = 8;
  while (offset < png.byteLength) {
    const length = view.getUint32(offset, false);
    const type = new TextDecoder().decode(png.subarray(offset + 4, offset + 8));
    if (type === "IDAT") idat.push(png.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const compressedLength = idat.reduce((total, part) => total + part.length, 0);
  const compressed = new Uint8Array(compressedLength);
  let cursor = 0;
  for (const part of idat) { compressed.set(part, cursor); cursor += part.length; }
  const stream = new DecompressionStream("deflate");
  const writer = stream.writable.getWriter();
  await writer.write(compressed);
  await writer.close();
  const raw = new Uint8Array(await new Response(stream.readable).arrayBuffer());
  const rowBytes = Math.ceil(width / 8);
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    assert.equal(raw[y * (rowBytes + 1)], 0);
    for (let x = 0; x < width; x += 1) {
      const white = (raw[y * (rowBytes + 1) + 1 + (x >> 3)] >> (7 - (x & 7))) & 1;
      const color = white ? 255 : 0;
      const pixel = (y * width + x) * 4;
      rgba[pixel] = color; rgba[pixel + 1] = color; rgba[pixel + 2] = color; rgba[pixel + 3] = 255;
    }
  }
  return { width, height, decoded: jsQR(rgba, width, height) };
}

test("the generated admin PNG is crisp, decodable and contains the exact production enrollment URL", async () => {
  const url = "https://kivli.fr/join/kivli-demo";
  const productionPng = await renderEnrollmentQrPng(url, ENROLLMENT_QR_SIZE);
  assert.deepEqual(Array.from(productionPng.subarray(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);
  const productionView = new DataView(productionPng.buffer, productionPng.byteOffset, productionPng.byteLength);
  assert.equal(productionView.getUint32(16, false), 1600);
  assert.equal(productionView.getUint32(20, false), 1600);
  const result = await decodeOneBitQrPng(await renderEnrollmentQrPng(url, 512));
  assert.equal(result.decoded?.data, url);
  assert.equal(ENROLLMENT_QR_SIZE, 1600);
  assert.equal(enrollmentQrFilename("Café de l’Étoile"), "qr-inscription-kivli-cafe-de-l-etoile.png");
});

test("the QR download route is admin-gated and resolves the merchant before generating a file", async () => {
  const admin = await readFile(new URL("../admin/src/index.ts", import.meta.url), "utf8");
  const identityGuard = admin.indexOf("const identity = await getAdmin(request, env)");
  const qrRoute = admin.indexOf("enrollmentQrMatch");
  assert.ok(identityGuard > 0 && qrRoute > identityGuard);
  assert.match(admin, /WHERE m\.id = \? AND EXISTS/);
  assert.match(admin, /https:\/\/kivli\.fr\/join\/\$\{merchant\.slug\}/);
  assert.match(admin, /Content-Disposition/);
  assert.doesNotMatch(admin, /workers\.dev/i);
});
