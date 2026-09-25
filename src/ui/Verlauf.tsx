/** Das Gespräch: Nachrichten, Werkzeugkarten, Rückfragen und der leere Anfang. */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  GitCompare,
  RotateCcw,
  SquareTerminal,
  ChevronRight,
  FileText,
  FolderOpen,
  Terminal,
  Wrench,
} from "lucide-react";
import {
  agent,
  permissionTone,
  producedFiles,
  relativeTime,
  shortPath,
  toolKindLabel,
  toolStatusLabel,
  type Snapshot,
  type TerminalView,
  type ToolItem,
  type TranscriptItem,
} from "../core/index.ts";
import { Dateikarte } from "./Dateikarte.tsx";
import { Markdown } from "./Markdown.tsx";
import { Marke } from "./Marke.tsx";
import { Vorschau } from "./Vorschau.tsx";
import { panel } from "./panel/store.ts";

// ── Verlauf ──────────────────────────────────────────────────────────────────

/** Die Ausgabe eines laufenden Befehls. Folgt dem Ende, solange man unten steht. */
function Terminalausgabe({ view }: { view: TerminalView }) {
  const box = useRef<HTMLPreElement>(null);
  const unten = useRef(true);
  useLayoutEffect(() => {
    const el = box.current;
    if (el && unten.current) el.scrollTop = el.scrollHeight;
  }, [view.output]);
  return (
    <div className="terminal">
      <pre
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget;
          unten.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
      >
        {view.truncated && <span className="terminal-gekuerzt">… ältere Ausgabe gekürzt{"\n"}</span>}
        {view.output || (view.exit ? "" : "…")}
      </pre>
      {view.exit && (
        <div className={`terminal-ende${view.exit.exitCode === 0 ? " ok" : " fehler"}`}>
          {view.exit.exitCode === 0
            ? "beendet"
            : view.exit.signal !== null
              ? `abgebrochen (Signal ${view.exit.signal})`
              : `beendet mit Code ${view.exit.exitCode ?? "?"}`}
        </div>
      )}
    </div>
  );
}

function Werkzeug({ eintrag, snap }: { eintrag: ToolItem; snap: Snapshot }) {
  const laeuft = eintrag.status === "in_progress" || eintrag.status === "pending";
  const terminal = eintrag.terminalId ? snap.terminals[eintrag.terminalId] : undefined;
  // Ein laufender Befehl klappt von selbst auf: dafür ist die Live-Ausgabe da.
  const [offen, setOffen] = useState<boolean | null>(null);
  const aufgeklappt = offen ?? (!!terminal && laeuft);
  const text = [eintrag.output, eintrag.truncated ? "… gekürzt" : ""].filter(Boolean).join("\n");
  const hatArgumente = eintrag.rawInput !== undefined && eintrag.rawInput !== null;
  const hatInhalt = !!text || !!terminal || hatArgumente;

  const lage = eintrag.status === "completed" ? "fertig" : eintrag.status === "failed" ? "fehlgeschlagen" : "";

  return (
    <div className={`werkzeug ${lage}${laeuft ? " laeuft" : ""}`}>
      <button
        className="werkzeug-kopf"
        onClick={() => setOffen(!aufgeklappt)}
        disabled={!hatInhalt}
        aria-expanded={aufgeklappt}
      >
        {eintrag.toolKind === "execute" ? <Terminal size={13} /> : <Wrench size={13} />}
        <span className="werkzeug-name">{eintrag.title}</span>
        <span className="werkzeug-lage">
          {toolKindLabel(eintrag.toolKind)} · {toolStatusLabel(eintrag.status)}
        </span>
        {hatInhalt ? aufgeklappt ? <ChevronDown size={13} /> : <ChevronRight size={13} /> : null}
      </button>
      {aufgeklappt && (
        <div className="werkzeug-inhalt">
          <div className="werkzeug-spruenge">
            {terminal && eintrag.terminalId && (
              <button type="button" className="knopf-klein" onClick={() => panel.terminal(eintrag.terminalId)}>
                <SquareTerminal size={12} /> Im Terminal ansehen
              </button>
            )}
            {(eintrag.toolKind === "edit" || eintrag.toolKind === "delete" || eintrag.toolKind === "move") && eintrag.status === "completed" && (
              <button type="button" className="knopf-klein" onClick={() => panel.aenderungen()}>
                <GitCompare size={12} /> Änderungen ansehen
              </button>
            )}
          </div>
          {hatArgumente && (
            <Vorschau rawInput={eintrag.rawInput} cacheKey={eintrag.toolCallId} live={laeuft} />
          )}
          {terminal ? <Terminalausgabe view={terminal} /> : text && <pre className="werkzeug-ausgabe">{text}</pre>}
        </div>
      )}
    </div>
  );
}

