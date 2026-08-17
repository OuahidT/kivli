// Capture real Kivli screens with Playwright (mobile 430x932 @3x).
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync } from "node:fs";

const state = JSON.parse(readFileSync(new URL("./seed-state.json", import.meta.url), "utf8"));
const BASE = "http://localhost:3000";
const OUT = new URL("./shots/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const context = await browser.newContext({
  viewport: { width: 430, height: 932 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: "fr-FR",
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
});

const leaCode = state.codes["Léa"];

async function stampLea(quantity) {
  const res = await context.request.post(`${BASE}/api/merchant/stamp`, {
    data: {
      code: leaCode,
      quantity,
      requestId: crypto.randomUUID(),
      confirmMultiple: true,
      confirmRecent: true,
    },
  });
  if (!res.ok()) throw new Error(`stamp failed: ${res.status()} ${await res.text()}`);
}

// --- Login (cookie shared with browser context) ---
const login = await context.request.post(`${BASE}/api/merchant/login`, {
  data: { identifier: "hello@atelier-nova.fr", password: "KivliDemo2026" },
});
if (!login.ok()) throw new Error(`login failed: ${login.status()} ${await login.text()}`);
console.log("logged in");

const page = await context.newPage();
page.on("dialog", (dialog) => dialog.accept());
const settle = (ms = 1200) => page.waitForTimeout(ms);

async function shot(name, opts = {}) {
  await page.screenshot({ path: `${OUT}${name}.png`, ...opts });
  console.log("shot:", name);
}
async function shotEl(selector, name) {
  const el = page.locator(selector).first();
  await el.screenshot({ path: `${OUT}${name}.png` });
  console.log("shot:", name);
}

// --- 1. Landing page ---
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await settle(1500);
await shot("landing-hero");
await shot("landing-full", { fullPage: true });

// --- 2. Card Léa 0/8 ---
await page.goto(`${BASE}/c/${leaCode}`, { waitUntil: "networkidle" });
await page.waitForSelector(".loyalty-card", { timeout: 15000 });
await settle();
await shot("card-0");
await shot("card-0-full", { fullPage: true });
await shotEl(".loyalty-card", "card-0-el");

// --- 3. Card Léa 6/8 ---
await stampLea(6);
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector(".loyalty-card");
await settle();
await shot("card-6");
await shotEl(".loyalty-card", "card-6-el");

// --- 4. Dashboard: scanner tab ---
await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
await page.waitForSelector(".dashboard", { timeout: 20000 });
await settle();
// mobile tabs: Scanner
await page.locator(".mobile-tabs button").nth(1).click();
await page.waitForSelector(".scanner-card");
await settle();
await shot("scan-tab");
await shot("scan-tab-full", { fullPage: true });

// --- 5. Customers tab -> "+1" modal for Léa (6 -> 7) ---
await page.locator(".mobile-tabs button").nth(2).click();
await page.waitForSelector(".customer-table");
await settle();
const leaRow = page.locator(".table-row", { hasText: "Léa" }).first();
await leaRow.locator("button", { hasText: "Ajouter" }).first().click();
await page.waitForSelector(".result-modal", { timeout: 15000 });
await settle();
await shot("modal-plus1");
await shotEl(".result-modal", "modal-plus1-el");
await page.locator(".result-modal .result-close").click();
await settle(500);

// --- 6. Card Léa 7/8 ---
await page.goto(`${BASE}/c/${leaCode}`, { waitUntil: "networkidle" });
await page.waitForSelector(".loyalty-card");
await settle();
await shot("card-7");
await shotEl(".loyalty-card", "card-7-el");

// --- 7. Reward modal (7 -> 8) ---
await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
await page.waitForSelector(".dashboard");
await page.locator(".mobile-tabs button").nth(2).click();
await page.waitForSelector(".customer-table");
await settle();
const leaRow2 = page.locator(".table-row", { hasText: "Léa" }).first();
await leaRow2.locator("button", { hasText: "Ajouter" }).first().click();
await page.waitForSelector(".result-modal", { timeout: 15000 });
await settle();
await shot("modal-reward");
await shotEl(".result-modal", "modal-reward-el");
await page.locator(".result-modal .result-close").click();
await settle(500);

// --- 8. Card Léa: récompense disponible ---
await page.goto(`${BASE}/c/${leaCode}`, { waitUntil: "networkidle" });
await page.waitForSelector(".loyalty-card");
await settle();
await shot("card-reward");
await shot("card-reward-full", { fullPage: true });
await shotEl(".loyalty-card", "card-reward-el");

// --- 9. Dashboard overview (final stats) ---
await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
await page.waitForSelector(".dashboard");
await settle(1500);
await shot("dashboard-overview");
await shot("dashboard-overview-full", { fullPage: true });

// --- 10. Join page (empty + filled) ---
await page.goto(`${BASE}/join/${state.slug}`, { waitUntil: "networkidle" });
await settle(1500);
await shot("join");
await shot("join-full", { fullPage: true });
const nameInput = page.locator("input").first();
try {
  await nameInput.fill("Léa");
  await settle(400);
  await shot("join-filled");
} catch (e) {
  console.log("join fill skipped:", e.message);
}

// --- 11. Desktop dashboard (bonus wide shot) ---
const desktop = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  locale: "fr-FR",
});
const dlogin = await desktop.request.post(`${BASE}/api/merchant/login`, {
  data: { identifier: "hello@atelier-nova.fr", password: "KivliDemo2026" },
});
if (dlogin.ok()) {
  const dpage = await desktop.newPage();
  await dpage.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await dpage.waitForSelector(".dashboard", { timeout: 20000 });
  await dpage.waitForTimeout(1500);
  await dpage.screenshot({ path: `${OUT}dashboard-desktop.png` });
  console.log("shot: dashboard-desktop");
  // desktop landing hero
  await dpage.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await dpage.waitForTimeout(1500);
  await dpage.screenshot({ path: `${OUT}landing-desktop.png` });
  console.log("shot: landing-desktop");
}

await browser.close();
console.log("ALL DONE");
