import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
const workerPromise = import(workerUrl.href).then((module) => module.default);

test("publishes the Kivli product routes", async () => {
  const worker = await workerPromise;
  const response = await worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html", host: "localhost" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Kivli/);
  assert.match(html, /Créez une habitude, pas juste une carte/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("publishes individual employee access and protected stamp controls", async () => {
  const worker = await workerPromise;
  const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const context = { waitUntil() {}, passThroughOnException() {} };

  for (const path of ["/merchant", "/dashboard"]) {
    const response = await worker.fetch(
      new Request(`http://localhost${path}`, { headers: { accept: "text/html", host: "localhost" } }),
      env,
      context,
    );
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Kivli/);
  }

  const [employeesRoute, stampRoute, undoRoute, dashboard] = await Promise.all([
    readFile(new URL("../app/api/merchant/employees/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/merchant/stamp/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/merchant/stamp/undo/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/DashboardApp.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(employeesRoute, /isOwner\(merchant\)/);
  assert.match(stampRoute, /stamp_requests/);
  assert.match(stampRoute, /recent_scan/);
  assert.match(undoRoute, /employee_actions/);
  assert.match(undoRoute, /-5 minutes/);
  assert.match(dashboard, /item\.id === "scan"/);
});

test("contains no retired brand in active source", async () => {
  const root = new URL("../", import.meta.url);
  const retiredBrand = [116, 97, 109, 112, 111].map((code) => String.fromCharCode(code)).join("");
  const forbidden = new RegExp(retiredBrand, "i");
  const ignored = new Set([".git", ".next", "dist", "node_modules"]);
  const textExtensions = /\.(?:css|html|js|json|jsonc|md|mjs|sql|svg|ts|tsx|yaml|yml)$/i;
  const violations = [];

  async function scan(directory, relative = "") {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const nextRelative = relative ? `${relative}/${entry.name}` : entry.name;
      const nextUrl = new URL(`${nextRelative}${entry.isDirectory() ? "/" : ""}`, root);
      if (entry.isDirectory()) await scan(nextUrl, nextRelative);
      else if (textExtensions.test(entry.name) && forbidden.test(await readFile(nextUrl, "utf8"))) {
        violations.push(nextRelative);
      }
    }
  }

  await scan(root);
  assert.deepEqual(violations, []);
});

test("keeps reward redemption separate from earning operations", async () => {
  const [stampRoute, redeemRoute, scanRoute, joinRoute, scanner, dashboard, migration] = await Promise.all([
    readFile(new URL("../app/api/merchant/stamp/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/merchant/redeem/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/merchant/scan/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/join/[slug]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/MerchantScanner.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/DashboardApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0001_loyalty_engine_v2.sql", import.meta.url), "utf8"),
  ]);
  assert.match(stampRoute, /reason, actor_role/);
  assert.match(stampRoute, /purchase/);
  assert.match(redeemRoute, /0, 'redeem'/);
  assert.match(redeemRoute, /Choisis précisément la récompense/);
  assert.match(redeemRoute, /reward_id/);
  assert.match(scanRoute, /rewards/);
  assert.doesNotMatch(scanner, /amountCents|quantity-picker|amount-picker/);
  assert.match(dashboard, /ScanDecisionModal/);
  assert.match(dashboard, /Aucune opération n’est enregistrée avant ton choix/);
  assert.match(joinRoute, /normalizePhone/);
  assert.match(joinRoute, /marketing_consent/);
  assert.match(migration, /program_reward_tiers/);
});

test("uses a cumulative wallet for spend programs", async () => {
  const [stampRoute, bonusRoute, redeemRoute, undoRewardRoute, scanRoute, card, schema] = await Promise.all([
    readFile(new URL("../app/api/merchant/stamp/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/merchant/bonus/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/merchant/redeem/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/merchant/redeem/undo/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/merchant/scan/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/CustomerCard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/index.ts", import.meta.url), "utf8"),
  ]);
  assert.match(stampRoute, /membership\.points \+ quantity/);
  assert.match(bonusRoute, /member\.points \+ quantity/);
  assert.match(redeemRoute, /pointsAfter = member\.points - tier\.threshold/);
  assert.match(redeemRoute, /delta, reason, actor_role, points_before, points_after/);
  assert.match(undoRewardRoute, /pointsRestored/);
  assert.match(undoRewardRoute, /reward_restore:/);
  assert.match(scanRoute, /program_reward_tiers/);
  assert.match(card, /wallet-program-view/);
  assert.match(card, /Encore \$\{missing\}/);
  assert.doesNotMatch(card, /Utiliser cette récompense/);
  assert.match(schema, /wallet_mode_ready/);
  assert.match(schema, /status = 'converted'/);
});

test("keeps first-visit and navigation polish deterministic", async () => {
  const [dashboard, dashboardRoute, customerCard, scrollReset] = await Promise.all([
    readFile(new URL("../components/DashboardApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/merchant/dashboard/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/CustomerCard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/RouteScrollReset.tsx", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(dashboard, /welcome=preview/);
  assert.doesNotMatch(dashboardRoute, /previewWelcome/);
  assert.match(dashboard, /welcomePending: false/);
  assert.match(customerCard, /card-mobile-save/);
  assert.match(customerCard, /aria-expanded=\{saveCardOpen\}/);
  assert.match(scrollReset, /window\.scrollTo\(0, 0\)/);
});

test("keeps the premium iPhone mockup tightly fitted to its screen", async () => {
  const [homePage, styles] = await Promise.all([
    readFile(new URL("../components/HomePage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(homePage, /kivli-iphone-premium\.png/);
  assert.match(homePage, /className="phone-signal"/);
  assert.match(homePage, /className="phone-wifi"/);
  assert.match(homePage, /className="phone-battery"/);
  assert.doesNotMatch(homePage, /className="phone-dynamic-island"/);
  assert.match(homePage, /strokeWidth="1\.4"/);
  assert.doesNotMatch(homePage, /phone-battery"><b>4<\/b>/);
  assert.match(styles, /inset: 2% 5\.45% 2\.4%/);
  assert.match(styles, /clip-path: inset\(0 round 13\.5% \/ 6\.5%\)/);
});

test("keeps Google Wallet rewards visible on the card face", async () => {
  const wallet = await readFile(new URL("../lib/google-wallet.ts", import.meta.url), "utf8");

  assert.match(wallet, /cardTemplateOverride/);
  assert.match(wallet, /object\.loyaltyPoints\.balance/);
  assert.match(wallet, /object\.secondaryLoyaltyPoints\.balance/);
  assert.match(wallet, /kivli_available_reward/);
  assert.match(wallet, /kivli_next_tier/);
  assert.match(wallet, /Disponible maintenant/);
  assert.match(wallet, /Prochain palier/);
  assert.match(wallet, /await upsertClass\(card, config\.issuerId\)/);
});
