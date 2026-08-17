// Render comp.html frame by frame -> pipe PNGs into ffmpeg -> H.264 mp4
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";

const FF = "/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2";
const HERE = new URL("./", import.meta.url).pathname;
const OUT = process.argv[2] || `${HERE}kivli-tiktok.mp4`;
const TOTAL = 840, FPS = 30;

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
await page.goto(`file://${HERE}comp.html`);
await page.waitForFunction("window.READY === true", { timeout: 60000 });
console.log("compositor ready");

const ff = spawn(FF, [
  "-y",
  "-f", "image2pipe", "-vcodec", "png", "-framerate", String(FPS), "-i", "-",
  "-c:v", "libx264", "-preset", "medium", "-crf", "18",
  "-pix_fmt", "yuv420p", "-movflags", "+faststart",
  OUT,
], { stdio: ["pipe", "inherit", "inherit"] });

const t0 = Date.now();
for (let f = 0; f < TOTAL; f++) {
  await page.evaluate(`seek(${f})`);
  const buf = await page.screenshot({ type: "png" });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  if (f % 60 === 0) console.log(`frame ${f}/${TOTAL} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
ff.stdin.end();
await new Promise((resolve, reject) => ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`)))));
await browser.close();
console.log("VIDEO DONE:", OUT, `${((Date.now() - t0) / 1000).toFixed(0)}s`);
