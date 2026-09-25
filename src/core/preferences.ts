/**
 * Einstellungen, die nur die Oberfläche betreffen.
 *
 * Getrennt von `settings.ts`: dort steht, *wie der Agent gestartet wird*, hier
 * steht, *wie die Anwendung sich verhält*. Der Unterschied ist nicht kosmetisch
 * — das eine ist Technik und gehört hinter „Erweitert“, das andere sieht jeder
 * Benutzer auf der ersten Seite der Einstellungen.
 *
 * Kein Geheimnis geht hier hinein. Der API-Schlüssel liegt im Schlüsselbund des
 * Betriebssystems, nicht in dieser Ablage.
 */

export type Appearance = "system" | "light" | "dark";

export interface Preferences {
  /** Wie der Agent den Benutzer anspricht. Rein lokal, nichts mit dem Konto zu tun. */
  name: string;
  /** Sprache der Oberfläche. Vorerst nur Deutsch. */
  language: "de";
  appearance: Appearance;
}

const STORAGE_KEY = "jichi-desktop.preferences.v1";

export const DEFAULT_PREFERENCES: Preferences = {
  name: "",
  language: "de",
  appearance: "system",
};

export function readPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return {
      name: typeof parsed.name === "string" ? parsed.name : DEFAULT_PREFERENCES.name,
      language: "de",
      appearance:
        parsed.appearance === "light" || parsed.appearance === "dark"
          ? parsed.appearance
          : "system",
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function writePreferences(preferences: Preferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Nur die Ablage scheitert; die laufende Sitzung behält ihre Einstellung.
  }
}

/**
 * Das Erscheinungsbild auf das Dokument anwenden.
 *
 * `data-theme` ist die Fläche, auf der auch das Design System sein helles und
 * dunkles Thema unterscheidet — bei `"system"` wird nichts gesetzt, dann
 * entscheidet die Voreinstellung des Betriebssystems.
 */
export function applyAppearance(appearance: Appearance): void {
  const root = document.documentElement;
  if (appearance === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", appearance);
}
