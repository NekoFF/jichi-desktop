/**
 * Sprache der Oberfläche: Deutsch oder Englisch.
 *
 * **Der deutsche Text ist der Schlüssel.** Im Code steht `t("Senden")`, nicht
 * `t("composer.send")` — so bleibt der Quelltext lesbar wie vorher, und wo eine
 * Übersetzung fehlt, erscheint Deutsch statt eines Schlüsselnamens. Das
 * englische Wörterbuch liegt in `i18n-en/`; `src/ui/i18n.test.ts` prüft, dass
 * jeder `t("…")` dort steht und die Platzhalter übereinstimmen.
 *
 * Regeln für Aufrufer:
 * - Das erste Argument ist immer ein **Literal** in doppelten Anführungszeichen
 *   (sonst findet der Test es nicht).
 * - Einsetzen mit Platzhaltern: `t("vor {n} Min.", { n })`.
 * - Einzahl/Mehrzahl als zwei Schlüssel: `n === 1 ? t("1 Frage") : t("{n} Fragen", { n })`.
 * - Eigennamen (jichi, HRZ, JLU, MCP, Git …) und Befehle bleiben, wie sie sind.
 */

import { EN } from "./i18n-en/index.ts";

export type Sprache = "de" | "en";
export const SPRACHEN: ReadonlyArray<{ id: Sprache; name: string }> = [
  { id: "de", name: "Deutsch" },
  { id: "en", name: "English" },
];

let aktuell: Sprache = "de";
const hoerer = new Set<() => void>();

/** Die Sprache, die ein neuer Benutzer bekommt: die des Systems, wenn es Deutsch ist, sonst Englisch. */
export function systemSprache(): Sprache {
  const l = typeof navigator === "undefined" ? "de" : navigator.language || "de";
  return /^de\b/i.test(l) ? "de" : "en";
}

export function sprache(): Sprache {
  return aktuell;
}

export function setSprache(s: Sprache): void {
  if (s !== "de" && s !== "en") return;
  if (typeof document !== "undefined") document.documentElement.lang = s;
  if (s === aktuell) return;
  aktuell = s;
  hoerer.forEach((f) => f());
}

export function onSprache(f: () => void): () => void {
  hoerer.add(f);
  return () => hoerer.delete(f);
}

/** Für Datum und Zahlen. */
export function locale(): string {
  return aktuell === "en" ? "en-GB" : "de-DE";
}

/** Übersetzen. `{name}` wird aus `vars` ersetzt. */
export function t(de: string, vars?: Record<string, string | number>): string {
  const s = aktuell === "de" ? de : (EN[de] ?? de);
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}
