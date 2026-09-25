/**
 * Was ein Werkzeug tun wird — für die Berechtigungsfrage und die Werkzeugkarte.
 *
 * Ein Befehl steht Zeichen für Zeichen da, mit sichtbar gemachten Steuer- und
 * Richtungszeichen. Eine Dateiänderung steht als Diff gegen den heutigen
 * Inhalt. Sind die Argumente nicht lesbar, wird das laut gesagt: genau so sah
 * bisher ein Aufruf aus, der an den Prüfungen des Agenten vorbeikam.
 */

import { memo, useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

import { agent, applyPlan, planOf, visible, type PlannedFile } from "../core/index.ts";
import { Diff } from "./Diff.tsx";

function Befehl({ command, background }: { command: string; background: boolean }) {
  const { text, suspicious } = visible(command);
  return (
    <div className="vorschau-befehl">
      {suspicious && (
        <p className="vorschau-warnung">
          <AlertTriangle size={13} /> Der Befehl enthält unsichtbare Zeichen. Sie sind unten markiert
          (␍, ␛, ⟨U+…⟩) — lies ihn genau.
        </p>
      )}
      <pre>
        <span className="prompt">$ </span>
        {text}
      </pre>
      {background && <p className="vorschau-notiz">läuft im Hintergrund weiter</p>}
    </div>
  );
}

/**
 * Der Inhalt *vor* der Änderung, je Aufruf und Datei. Nach der Ausführung
 * steht auf der Platte schon der neue Text; ein erneutes Lesen zeigte dann
 * „keine Änderung“. Also wird der erste gelesene Stand behalten.
 */
const vorherCache = new Map<string, { text: string | null; fehler: string | null }>();

function Datei({ file, cacheKey, live }: { file: PlannedFile; cacheKey: string; live: boolean }) {
  const key = `${cacheKey}\u0000${file.path}`;
  const bekannt = vorherCache.get(key);
  const [vorher, setVorher] = useState<string | null | undefined>(bekannt?.text);
  const [fehler, setFehler] = useState<string | null>(bekannt?.fehler ?? null);

  useEffect(() => {
    if (vorherCache.has(key) || !live) return;
    let aktuell = true;
    agent
      .readProjectFile(file.path)
      .then((t) => {
        vorherCache.set(key, { text: t, fehler: null });
        if (aktuell) setVorher(t);
      })
      .catch((e: unknown) => {
        const text = e instanceof Error ? e.message : String(e);
        vorherCache.set(key, { text: null, fehler: text });
        if (!aktuell) return;
        setVorher(null);
        setFehler(text);
      });
    return () => {
      aktuell = false;
    };
  }, [key, file.path, live]);

  if (vorher === undefined) {
    return live ? (
      <div className="vorschau-laedt">{file.path} wird gelesen …</div>
    ) : (
      <div className="vorschau-laedt">{file.path}</div>
    );
  }
  const { text, missing } = applyPlan(vorher, file);
  const notiz = fehler
    ? fehler
    : missing
      ? `${missing} ${missing === 1 ? "Ersetzung passt" : "Ersetzungen passen"} nicht zum heutigen Inhalt — das Werkzeug wird dort scheitern.`
      : undefined;
  return <Diff path={file.path} before={fehler ? "" : vorher} after={text} note={notiz} />;
}

/**
 * `live`: das Werkzeug ist noch nicht gelaufen, die Platte zeigt den alten
 * Stand. Nur dann wird gelesen — sonst gilt, was vorher gelesen wurde.
 */
export const Vorschau = memo(function Vorschau({
  rawInput,
  cacheKey,
  live,
}: {
  rawInput: unknown;
  cacheKey: string;
  live: boolean;
}) {
  const plan = planOf(rawInput);
  switch (plan.kind) {
    case "command":
      return <Befehl command={plan.command} background={plan.background} />;
    case "files":
      return (
        <div className="vorschau-dateien">
          {plan.files.map((f) => (
            <Datei key={f.path} file={f} cacheKey={cacheKey} live={live} />
          ))}
        </div>
      );
    case "unreadable":
      return (
        <div className="vorschau-unlesbar">
          <p className="vorschau-warnung">
            <AlertTriangle size={13} /> Die Argumente sind kein gültiges JSON. jichi repariert sie vor der
            Ausführung — was dann läuft, lässt sich hier nicht sicher zeigen. Im Zweifel ablehnen.
          </p>
          {plan.raw && <pre>{visible(plan.raw).text}</pre>}
        </div>
      );
    default:
      return (
        <dl className="vorschau-argumente">
          {Object.entries(plan.args).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{visible(typeof v === "string" ? v : JSON.stringify(v, null, 2)).text}</dd>
            </div>
          ))}
        </dl>
      );
  }
});
