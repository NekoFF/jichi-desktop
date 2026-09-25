/**
 * Die Sprungleiste: der Chat als Karte, links oben am Verlauf, neben der Seitenleiste.
 *
 * Jede eigene Frage ist eine Zeile aus Pixeln — ein Quadrat und ein Balken,
 * wie im Zeichen von jichi. Die Länge des Balkens zeigt, wie umfangreich die
 * Antwort war; die Frage, in deren Antwort man gerade liest, trägt das blaue
 * Quadrat, den Cursor.
 *
 * Kein Klick nötig: fährt die Maus darüber, wächst die Zeile unter ihr, die
 * Nachbarn etwas weniger — eine Welle wie im Dock, die der Maus folgt. Neben
 * der nächsten Zeile steht ihre Frage. Ein Klick springt hin; ⌥↑/⌥↓ (Alt)
 * springt zur vorigen/nächsten Frage. Mit der Tastatur (Tab, dann Enter)
 * öffnet sich die ganze Liste.
 */

import { memo, useEffect, useRef, useState, type CSSProperties } from "react";
import { Wrench } from "lucide-react";

import { relativeTime } from "../core/index.ts";

export interface SprungZug {
  id: string;
  text: string;
  at?: number;
  /** Zeichen der Antworten dieses Zuges. */
  umfang: number;
  werkzeuge: number;
}

/**
 * Länge des Balkens in Ruhe: wie viel in diesem Zug geschah — Text der
 * Antworten plus Werkzeuge (je 400 Zeichen wert). Logarithmisch, damit eine
 * sehr lange Antwort die kurzen nicht erdrückt: „👍“ ≈ 4 px, ein Absatz
 * ≈ 14 px, ein langer Bericht bis 26 px.
 */
export function balken(umfang: number, werkzeuge: number): number {
  const u = Math.log10(1 + umfang + werkzeuge * 400);
  return Math.round(Math.min(26, Math.max(4, 2 + u * 5)));
}

function kurz(text: string, n = 70): string {
  const eins = text.replace(/\s+/g, " ").trim();
  return eins.length > n ? `${eins.slice(0, n - 2)}…` : eins;
}

/** Wie stark eine Zeile wächst, je nach Abstand zur Maus (Pixel): eine Glocke. */
const RADIUS = 15;
const welle = (abstand: number) => Math.exp(-((abstand / RADIUS) ** 2));

