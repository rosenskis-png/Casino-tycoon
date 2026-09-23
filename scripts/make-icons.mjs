// Draws the home-screen icon (pixel-art horseshoe on carpet) and writes PNGs to public/.
// Rerun with `node scripts/make-icons.mjs` if the icon design changes.
import { chromium } from "playwright-core";
import { existsSync, writeFileSync } from "node:fs";

const exe = [process.env.CHROMIUM_PATH, "/opt/pw-browsers/chromium"].find((p) => p && existsSync(p));
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage();
const ART = [
  "................",
  "................",
  "...GG......GG...",
  "..GYYG....GYYG..",
  "..GYG......GYG..",
  "..GYG......GYG..",
  "..GYG......GYG..",
  "..GYG......GYG..",
  "..GYYG....GYYG..",
  "...GYYG..GYYG...",
  "....GYYGGYYG....",
  ".....GYYYYG.....",
  "......GGGG......",
  "................",
  "................",
  "................",
];
for (const size of [180, 192, 512]) {
  const b64 = await page.evaluate(({ ART, size }) => {
    const c = document.createElement("canvas");
    c.width = c.height = 16;
    const g = c.getContext("2d");
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const dd = Math.abs(x - 7.5) + Math.abs(y - 7.5);
      g.fillStyle = (x + y) % 4 === 0 ? "#48152a" : "#541929";
      if (dd > 9.5) g.fillStyle = "#3a1020";
      g.fillRect(x, y, 1, 1);
      const ch = ART[y][x];
      if (ch === "G") { g.fillStyle = "#8f6d2c"; g.fillRect(x, y, 1, 1); }
      if (ch === "Y") { g.fillStyle = "#ffd36b"; g.fillRect(x, y, 1, 1); }
    }
    const out = document.createElement("canvas");
    out.width = out.height = size;
    const o = out.getContext("2d");
    o.imageSmoothingEnabled = false;
    o.drawImage(c, 0, 0, size, size);
    return out.toDataURL("image/png").split(",")[1];
  }, { ART, size });
  writeFileSync(`public/icon-${size}.png`, Buffer.from(b64, "base64"));
}
await browser.close();
console.log("icons written");
