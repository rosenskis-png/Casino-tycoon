import { chromium } from "playwright-core";
const out = process.argv[2];
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on("pageerror", (e) => console.error("pageerror:", e.message));
await page.goto("file:///home/user/Casino-tycoon/dist/index.html#play");
await page.waitForTimeout(800);
await page.evaluate(() => window.__ct.scenario("testfloor"));
await page.waitForTimeout(400);
await page.evaluate(() => {
  const h = window.__ctHost; h.setSpeed(0); const g = h.game, s = g.state;
  const roles = ["janitor", "tech", "server", "guard", "pitboss", "operator", "enforcer", "dealer", "officer", "inspector"];
  // Clear a strip: put one of each in a row on open floor, standing still facing down.
  const y0 = 35, x0 = 16;
  roles.forEach((r, k) => {
    const a = s.agents.find((b) => b.role === r && !b.placed) ?? { ...s.agents.find((b) => b.role === "janitor"), id: 90000 + k, role: r, st: undefined };
    if (!s.agents.includes(a)) s.agents.push(a);
    a.placed = 1; a.x = a.nx = x0 + (k % 5) * 2; a.y = a.ny = y0 + Math.floor(k / 5) * 2; a.t = 0; a.act = "wait"; a.timer = 1e9; a.dest = a.y * s.map.w + a.x; a.target = -1;
  });
  h.camera.cx = x0 + 4.5; h.camera.cy = y0 + 1.5; h.camera.level = 1; h.notify();
});
await page.waitForTimeout(700);
await page.screenshot({ path: out, clip: { x: 0, y: 300, width: 390, height: 200 } });
await browser.close();
