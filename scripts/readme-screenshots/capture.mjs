/**
 * Regenerate PNGs under docs/readme/ from https://soloflow.pmparker.net/
 * Run: npm install && node capture.mjs
 *
 * macOS: uses Google Chrome.app. Linux/Win: set PUPPETEER_EXECUTABLE_PATH.
 */
import puppeteer from "puppeteer-core";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "../..");
const OUT_DIR = join(REPO_ROOT, "docs/readme");

const EXECUTABLE =
  process.env.PUPPETEER_EXECUTABLE_PATH ||
  (process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : process.platform === "win32"
      ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
      : "/usr/bin/google-chrome");

const SHOTS = [
  { sel: "#hero", file: "website-hero.png" },
  { sel: "#problem", file: "website-problem.png" },
  { sel: "#features", file: "website-features.png" },
  { sel: "#architecture", file: "website-architecture.png" },
  { sel: "#memory", file: "website-memory.png" },
  { sel: "#comparison", file: "website-comparison.png" },
  { sel: "#getting-started", file: "website-quickstart.png" },
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: EXECUTABLE,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1280,900"],
  });
  const page = await browser.newPage();
  await page.setViewport({
    width: 1280,
    height: 900,
    deviceScaleFactor: 2,
  });
  await page.goto("https://soloflow.pmparker.net/", {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  await page.waitForSelector("#hero", { timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 2000));

  for (const { sel, file } of SHOTS) {
    const handle = await page.$(sel);
    if (!handle) {
      console.warn("skip (not found):", sel);
      continue;
    }
    const path = join(OUT_DIR, file);
    await handle.screenshot({ path });
    console.log("wrote", path);
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
