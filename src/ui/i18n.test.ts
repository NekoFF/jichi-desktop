/**
 * Wächter der Übersetzung: jeder `t("…")` im Quelltext hat einen englischen
 * Eintrag, mit denselben Platzhaltern — sonst sähe ein englischer Benutzer
 * mitten in der Oberfläche Deutsch, und niemand merkte es beim Bauen.
 */

import { describe, expect, it } from "vitest";

import { EN } from "../core/i18n-en/index.ts";
import { EINGABE } from "../core/i18n-en/eingabe.ts";
import { EINSTELLUNGEN } from "../core/i18n-en/einstellungen.ts";
import { KERN } from "../core/i18n-en/kern.ts";
import { PANEL } from "../core/i18n-en/panel.ts";
import { VERLAUF } from "../core/i18n-en/verlauf.ts";
import { setSprache, t } from "../core/i18n.ts";

// Der Quelltext als Text, über Vite — ohne Node-Typen im Projekt.
const quellen = import.meta.glob(["../**/*.{ts,tsx}", "../*.tsx", "!../**/*.test.{ts,tsx}", "!../core/selftest.ts", "!../core/i18n.ts", "!../core/i18n-en/**"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** JS-Stringliteral in doppelten Anführungszeichen auswerten. */
const lesen = (lit: string) => JSON.parse(lit.replace(/\\'/g, "'")) as string;
const platzhalter = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

const aufrufe: Array<{ datei: string; de: string }> = [];
const nichtLiteral: string[] = [];
for (const [d, text] of Object.entries(quellen)) {
  for (const m of text.matchAll(/(?<![\w.$])t\(\s*("(?:[^"\\\n]|\\.)*")\s*[,)]/g)) aufrufe.push({ datei: d, de: lesen(m[1]) });
  for (const m of text.matchAll(/(?<![\w.$])t\(\s*([^"\s)][^,)]*)/g)) if (!/^(de|s)\b/.test(m[1])) nichtLiteral.push(`${d}: t(${m[1]}`);
}

describe("Übersetzung", () => {
  it("findet Aufrufe überhaupt (sonst prüfte der Test nichts)", () => {
    expect(Object.keys(quellen).some((k) => k.endsWith("Einstellungen.tsx"))).toBe(true);
    expect(aufrufe.length).toBeGreaterThan(0);
  });

  it("jeder t(\"…\") hat einen englischen Eintrag", () => {
    const fehlt = [...new Set(aufrufe.filter((a) => !(a.de in EN)).map((a) => `${a.datei}: ${a.de}`))];
    expect(fehlt).toEqual([]);
  });

  it("die Platzhalter stimmen überein", () => {
    const falsch = Object.entries(EN).filter(([de, en]) => platzhalter(de) !== platzhalter(en)).map(([de]) => de);
    expect(falsch).toEqual([]);
  });

  it("dasselbe Wort heisst in allen Teilen des Wörterbuchs gleich", () => {
    const teile = { KERN, EINGABE, EINSTELLUNGEN, VERLAUF, PANEL };
    const gesehen = new Map<string, string>();
    const widerspruch: string[] = [];
    for (const [teil, woerter] of Object.entries(teile)) {
      for (const [de, en] of Object.entries(woerter)) {
        const vorher = gesehen.get(de);
        if (vorher !== undefined && vorher !== en) widerspruch.push(`${teil}: „${de}“ = „${en}“ ≠ „${vorher}“`);
        gesehen.set(de, en);
      }
    }
    expect(widerspruch).toEqual([]);
  });

  it("t() bekommt nur Literale", () => {
    expect(nichtLiteral).toEqual([]);
  });

  it("t() übersetzt und setzt ein", () => {
    const de = "Sprache";
    setSprache("en");
    expect(t(de)).toBe(EN[de]);
    setSprache("de");
    expect(t(de)).toBe(de);
    expect(t("x {n} y", { n: 3 })).toBe("x 3 y");
  });
});
