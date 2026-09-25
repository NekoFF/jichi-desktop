/**
 * Einstellungen, die nur die Oberfläche betreffen.
 *
 * Getrennt von `settings.ts`: dort steht, *wie der Agent gestartet wird*, hier
 * steht, *wie die Anwendung sich verhält*. Der Unterschied ist nicht kosmetisch
 * — das eine ist Technik und gehört hinter „Erweitert“, das andere sieht jeder
 * Benutzer auf der ersten Seite der Einstellungen.
 *
 * Kein Geheimnis geht hier hinein. Der API-Schlüssel liegt in der geschützten
 * Ablage der Rust-Seite (eine 0600-Datei), nicht in dieser.
 */

export type Appearance = "system" | "light" | "dark";
export type PanelLayout = "floating" | "classic";

export interface Preferences {
  /** Wie der Agent den Benutzer anspricht. Rein lokal, nichts mit dem Konto zu tun. */
  name: string;
  /** Sprache der Oberfläche. Vorerst nur Deutsch. */
  language: "de";
  appearance: Appearance;
  /** Die neue freistehende Seitenleiste oder Claudes ursprüngliches Fensterlayout. */
  layout: PanelLayout;
}

const STORAGE_KEY = "jichi-desktop.preferences.v1";

export const DEFAULT_PREFERENCES: Preferences = {
  name: "",
  language: "de",
  appearance: "system",
  layout: "floating",
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
      layout: parsed.layout === "classic" ? "classic" : "floating",
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
 * Welches Thema tatsächlich gilt.
 *
 * `"system"` muss hier aufgelöst werden und nicht im Stylesheet: die Tokens des
 * Design Systems schalten ausschließlich über `[data-theme="dark"]` um und
 * kennen bewusst keine `prefers-color-scheme`-Abfrage. Ohne diese Auflösung
 * bliebe die Anwendung auch auf einem dunkel eingestellten Rechner hell.
 */
export function resolveAppearance(appearance: Appearance): "light" | "dark" {
  if (appearance !== "system") return appearance;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyAppearance(appearance: Appearance): void {
  document.documentElement.setAttribute("data-theme", resolveAppearance(appearance));
}

/**
 * Der Systemeinstellung folgen, solange `"system"` gewählt ist. Der Rückgabewert
 * löst die Bindung.
 */
export function watchAppearance(current: () => Appearance): () => void {
  try {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const react = () => {
      if (current() === "system") applyAppearance("system");
    };
    query.addEventListener("change", react);
    return () => query.removeEventListener("change", react);
  } catch {
    return () => {};
  }
}
