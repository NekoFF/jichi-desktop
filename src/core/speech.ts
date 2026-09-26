/**
 * Sprache, soweit sie nichts mit Tauri zu tun hat: welches Modell, und was von
 * einer Antwort sich überhaupt vorlesen lässt.
 */

import type { GatewayModel } from "./transport.ts";

export const DEFAULT_TRANSCRIBE = "jlu/whisper-1";
export const DEFAULT_SPEECH = "jlu/tts-1-hd";
/** So viel nimmt `/audio/speech` in einem Stück (Zeichen). */
export const SPEAK_MAX = 4096;

/**
 * Das Modell für Diktat bzw. Vorlesen aus der Liste des Gateways: das
 * bekannte, wenn es da ist, sonst das erste passende. Ohne Liste (noch nicht
 * geladen, offline) das bekannte — Rust prüft ohnehin, dass es `jlu/…` ist.
 */
export function speechModel(models: readonly GatewayModel[] | undefined, kind: "transcribe" | "speech"): string {
  const fallback = kind === "transcribe" ? DEFAULT_TRANSCRIBE : DEFAULT_SPEECH;
  const passend = (models ?? []).filter((m) => m.kind === kind).map((m) => m.id);
  return passend.includes(fallback) ? fallback : passend[0] ?? fallback;
}

/**
 * Markdown so umschreiben, wie man es vorliest: Code wird nicht buchstabiert,
 * Verweise werden zu ihrem Text, Auszeichnung verschwindet.
 */
export function sprechbar(markdown: string): string {
  let t = markdown.replace(/\r\n/g, "\n");
  t = t.replace(/```[\s\S]*?(```|$)/g, "\n(Codeblock ausgelassen.)\n");
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  t = t.replace(/`([^`]+)`/g, "$1");
  t = t.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  t = t.replace(/^\s*>\s?/gm, "");
  t = t.replace(/^\s*[-*+]\s+/gm, "");
  t = t.replace(/^\s*\|?\s*:?-{3,}.*$/gm, "");
  t = t.replace(/\|/g, " ");
  t = t.replace(/(\*\*|__|~~)(.+?)\1/g, "$2");
  t = t.replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,!?:;]|$)/g, "$1$2");
  t = t.replace(/https?:\/\/\S+/g, "");
  t = t.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (t.length > SPEAK_MAX) {
    const schnitt = t.slice(0, SPEAK_MAX);
    const satz = Math.max(schnitt.lastIndexOf(". "), schnitt.lastIndexOf("\n"));
    t = satz > SPEAK_MAX * 0.6 ? schnitt.slice(0, satz + 1) : schnitt;
  }
  return t;
}
