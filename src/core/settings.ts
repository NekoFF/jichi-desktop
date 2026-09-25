/**
 * Was der Benutzer eingestellt hat — und was diese Anwendung bewusst nicht speichert.
 *
 * Gespeichert wird: Programm, Argumente, Arbeitsverzeichnis und die *Namen* von
 * Umgebungsvariablen samt *Pfad* zu der Datei, aus der ihr Wert kommt.
 *
 * Nicht gespeichert wird: der Wert eines Geheimnisses. Der Agent liest seinen
 * Schlüssel aus einer Umgebungsvariablen (`apiKeyEnv` in seiner Konfiguration);
 * diese Anwendung merkt sich nur, in welcher Datei er steht, und die Rust-Seite
 * liest sie beim Start. Damit liegt der Schlüssel dort, wo ihn seine
 * Dateirechte schützen, und nicht in einer Einstellungsdatei, die jeder
 * Entwicklerwerkzeugkasten anzeigt.
 */

import type { EnvSpec, LaunchSuggestion, Transport } from "./transport.ts";

export interface LaunchConfig {
  program: string;
  args: string[];
  /** Absoluter Pfad. ACP verlangt ihn für `session/new`. */
  cwd: string;
  env: EnvSpec[];
}

const STORAGE_KEY = "jichi-desktop.launch.v1";

/** Namen, deren Wert nie im Speicher der Anwendung landet. */
const SECRET_NAME = /KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL/i;

export interface StoreResult {
  /** Variablen, deren direkt eingetippter Wert nicht mitgespeichert wurde. */
  dropped: string[];
}

/**
 * Für die Ablage vorbereiten. Ein direkt eingetippter Wert zu einem Namen, der
 * nach Geheimnis aussieht, wird verworfen — der Name bleibt, damit die
 * Oberfläche darauf hinweisen und stattdessen eine Datei anbieten kann.
 */
function sanitize(config: LaunchConfig): { config: LaunchConfig; dropped: string[] } {
  const dropped: string[] = [];
  const env = config.env.map((spec) => {
    if (spec.value && !spec.file && SECRET_NAME.test(spec.name)) {
      dropped.push(spec.name);
      return { name: spec.name };
    }
    return spec;
  });
  return { config: { ...config, env }, dropped };
}

/** `localStorage` kann werfen (private Fenster, gesperrte Daten). Nie hart scheitern. */
export function readStored(): Partial<LaunchConfig> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Partial<LaunchConfig>) : null;
  } catch {
    return null;
  }
}

export function store(config: LaunchConfig): StoreResult {
  const { config: safe, dropped } = sanitize(config);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
  } catch {
    // Nur die Ablage scheitert; die laufende Sitzung benutzt weiter das Original.
  }
  return { dropped };
}

export function clearStored(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nichts zu tun */
  }
}

/** Der Vorschlag der Plattform, überschrieben von dem, was gespeichert ist. */
export function mergeConfig(
  suggestion: LaunchSuggestion,
  stored: Partial<LaunchConfig> | null,
): LaunchConfig {
  return {
    program: stored?.program?.trim() || suggestion.resolved || suggestion.program,
    args: Array.isArray(stored?.args) ? stored.args : suggestion.args,
    cwd: stored?.cwd?.trim() || suggestion.cwd,
    env: Array.isArray(stored?.env) ? stored.env : suggestion.env.map((e) => ({ ...e })),
  };
}

export async function resolveConfig(transport: Transport): Promise<LaunchConfig> {
  return mergeConfig(await transport.defaultLaunch(), readStored());
}

/**
 * Argumente aus einer Zeile. Anführungszeichen werden geachtet, weil ein Pfad
 * mit Leerzeichen sonst in zwei Argumente zerfällt und der Start mit einer
 * unverständlichen Meldung scheitert.
 */
export function parseArgs(input: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let started = false;

  for (const ch of input) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (started) args.push(current);
      current = "";
      started = false;
      continue;
    }
    current += ch;
    started = true;
  }
  if (started) args.push(current);
  return args;
}

export function formatArgs(args: readonly string[]): string {
  return args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(" ");
}
