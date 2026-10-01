import { chromium } from "playwright-core";
import fs from "node:fs";
const exe = process.env.CHROME; // Pfad zu Chrome/Chromium
const out = new URL("../assets/", import.meta.url).pathname + "mockups";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: exe, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
for (const s of (process.argv[2] ?? "hero,dunkel,windows,linux,monitor").split(",")) {
  await p.goto(`http://localhost:1420/screenshots/mockups.html?szene=${s}`);
  await p.waitForLoadState("networkidle");
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}/${s}.png` });
  console.log(s, "ok");
}
await browser.close();