/** Unter einer fertigen Antwort: kopieren, noch einmal fragen, wann. */
function Aktionen({ text, frage, at, snap }: { text: string; frage: string | null; at?: number; snap: Snapshot }) {
  const [kopiert, setKopiert] = useState(false);
  const [, tick] = useState(0);
  // „vor 3 Min.“ soll nicht stehen bleiben.
  useEffect(() => {
    if (!at) return;
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [at]);

  async function kopieren() {
    try {
      await navigator.clipboard.writeText(text);
      setKopiert(true);
      setTimeout(() => setKopiert(false), 1400);
    } catch {
      /* ohne Zwischenablage bleibt es still */
    }
  }

  return (
    <div className="aktionen">
      <button type="button" onClick={() => void kopieren()} aria-label="Antwort kopieren" title="Kopieren">
        {kopiert ? <Check size={14} /> : <Copy size={14} />}
      </button>
      {frage && (
        <button
          type="button"
          disabled={!snap.canSend}
          onClick={() => void agent.send(frage).catch(() => {})}
          aria-label="Noch einmal fragen"
          title="Noch einmal fragen"
        >
          <RotateCcw size={14} />
        </button>
      )}
      {at && (
        <time dateTime={new Date(at).toISOString()} title={new Date(at).toLocaleString("de-DE")}>
          {relativeTime(at / 1000)}
        </time>
      )}
    </div>
  );
}

/** Solange jichi arbeitet: das Zeichen in Bewegung, und wie lange schon. */
function Arbeitet({ snap }: { snap: Snapshot }) {
  const start = useRef(Date.now());
  const [jetzt, setJetzt] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setJetzt(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.round((jetzt - start.current) / 1000));
  const was = snap.status === "starting" ? "startet" : snap.status === "cancelling" ? "bricht ab" : "arbeitet";
  return (
    <div className="arbeitet" role="status" aria-live="polite">
      <Marke size={16} animiert />
      <span>jichi {was} …</span>
      {s >= 3 && <span className="arbeitet-zeit">{s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`}</span>}
    </div>
  );
}

function Eintrag({ eintrag, snap }: { eintrag: TranscriptItem; snap: Snapshot }) {
  if (eintrag.kind === "tool") return <Werkzeug eintrag={eintrag} snap={snap} />;

  if (eintrag.kind === "notice") {
    return (
      <div className={`hinweis${eintrag.level === "error" ? " fehler" : ""}`}>{eintrag.text}</div>
    );
  }

  if (eintrag.role === "user") {
    return (
      <div className="nachricht vom-nutzer">
        <div>
          {eintrag.images?.length ? (
            <div className="nachricht-bilder">
              {eintrag.images.map((src, i) => (
                <img key={i} src={src} alt={`Bild ${i + 1}`} />
              ))}
            </div>
          ) : null}
          {eintrag.files?.length ? (
            <div className="nachricht-dateien">
              {eintrag.files.map((f) => (
                <span key={f}>
                  <FileText size={12} /> {f}
                </span>
              ))}
            </div>
          ) : null}
          {eintrag.text}
        </div>
      </div>
    );
  }

  if (eintrag.role === "thought") {
    return <div className={`nachricht gedanke${eintrag.streaming ? " schreibt" : ""}`}>{eintrag.text}</div>;
  }

  return (
    <div className={`nachricht vom-agenten${eintrag.streaming ? " schreibt" : ""}`}>
      <Markdown text={eintrag.text} />
    </div>
  );
}

function Rueckfrage({ snap }: { snap: Snapshot }) {
  const frage = snap.permission;
  const kasten = useRef<HTMLDivElement>(null);
  // Der Agent wartet — die Frage muss sichtbar sein, auch wenn der Benutzer
  // gerade weiter oben liest.
  useEffect(() => {
    if (frage) kasten.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [frage]);
  if (!frage) return null;
  // Die vollen Argumente kamen mit dem `tool_call` davor.
  const aufruf = snap.transcript.find(
    (i): i is ToolItem => i.kind === "tool" && i.toolCallId === frage.toolCallId,
  );
  return (
    <div className="rueckfrage" ref={kasten} role="alertdialog" aria-label="jichi bittet um Erlaubnis">
      <div className="rueckfrage-titel">jichi bittet um Erlaubnis</div>
      <code>{frage.title}</code>
      <div className="rueckfrage-vorschau">
        <Vorschau rawInput={aufruf?.rawInput} cacheKey={frage.toolCallId} live />
      </div>
      <div className="rueckfrage-aktionen">
        {frage.options.map((o) => (
          <button
            key={o.optionId}
            className={`knopf${permissionTone(o) === "accent" ? " haupt" : ""}${
              permissionTone(o) === "danger" ? " gefahr" : ""
            }`}
            onClick={() => agent.answerPermission(o.optionId)}
          >
            {o.name}
          </button>
        ))}
        <button className="knopf" onClick={() => agent.answerPermission(null)}>
          Abbrechen
        </button>
      </div>
    </div>
  );
}

export function Verlauf({ snap }: { snap: Snapshot }) {
  const box = useRef<HTMLDivElement>(null);
  const amEnde = useRef(true);

  // Vor dem Zeichnen merken, ob der Benutzer unten stand — danach ist die Höhe
  // schon gewachsen und die Frage nicht mehr beantwortbar.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    if (amEnde.current) el.scrollTop = el.scrollHeight;
  });

  function beobachten() {
    const el = box.current;
    if (el) amEnde.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  const t = snap.transcript;
  const laeuft = snap.status === "busy" || snap.status === "starting" || snap.status === "cancelling";
  // Je Datei nur eine Karte: unter dem letzten Werkzeug, das sie geschrieben hat.
  const dateien = useMemo(() => {
    const letzte = new Map<string, string>();
    for (const e of t) {
      if (e.kind === "tool") for (const f of producedFiles(e.rawInput, e.status)) letzte.set(f, e.id);
    }
    return letzte;
  }, [t]);
  return (
    <div className="verlauf" ref={box} onScroll={beobachten}>
      <div className="spalte">
        {t.map((e, i) => {
          // Aktionen nur unter der letzten Antwort eines Zuges, wenn sie fertig ist.
          const bis = naechsteFrage(t, i);
          const spaeter = t.slice(i + 1, bis).some((n) => n.kind === "message" && n.role === "agent");
          const imLaufendenZug = laeuft && bis === t.length;
          const ende =
            e.kind === "message" && e.role === "agent" && !e.streaming && !spaeter && !imLaufendenZug;
          const frage = ende ? letzteFrage(t, i) : null;
          return (
            <div key={e.id}>
              <Eintrag eintrag={e} snap={snap} />
              {e.kind === "tool" &&
                producedFiles(e.rawInput, e.status)
                  .filter((f) => dateien.get(f) === e.id)
                  .map((f) => <Dateikarte key={f} path={f} version={`${e.id}:${e.status}`} />)}
              {ende && e.kind === "message" && (
                <Aktionen text={e.text} frage={frage} at={e.at} snap={snap} />
              )}
            </div>
          );
        })}
        <Rueckfrage snap={snap} />
        {laeuft && !snap.permission && <Arbeitet key={snap.sessionId ?? "x"} snap={snap} />}
      </div>
    </div>
  );
}

/** Index der nächsten eigenen Nachricht nach `i`, sonst das Ende. */
function naechsteFrage(t: readonly TranscriptItem[], i: number): number {
  const j = t.findIndex((n, k) => k > i && n.kind === "message" && n.role === "user");
  return j < 0 ? t.length : j;
}

/** Der Text der eigenen Nachricht, auf die die Antwort bei `i` folgt — ohne Anhänge. */
function letzteFrage(t: readonly TranscriptItem[], i: number): string | null {
  for (let k = i - 1; k >= 0; k -= 1) {
    const n = t[k];
    if (n.kind === "message" && n.role === "user") {
      return n.text && !n.images?.length && !n.files?.length ? n.text : null;
    }
  }
  return null;
}

export function Leer({
  snap,
  name,
  frage,
}: {
  snap: Snapshot;
  name: string;
  frage: (text: string) => void;
}) {
  // Ohne Projekt würde „Tests ausführen“ im Heimatverzeichnis laufen.
  const projektfrage = snap.hasProject && snap.canSend;
  return (
    <div className="leer">
      <div className="leer-mitte">
        <Marke size={40} className="leer-marke" />
        <h2 className="leer-titel">{name ? `Hallo, ${name}.` : "Womit fangen wir an?"}</h2>
        <p className="leer-text">
          {snap.hasProject && snap.cwd ? shortPath(snap.cwd, 60) : "Noch kein Projekt geöffnet."}
        </p>

        {!snap.hasProject && (
          <button className="vorschlag" disabled={!snap.canSwitch} onClick={() => void agent.pickWorkspace().catch(() => {})}>
            <FolderOpen size={15} />
            Projekt öffnen
            <small>Ordner wählen</small>
          </button>
        )}
        <button className="vorschlag" disabled={!projektfrage} onClick={() => frage("Erklär mir dieses Projekt.")}>
          <FileText size={15} />
          Projekt erklären
        </button>
        <button className="vorschlag" disabled={!projektfrage} onClick={() => frage("Führe die Tests aus.")}>
          <Terminal size={15} />
          Tests ausführen
        </button>
      </div>
    </div>
  );
}
