// Headless smoke check (FOUNDATIONS §1): load the single-file build at phone size and fail on any error.
// Once the engine exists this also drives N fast game days across seeds via window.__ct and checks invariants.
import { chromium } from "playwright-core";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const file = resolve("dist/index.html");
if (!existsSync(file)) { console.error("dist/index.html missing: run npm run build first"); process.exit(1); }
// Use a preinstalled Chromium when present (cloud sessions), else Playwright's own (CI installs it).
const exe = [process.env.CHROMIUM_PATH, "/opt/pw-browsers/chromium"].find((p) => p && existsSync(p));
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
await page.goto(pathToFileURL(file).href);
await page.waitForTimeout(1000);
const hook = await page.evaluate(() => typeof window.__ct);
if (hook !== "undefined") {
  // Engine hook contract (defined in M1): __ct.smoke({ days, seeds }) returns { ok, problems[] }.
  const res = await page.evaluate(() => window.__ct.smoke({ days: 7, seeds: [1, 2] }));
  if (!res.ok) errors.push(...res.problems);
}
await browser.close();
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log("smoke ok");