export const Sprungleiste = memo(function Sprungleiste({
  zuege,
  aktiv,
  springen,
}: {
  zuege: SprungZug[];
  aktiv: string | null;
  springen: (id: string) => void;
}) {
  // Während gescrollt wird (die aktive Frage wechselt), kurz deutlich zeigen.
  const [scrollt, setScrollt] = useState(false);
  const ruhe = useRef<ReturnType<typeof setTimeout> | null>(null);
  const erst = useRef(true);
  useEffect(() => {
    if (erst.current) {
      erst.current = false;
      return;
    }
    setScrollt(true);
    if (ruhe.current) clearTimeout(ruhe.current);
    ruhe.current = setTimeout(() => setScrollt(false), 1100);
  }, [aktiv]);
  const [maus, setMaus] = useState<number | null>(null);
  const [liste, setListe] = useState(false);
  const leiste = useRef<HTMLDivElement>(null);
  const mitten = useRef<number[]>([]);
  const bild = useRef<number | null>(null);

  // ⌥↑ / ⌥↓: von Frage zu Frage.
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      const i = zuege.findIndex((z) => z.id === aktiv);
      const j = e.key === "ArrowUp" ? Math.max(0, (i < 0 ? zuege.length : i) - 1) : Math.min(zuege.length - 1, i + 1);
      if (zuege[j]) {
        e.preventDefault();
        springen(zuege[j].id);
      }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [zuege, aktiv, springen]);

  if (zuege.length < 2) return null;

  // Bei sehr vielen Zügen: gleichmäßig ausdünnen, der aktive bleibt immer sichtbar.
  const MAX = 28;
  const schritt = Math.ceil(zuege.length / MAX);
  const sichtbar = zuege.filter((z, i) => i % schritt === 0 || z.id === aktiv || i === zuege.length - 1);

  /** Die Mitten der Zeilen im Ruhezustand — gemessen, bevor etwas wächst. */
  function messen() {
    const el = leiste.current;
    if (!el) return;
    const oben = el.getBoundingClientRect().top;
    mitten.current = [...el.querySelectorAll<HTMLElement>(".sprung-reihe")].map((r) => {
      const b = r.getBoundingClientRect();
      return b.top - oben + b.height / 2;
    });
  }

  function bewegen(e: React.MouseEvent) {
    const el = leiste.current;
    if (!el) return;
    const y = e.clientY - el.getBoundingClientRect().top;
    if (bild.current) cancelAnimationFrame(bild.current);
    bild.current = requestAnimationFrame(() => setMaus(y));
  }

  // Die Zeile, der die Maus am nächsten ist — ihre Frage steht daneben.
  let naechste = -1;
  if (maus !== null && mitten.current.length) {
    let best = Infinity;
    mitten.current.forEach((m, i) => {
      const d = Math.abs(m - maus);
      if (d < best) {
        best = d;
        naechste = i;
      }
    });
  }
  const ziel = naechste >= 0 ? sichtbar[naechste] : null;

  return (
    <nav className={`sprungleiste${maus !== null ? " schwebt" : ""}${scrollt ? " scrollt" : ""}`} aria-label="Fragen in diesem Chat">
      <div
        ref={leiste}
        className="sprung-pixel"
        role="button"
        tabIndex={0}
        aria-label={`${zuege.length} Fragen — Enter öffnet die Liste`}
        aria-expanded={liste}
        onMouseEnter={(e) => { messen(); bewegen(e); }}
        onMouseMove={bewegen}
        onMouseLeave={() => { if (bild.current) cancelAnimationFrame(bild.current); setMaus(null); }}
        onClick={() => ziel && springen(ziel.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setListe((l) => !l); }
          if (e.key === "Escape") setListe(false);
        }}
      >
        {sichtbar.map((z, i) => {
          const g = maus === null || mitten.current[i] === undefined ? 0 : welle(Math.abs(mitten.current[i] - maus));
          const stil = { "--g": g.toFixed(3), "--b": `${balken(z.umfang, z.werkzeuge)}px` } as CSSProperties;
          return (
            <span key={z.id} className={`sprung-reihe${z.id === aktiv ? " aktiv" : ""}${i === naechste ? " nah" : ""}`} style={stil}>
              <i className="sprung-quadrat" />
              <i className="sprung-balken" />
            </span>
          );
        })}
      </div>

      {ziel && maus !== null && (
        <div className="sprung-etikett" style={{ top: mitten.current[naechste] ?? 0 }} aria-hidden="true">
          <span className="sprung-etikett-nr">{zuege.indexOf(ziel) + 1}</span>
          <span className="sprung-etikett-text">{kurz(ziel.text, 56)}</span>
          {(ziel.werkzeuge > 0 || ziel.at) && (
            <span className="sprung-etikett-meta">
              {ziel.werkzeuge > 0 && <><Wrench size={9} /> {ziel.werkzeuge}</>}
              {ziel.at && <span>{relativeTime(ziel.at / 1000)}</span>}
            </span>
          )}
        </div>
      )}

      {liste && (
        <div className="sprung-karte" role="list">
          <div className="sprung-kopf">
            <span>{zuege.length} Fragen</span>
            <span className="sprung-taste">⌥↑ ⌥↓</span>
          </div>
          {zuege.map((z, i) => (
            <button key={z.id} type="button" role="listitem" className={`sprung-zeile${z.id === aktiv ? " aktiv" : ""}`}
              onClick={() => { springen(z.id); setListe(false); }} title={z.text}>
              <span className="sprung-nr">{i + 1}</span>
              <span className="sprung-text">{kurz(z.text)}</span>
              <span className="sprung-meta">
                {z.werkzeuge > 0 && <span className="sprung-werkzeuge"><Wrench size={10} /> {z.werkzeuge}</span>}
                {z.at && <span>{relativeTime(z.at / 1000)}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </nav>
  );
});
