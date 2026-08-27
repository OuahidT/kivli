import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { calculatePilotStatus, pilotEndFromStart } from "../lib/pilot-duration-core.ts";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("a pilot starts at activation and initially lasts exactly 60 days", () => {
  const startedAt = "2026-08-27T10:00:00.000Z";
  const endsAt = pilotEndFromStart(startedAt);
  assert.equal(endsAt, "2026-10-26T10:00:00.000Z");
  const status = calculatePilotStatus(startedAt, endsAt, new Date(startedAt));
  assert.equal(status.daysRemaining, 60);
  assert.equal(status.state, "standard");
});

test("remaining days never become negative and expiry remains a continued access state", () => {
  const startedAt = "2026-01-01T00:00:00.000Z";
  const endsAt = pilotEndFromStart(startedAt);
  const status = calculatePilotStatus(startedAt, endsAt, new Date("2027-01-01T00:00:00.000Z"));
  assert.equal(status.daysRemaining, 0);
  assert.equal(status.state, "continued");
});

test("a later end date is identified as a free extension", () => {
  const status = calculatePilotStatus(
    "2026-01-01T00:00:00.000Z",
    "2026-04-15T00:00:00.000Z",
    new Date("2026-02-01T00:00:00.000Z"),
  );
  assert.equal(status.state, "extended");
  assert.ok(status.daysRemaining > 0);
});

test("the additive migration preserves history and backfills from the first acceptance", async () => {
  const migration = await source("drizzle/0009_pilot_duration.sql");
  assert.match(migration, /ADD COLUMN pilot_started_at TEXT/);
  assert.match(migration, /ADD COLUMN pilot_ends_at TEXT/);
  assert.match(migration, /MIN\(a\.accepted_at\)/);
  assert.match(migration, /'\+60 days'/);
  assert.doesNotMatch(migration, /\b(?:DROP|TRUNCATE|DELETE FROM)\b/i);
});

test("reaccepting current documents cannot restart an existing pilot clock", async () => {
  const acceptance = await source("lib/pilot-acceptance.ts");
  assert.match(acceptance, /pilot_started_at = COALESCE\(pilot_started_at, \?\)/);
  assert.match(acceptance, /pilot_ends_at = COALESCE\(pilot_ends_at, datetime\(\?, '\+60 days'\)\)/);
});

test("only the authenticated global admin can extend a merchant pilot", async () => {
  const admin = await source("admin/src/index.ts");
  const identityGate = admin.indexOf("const identity = await getAdmin(request, env)");
  const pilotRoute = admin.indexOf("const pilotMatch = path.match");
  assert.ok(identityGate >= 0 && pilotRoute > identityGate);
  assert.match(admin, /requireSameOrigin\(request\)/);
  assert.match(admin, /UPDATE merchants SET pilot_ends_at = \? WHERE id = \?/);
  assert.match(admin, /merchant\.pilot_extended/);
  assert.match(admin, /addDays < 1 \|\| addDays > 3650/);
});

test("the application has no pilot-expiry billing or access-blocking branch", async () => {
  const [dashboard, dashboardRoute, duration] = await Promise.all([
    source("components/DashboardApp.tsx"),
    source("app/api/merchant/dashboard/route.ts"),
    source("lib/pilot-duration-core.ts"),
  ]);
  assert.match(dashboard, /Accès pilote prolongé gratuitement/);
  assert.match(duration, /Math\.max\(0/);
  assert.doesNotMatch(dashboardRoute, /pilot\.(?:endsAt|daysRemaining|state)[\s\S]{0,100}(?:return|error)/);
  assert.doesNotMatch(duration, /throw new Error\([^)]*(?:expir|échéance)/i);
});
