/**
 * Ein Projekt für jichi einrichten — mit jichis eigenem `init` (Scaffolding).
 *
 * Die Anwendung erfindet keine Vorlagen: welche Packs es gibt, was sie
 * schreiben und wohin, sagt jichi (`init --list`, `init … --dry-run`,
 * docs/SCAFFOLDING.md). Hier wird nur seine Ausgabe gelesen.
 */

export interface InitPack {
  name: string;
  text: string;
}

export interface InitDatei {
  /** `neu` (+), `ueberschrieben` (~), `bleibt` (=: gibt es schon, jichi lässt sie). */
  art: "neu" | "ueberschrieben" | "bleibt";
  pfad: string;
}

export interface InitErgebnis {
  ok: boolean;
  dateien: InitDatei[];
  /** jichis eigene Worte, wenn etwas nicht ging (erste Zeile von stderr). */
  meldung: string | null;
}

/** `jichi init --list`: die eingebauten Packs, in jichis Reihenfolge. */
export function initPacks(ausgabe: string): InitPack[] {
  const out: InitPack[] = [];
  let drin = false;
  for (const zeile of ausgabe.replace(/\r\n/g, "\n").split("\n")) {
    if (/^Available packs/i.test(zeile)) {
      drin = true;
      continue;
    }
    if (!drin) continue;
    if (!zeile.trim()) break; // danach kommen die Domain-Benches zum Kopieren
    // Ein Leerzeichen genügt: ein Name, der die Spalte füllt (systems-analysis),
    // steht mit nur einem vor seiner Beschreibung. Namen haben keine Leerzeichen.
    const m = /^\s+([a-z0-9][a-z0-9-]*)\s+(.+?)\s*$/.exec(zeile);
    if (m) out.push({ name: m[1], text: m[2] });
  }
  return out;
}

const ART = { "+": "neu", "~": "ueberschrieben", "=": "bleibt" } as const;

/** Die Ausgabe von `jichi init …` (mit oder ohne `--dry-run`). */
export function initErgebnis(stdout: string, stderr: string, exit: number | null): InitErgebnis {
  const dateien: InitDatei[] = [];
  for (const zeile of stdout.replace(/\r\n/g, "\n").split("\n")) {
    const m = /^\s+([+~=])\s+(\S.*?)\s*$/.exec(zeile);
    if (m) dateien.push({ art: ART[m[1] as keyof typeof ART], pfad: m[2] });
  }
  const ok = exit === 0;
  const erste = stderr.split("\n").map((z) => z.trim()).find(Boolean) ?? null;
  return { ok, dateien, meldung: ok ? null : erste ?? (exit === null ? "jichi wurde abgebrochen." : `jichi init endete mit ${exit}.`) };
}
