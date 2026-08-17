import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";

const state = JSON.parse(readFileSync(new URL("./seed-state.json", import.meta.url), "utf8"));
const BASE = "http://localhost:3000";
const OUT = new URL("./shots/", import.meta.url).pathname;

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
await context.request.post(`${BASE}/api/merchant/login`, {
  data: { identifier: "hello@atelier-nova.fr", password: "KivliDemo2026" },
});
const page = await context.newPage();
await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
await page.waitForSelector(".stats-row", { timeout: 20000 });
await page.waitForTimeout(1200);
await page.addStyleTag({ content: ".mobile-tabs { display: none !important; }" });
await page.locator(".stats-row").screenshot({ path: `${OUT}stats-row-el.png` });
await page.locator(".activity-panel").screenshot({ path: `${OUT}activity-el.png` });
// viewport shot scrolled to stats + activity
await page.locator(".stats-row").scrollIntoViewIfNeeded();
await page.evaluate(() => window.scrollBy(0, -60));
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}dashboard-stats.png` });
console.log("done stats/activity");
await browser.close();
