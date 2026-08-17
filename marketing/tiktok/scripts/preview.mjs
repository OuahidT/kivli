import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
const HERE = new URL("./", import.meta.url).pathname;
mkdirSync(`${HERE}preview`, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
await page.goto(`file://${HERE}comp.html`);
await page.waitForFunction("window.READY === true", { timeout: 60000 });
const frames = process.argv.slice(2).map(Number);
const list = frames.length ? frames : [10, 45, 80, 110, 150, 190, 230, 280, 340, 390, 450, 500, 560, 620, 700, 730, 800, 835];
for (const f of list) {
  await page.evaluate(`seek(${f})`);
  await page.screenshot({ path: `${HERE}preview/f${String(f).padStart(3, "0")}.png` });
  console.log("f", f);
}
await browser.close();
