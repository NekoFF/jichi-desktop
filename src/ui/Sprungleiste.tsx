/**
 * Die Sprungleiste: der Chat als Karte, links oben am Verlauf.
 *
 * Jede eigene Frage ist eine Zeile aus Pixeln — ein Quadrat und ein Balken,
 * wie im Zeichen von jichi. Die Länge des Balkens zeigt, wie umfangreich die
 * Antwort war; die Frage, in deren Antwort man gerade liest, trägt das blaue
 * Quadrat, den Cursor. Fährt man darüber, klappt die Leiste zu einem
 * Inhaltsverzeichnis auf: die Fragen im Wortlaut, wie viele Werkzeuge liefen,
 * wann. Ein Klick springt hin; ⌥↑/⌥↓ (Alt) springt zur vorigen/nächsten Frage.
 */

import { memo, useEffect, useRef, useState } from "react";
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

/** Länge des Balkens: logarithmisch, damit eine lange Antwort die kurzen nicht erdrückt. */
function balken(umfang: number, werkzeuge: number): number {
  const u = Math.log10(1 + umfang + werkzeuge * 400);
  return Math.round(Math.min(22, Math.max(6, 4 + u * 4.2)));
}

function kurz(text: string): string {
  const eins = text.replace(/\s+/g, " ").trim();
  return eins.length > 70 ? `${eins.slice(0, 68)}…` : eins;
}

export const Sprungleiste = memo(function Sprungleiste({
  zuege,
  aktiv,
  springen,
}: {
  zuege: SprungZug[];
  aktiv: string | null;
  springen: (id: string) => void;
}) {
  const [offen, setOffen] = useState(false);
  const zu = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liste = useRef<HTMLDivElement>(null);

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

  // Beim Aufklappen die aktive Zeile ins Bild holen.
  useEffect(() => {
    if (offen) liste.current?.querySelector(".sprung-zeile.aktiv")?.scrollIntoView({ block: "nearest" });
  }, [offen]);

  if (zuege.length < 2) return null;

  const auf = () => {
    if (zu.current) clearTimeout(zu.current);
    setOffen(true);
  };
  const spaeterZu = () => {
    zu.current = setTimeout(() => setOffen(false), 180);
  };

  // Bei sehr vielen Zügen: gleichmäßig ausdünnen, der aktive bleibt immer sichtbar.
  const MAX = 28;
  const schritt = Math.ceil(zuege.length / MAX);
  const sichtbar = zuege.filter((z, i) => i % schritt === 0 || z.id === aktiv || i === zuege.length - 1);

  return (
    <nav className={`sprungleiste${offen ? " offen" : ""}`} aria-label="Fragen in diesem Chat" onMouseEnter={auf} onMouseLeave={spaeterZu}>
      <button type="button" className="sprung-pixel" aria-label={`${zuege.length} Fragen — Übersicht öffnen`} aria-expanded={offen}
        onClick={() => setOffen((o) => !o)} onFocus={auf}>
        {sichtbar.map((z) => (
          <span key={z.id} className={`sprung-reihe${z.id === aktiv ? " aktiv" : ""}`}>
            <i className="sprung-quadrat" />
            <i className="sprung-balken" style={{ width: balken(z.umfang, z.werkzeuge) }} />
          </span>
        ))}
      </button>
      {offen && (
        <div className="sprung-karte" ref={liste} role="list" onMouseEnter={auf} onMouseLeave={spaeterZu}>
          <div className="sprung-kopf">
            <span>{zuege.length} Fragen</span>
            <span className="sprung-taste">⌥↑ ⌥↓</span>
          </div>
          {zuege.map((z, i) => (
            <button key={z.id} type="button" role="listitem" className={`sprung-zeile${z.id === aktiv ? " aktiv" : ""}`}
              onClick={() => { springen(z.id); setOffen(false); }} title={z.text}>
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
