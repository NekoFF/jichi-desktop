/** Alle Tastenkürzel auf einen Blick — ⌘/ bzw. Strg+/. */

import { useEffect } from "react";
import { X } from "lucide-react";

import { IS_MAC } from "./util.ts";

const M = IS_MAC ? "⌘" : "Strg";
const A = IS_MAC ? "⌥" : "Alt";

const GRUPPEN: Array<{ titel: string; tasten: Array<[string, string]> }> = [
  {
    titel: "Chat",
    tasten: [
      [`${M} N`, "Neuer Chat"],
      ["Enter", "Senden"],
      ["Umschalt Enter", "Neue Zeile"],
      [`${A} ↑ / ${A} ↓`, "Zur vorigen / nächsten Frage springen"],
      ["Esc", "Menü oder Dialog schließen"],
    ],
  },
  {
    titel: "Seitenleiste",
    tasten: [
      [`${M} ⇧ E`, "Dateien"],
      [`${M} ⇧ D`, "Änderungen"],
      ["Strg `", "Terminal"],
      [`${M} ⇧ B`, "Browser"],
      [`${M} \\`, "Vorderes Fenster schließen"],
    ],
  },
  {
    titel: "Datei bearbeiten",
    tasten: [
      [`${M} S`, "Speichern"],
      ["Tab", "Einrücken"],
    ],
  },
  {
    titel: "Hilfe",
    tasten: [[`${M} /`, "Diese Übersicht"]],
  },
];

export function Tastenkuerzel({ schliessen }: { schliessen: () => void }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === "Escape" && schliessen();
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [schliessen]);
  return (
    <div className="ueber" onMouseDown={(e) => e.target === e.currentTarget && schliessen()}>
      <div className="tafel tasten-tafel" role="dialog" aria-modal="true" aria-labelledby="tasten-titel">
        <div className="tasten-kopf">
          <h2 id="tasten-titel">Tastenkürzel</h2>
          <button type="button" className="knopf-klein knopf-symbol" aria-label="Schließen" onClick={schliessen}><X size={14} /></button>
        </div>
        <div className="tasten-gruppen">
          {GRUPPEN.map((g) => (
            <section key={g.titel}>
              <h3>{g.titel}</h3>
              <dl>
                {g.tasten.map(([k, t]) => (
                  <div key={k}>
                    <dt>{k.split(" ").map((x, i) => (x === "/" ? <span key={i} className="tasten-oder">/</span> : <kbd key={i}>{x}</kbd>))}</dt>
                    <dd>{t}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
