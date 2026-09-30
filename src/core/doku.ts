/**
 * jichis Dokumentation, soweit es nichts mit Tauri zu tun hat: die Karte aus
 * `docs/README.md` lesen und Verweise zwischen den Seiten auflösen.
 *
 * Die Karte ist jichis eigene Gliederung — „Start here“, „Using jichi day to
 * day“ … —, und die Ansicht folgt ihr, statt eine eigene zu erfinden.
 */

export interface DokuSeite {
  /** Relativ zu `docs/`, mit `/`. Ein Ordner endet auf `/`. */
  datei: string;
  titel: string;
}

export interface DokuAbschnitt {
  titel: string;
  /** Der erste Satz unter der Überschrift — sagt, für wen der Abschnitt ist. */
  text: string;
  seiten: DokuSeite[];
}

export interface DokuTreffer {
  datei: string;
  zeile: number;
  text: string;
}

/** Was die Anwendung über jichis Dokumentation weiss. */
export interface DokuStatus {
  ort: { root: string; quelle: "programm" | "eingestellt"; commit: string | null } | null;
  seiten: number;
  /** Ob jichi sie als Nachschlagewerk (`search_docs`) hat. */
  quelle: { eingetragen: boolean; aktuell: boolean; embedModell: boolean };
  problem: string | null;
}

const EINTRAG = /^\s*[-*]\s+\[`?([^\]`]+?)`?\]\(([^)]+)\)\s*(?:[—–-]\s*(.*))?$/;
const ZEILE = /^\s*\|\s*\[`?([^\]`]+?)`?\]\(([^)]+)\)\s*\|\s*(.*?)\s*\|\s*$/;

/** Die Karte aus `docs/README.md`: Abschnitte mit ihren Seiten, in dieser Reihenfolge. */
export function dokuKarte(readme: string): DokuAbschnitt[] {
  const out: DokuAbschnitt[] = [];
  let akt: DokuAbschnitt | null = null;
  for (const zeile of readme.replace(/\r\n/g, "\n").split("\n")) {
    const h = /^##\s+(.+?)\s*$/.exec(zeile);
    if (h) {
      akt = { titel: h[1], text: "", seiten: [] };
      out.push(akt);
      continue;
    }
    if (!akt) continue;
    const e = EINTRAG.exec(zeile) ?? ZEILE.exec(zeile);
    if (e) {
      const datei = e[2].replace(/^\.\//, "").split("#")[0];
      if (datei && !/^[a-z]+:/i.test(datei) && !datei.startsWith("../")) {
        akt.seiten.push({ datei, titel: (e[3] ?? "").replace(/`/g, "").trim() || e[1] });
      }
      continue;
    }
    if (!akt.text && !akt.seiten.length && zeile.trim() && !zeile.startsWith("|")) {
      akt.text = zeile.trim();
    }
  }
  return out.filter((a) => a.seiten.length > 0);
}

/**
 * Ein Verweis auf einer Seite → die Seite, die er meint (relativ zu `docs/`),
 * mit Anker. `null`: er zeigt hinaus (Web, `../CHANGELOG.md`) oder auf etwas,
 * das keine Seite ist.
 */
export function dokuVerweis(von: string, href: string): { seite: string; anker: string | null } | null {
  if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href)) return null;
  const [pfad, anker = null] = href.split("#") as [string, string?];
  if (!pfad) return { seite: von, anker };
  const teile = pfad.startsWith("/") ? [] : von.split("/").slice(0, -1);
  for (const t of pfad.split("/")) {
    if (t === "" || t === ".") continue;
    if (t === "..") {
      if (!teile.length) return null; // aus docs/ hinaus
      teile.pop();
    } else teile.push(t);
  }
  let seite = teile.join("/");
  if (pfad.endsWith("/")) seite = seite ? `${seite}/README.md` : "README.md";
  if (!/\.md$/i.test(seite)) return null;
  return { seite, anker: anker ? decodeURIComponent(anker) : null };
}

/** Der Titel einer Seite: ihre erste Überschrift, sonst der Dateiname. */
export function dokuTitel(text: string, datei: string): string {
  const h = /^#\s+(.+?)\s*$/m.exec(text);
  return h ? h[1].replace(/`/g, "") : datei.split("/").pop()!.replace(/\.md$/i, "");
}
