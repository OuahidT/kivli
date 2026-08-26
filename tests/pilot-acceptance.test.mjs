import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("the current legal documents have stable, exact content proofs", async () => {
  const legal = await source("lib/legal.ts");
  assert.match(legal, /PILOT_TERMS_VERSION = "2026-08-26"/);
  assert.match(legal, /DATA_PROCESSING_AGREEMENT_VERSION = "2026-08-21"/);
  const pilotText = legal.match(/PILOT_TERMS_CANONICAL_TEXT = `([\s\S]*?)`;/)?.[1];
  const dataText = legal.match(/DATA_PROCESSING_AGREEMENT_CANONICAL_TEXT = `([\s\S]*?)`;/)?.[1];
  assert.ok(pilotText && dataText);
  const pilotHash = createHash("sha256").update(pilotText).digest("hex");
  const dataHash = createHash("sha256").update(dataText).digest("hex");
  assert.match(pilotHash, /^[a-f0-9]{64}$/);
  assert.match(dataHash, /^[a-f0-9]{64}$/);
  assert.notEqual(pilotHash, dataHash);
  assert.match(legal, /Je confirme être habilité\(e\) à engager le commerce \$\{businessName\}/);
});

test("pilot acceptance is explicit, owner-only, same-origin and idempotent", async () => {
  const [route, service] = await Promise.all([
    source("app/api/merchant/pilot-acceptance/route.ts"),
    source("lib/pilot-acceptance.ts"),
  ]);
  assert.match(route, /isSameOrigin\(request\)/);
  assert.match(route, /isOwner\(merchant\)/);
  assert.match(route, /acceptedCheckbox\(payload\?\.accepted\)/);
  assert.match(route, /if \(acceptance\.inserted\)/);
  assert.match(route, /catch \(error\)/);
  assert.match(service, /INSERT OR IGNORE INTO merchant_pilot_acceptances/);
  assert.match(service, /pilot_terms_version = \? AND pilot_terms_sha256 = \?/);
  assert.doesNotMatch(`${route}\n${service}`, /fingerprint|request\.headers\.get\(["'](?:cf-connecting-ip|x-forwarded-for)/i);
});

test("acceptance history and legal snapshots are immutable and migration is additive", async () => {
  const migration = await source("drizzle/0008_pilot_acceptance.sql");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS legal_document_versions/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS merchant_pilot_acceptances/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS idx_pilot_acceptance_current/);
  assert.match(migration, /BEFORE UPDATE ON merchant_pilot_acceptances/);
  assert.match(migration, /BEFORE DELETE ON merchant_pilot_acceptances/);
  assert.match(migration, /BEFORE UPDATE ON legal_document_versions/);
  assert.match(migration, /BEFORE DELETE ON legal_document_versions/);
  assert.doesNotMatch(migration, /\b(?:DROP|TRUNCATE|DELETE FROM|ALTER TABLE)\b/i);
});

test("signup never records pilot acceptance and the gated UI starts unchecked", async () => {
  const [signup, verify, dashboard] = await Promise.all([
    source("app/api/merchant/signup/route.ts"),
    source("app/api/merchant/signup/verify/route.ts"),
    source("components/DashboardApp.tsx"),
  ]);
  assert.doesNotMatch(signup, /termsAccepted|termsAcceptedAt|termsVersion/);
  assert.doesNotMatch(verify, /termsAcceptedAt|termsVersion/);
  assert.match(dashboard, /const \[accepted, setAccepted\] = useState\(false\)/);
  assert.match(dashboard, /disabled=\{!accepted \|\| busy\}/);
  assert.match(dashboard, /href="\/conditions-pilote"/);
  assert.match(dashboard, /href="\/accord-traitement-donnees"/);
  assert.match(dashboard, /Activer gratuitement mon pilote/);
});

test("client data paths require the current merchant acceptance", async () => {
  const protectedRoutes = [
    "app/api/merchant/scan/route.ts",
    "app/api/merchant/stamp/route.ts",
    "app/api/merchant/stamp/undo/route.ts",
    "app/api/merchant/redeem/route.ts",
    "app/api/merchant/redeem/undo/route.ts",
    "app/api/merchant/bonus/route.ts",
    "app/api/merchant/program/route.ts",
    "app/api/merchant/wallet-notifications/route.ts",
    "app/api/card/[code]/privacy/route.ts",
  ];
  for (const path of protectedRoutes) {
    assert.match(await source(path), /requireCurrentPilotAcceptance/, `${path} must be gated`);
  }
  const [data, notifications, dashboardRoute] = await Promise.all([
    source("lib/data.ts"),
    source("lib/wallet-notifications.ts"),
    source("app/api/merchant/dashboard/route.ts"),
  ]);
  assert.match(data, /merchantHasCurrentPilotAcceptance\(program\.merchantId\)/);
  assert.match(data, /merchantHasCurrentPilotAcceptance\(card\.merchantId\)/);
  assert.match(notifications, /merchantHasCurrentPilotAcceptance\(candidate\.merchantId\)/);
  assert.match(dashboardRoute, /clientDataAllowed/);
  assert.match(dashboardRoute, /pilotAcceptanceRequired/);
});
