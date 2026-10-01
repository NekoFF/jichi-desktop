import { chromium } from "playwright-core";
import fs from "node:fs";
const exe = process.env.CHROME; // Pfad zu Chrome/Chromium
const out = new URL("../assets/", import.meta.url).pathname + "screenshots";
fs.mkdirSync(out, { recursive: true });
const base = "http://localhost:1420/screenshots/demo.html";
const browser = await chromium.launch({ executablePath: exe, headless: true });
const nur = process.argv[2];
const UA = {
  win: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0",
  linux: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko)",
};
async function szene(name, query, aktion, ua) {
  if (nur && !nur.split(",").includes(name)) return;
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, ...(ua ? { userAgent: UA[ua] } : {}) });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log(`  [${name}] pageerror: ${e.message}`));
  await p.goto(`${base}?${query}`);
  await p.waitForTimeout(1500);
  try {
    await aktion(p);
    await p.screenshot({ path: `${out}/${name}.png` });
    console.log(`${name}: ok`);
  } catch (e) {
    await p.screenshot({ path: `${out}/${name}-FEHLER.png` });
    console.log(`${name}: FEHLER ${String(e).split("\n")[0]}`);
  }
  await ctx.close();
}
async function gespraech(p, beide = true) {
  const feld = p.getByPlaceholder(/Ask jichi|Frag jichi/);
  await feld.fill("Give me a short overview of this project.");
  await p.getByRole("button", { name: "Send" }).click();
  await p.getByText("Project Overview").first().waitFor({ timeout: 15000 });
  // Bis der Zug zu Ende ist: dann stehen die Aktionen mit „just now“ darunter.
  await p.getByText(/just now|gerade eben/).first().waitFor({ timeout: 20000 });
  await p.waitForTimeout(600);
  if (!beide) return;
  await feld.fill("The test test_freezing_point fails. Find the bug and fix it.");
  await p.getByRole("button", { name: "Send" }).click({ timeout: 15000 });
  await p.waitForTimeout(4500);
}
await szene("chat-light", "lang=en&theme=light", async (p) => { await gespraech(p); await p.keyboard.press("Meta+Shift+D"); await p.waitForTimeout(1500); });
await szene("chat-dark", "lang=en&theme=dark", async (p) => { await gespraech(p); await p.keyboard.press("Meta+Shift+E"); await p.waitForTimeout(1200); });
await szene("permission", "lang=en&theme=light&stop=perm", async (p) => {
  await gespraech(p); await p.getByText(/is asking for permission/).first().waitFor({ timeout: 10000 }); await p.waitForTimeout(800);
  await p.locator(".rueckfrage").screenshot({ path: `${out}/permission-card.png` });
});
await szene("docs", "lang=en&theme=light", async (p) => { await gespraech(p, false); await p.keyboard.press("Meta+Shift+H"); await p.getByText("Start here").first().waitFor({ timeout: 10000 }); await p.waitForTimeout(800); });
await szene("setup-project", "lang=en&theme=light", async (p) => {
  await p.locator(".eingabe").getByRole("button", { name: "Add" }).click();
  await p.getByText("Set up project").first().click();
  await p.getByText("python-cli", { exact: true }).click();
  await p.getByRole("button", { name: "Preview" }).click();
  await p.getByText(/\d+ new/).first().waitFor({ timeout: 8000 });
  await p.waitForTimeout(800);
});
await szene("settings-de", "lang=de&theme=light", async (p) => { await p.getByText("Einstellungen").first().click(); await p.waitForTimeout(1200); });
await szene("docs-win", "lang=en&theme=light", async (p) => { await gespraech(p, false); await p.keyboard.press("Control+Shift+H"); await p.getByText("Start here").first().waitFor({ timeout: 10000 }); await p.waitForTimeout(800); }, "win");
await szene("setup-linux", "lang=de&theme=light", async (p) => {
  await p.locator(".eingabe").getByRole("button", { name: "Hinzufügen" }).click();
  await p.getByText("Projekt einrichten").first().click();
  await p.getByText("python-cli", { exact: true }).click();
  await p.getByRole("button", { name: "Vorschau" }).click();
  await p.getByText(/\d+ neu/).first().waitFor({ timeout: 8000 });
  await p.waitForTimeout(800);
}, "linux");
await browser.close();
