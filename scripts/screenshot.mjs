// Screenshots the built game at iPhone size so Claude can check visuals before handing off.
// Usage: node scripts/screenshot.mjs [out.png] [waitMs] [--landscape]
import { chromium } from "playwright-core";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const out = args.find((a) => a.endsWith(".png")) || "screenshot.png";
const wait = Number(args.find((a) => /^\d+$/.test(a)) || 1500);
const land = args.includes("--landscape");
const exe = [process.env.CHROMIUM_PATH, "/opt/pw-browsers/chromium"].find((p) => p && existsSync(p));
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const viewport = land ? { width: 844, height: 390 } : { width: 390, height: 844 };
const page = await browser.newPage({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on("pageerror", (e) => console.error("pageerror:", e.message));
await page.goto(pathToFileURL(resolve("dist/index.html")).href);
await page.waitForTimeout(wait);
await page.screenshot({ path: out });
await browser.close();
console.log(`wrote ${out}`);
