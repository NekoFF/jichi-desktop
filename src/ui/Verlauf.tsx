/** Das Gespräch: Nachrichten, Werkzeugkarten, Rückfragen und der leere Anfang. */

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  Pencil,
} from "lucide-react";
import { Vorlesen } from "./Sprache.tsx";
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
import { panel, zurEingabe } from "./panel/store.ts";
import { Sprungleiste, type SprungZug } from "./Sprungleiste.tsx";

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

const Werkzeug = memo(function Werkzeug({ eintrag, terminal }: { eintrag: ToolItem; terminal?: TerminalView }) {
  const laeuft = eintrag.status === "in_progress" || eintrag.status === "pending";

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
});

/** Unter einer fertigen Antwort: kopieren, vorlesen, noch einmal fragen, wann. */
function Aktionen({ id, text, frage, at, canSend, sprechen }: {
  id: string;
  text: string;
  frage: string | null;
  at?: number;
  canSend: boolean;
  /** Vorlesen anbieten — nur mit Schlüssel, denn es geht übers Gateway. */
  sprechen: boolean;
}) {
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
      {sprechen && <Vorlesen id={id} text={text} />}
      {frage && (
        <button
          type="button"
          disabled={!canSend}
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

/**
 * Ein Eintrag ändert sich nur, wenn sein Objekt sich ändert — der Verlauf ist
 * unveränderlich aufgebaut. Darum zeichnet ein neues Token nur die letzte
 * Nachricht neu, nicht alle davor.
 */
const Eintrag = memo(function Eintrag({ eintrag, terminal }: { eintrag: TranscriptItem; terminal?: TerminalView }) {
  if (eintrag.kind === "tool") return <Werkzeug eintrag={eintrag} terminal={terminal} />;

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
        {eintrag.text && (
          <button type="button" className="nachricht-bearbeiten" title="Bearbeiten und erneut senden" aria-label="Nachricht bearbeiten"
            onClick={() => zurEingabe.send({ ersetzen: eintrag.text })}>
            <Pencil size={12} />
          </button>
        )}
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
});

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
  // Der Name des Werkzeugs ist das erste Wort des Titels („write_file notes.txt“).
  const werkzeug = /^[\w.-]+/.exec(frage.title)?.[0] ?? null;
  const erlaubenEinmal = frage.options.find((o) => o.kind === "allow_once") ?? frage.options.find((o) => o.kind === "allow_always");
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
        {werkzeug && erlaubenEinmal && (
          <button
            className="knopf"
            title={`Auch nach einem Neustart: trägt ${werkzeug} in jichis Erlaubnisse ein (permissions.allow). Rückgängig in den Einstellungen.`}
            onClick={() => void agent.alwaysAllow(werkzeug).then(
              () => agent.answerPermission(erlaubenEinmal.optionId),
              () => agent.answerPermission(erlaubenEinmal.optionId),
            )}
          >
            Immer erlauben
          </button>
        )}
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

  const [aktiveFrage, setAktiveFrage] = useState<string | null>(null);
  function beobachten() {
    const el = box.current;
    if (!el) return;
    amEnde.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    // Die Frage, in deren Zug man gerade liest: die letzte, die oberhalb eines
    // Drittels der Höhe beginnt.
    const grenze = el.getBoundingClientRect().top + el.clientHeight / 3;
    let aktiv: string | null = null;
    for (const n of el.querySelectorAll<HTMLElement>("[data-frage]")) {
      if (n.getBoundingClientRect().top <= grenze) aktiv = n.dataset.frage ?? null;
      else break;
    }
    setAktiveFrage(aktiv);
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

  // Ein Durchgang von hinten statt einer Suche je Eintrag: wo endet ein Zug,
  // und welche Frage gehört dazu.
  const { endeVon, frageVon, zuege } = useMemo(() => {
    const endeVon = new Set<string>();
    const frageVon = new Map<string, string | null>();
    let schonAntwort = false;
    for (let i = t.length - 1; i >= 0; i -= 1) {
      const e = t[i];
      if (e.kind === "message" && e.role === "user") {
        schonAntwort = false;
      } else if (e.kind === "message" && e.role === "agent" && !schonAntwort) {
        schonAntwort = true;
        const letzterZug = !t.slice(i + 1).some((n) => n.kind === "message" && n.role === "user");
        if (!e.streaming && !(laeuft && letzterZug)) endeVon.add(e.id);
      }
    }
    let frage: string | null = null;
    const zuege: SprungZug[] = [];
    for (const e of t) {
      if (e.kind === "message" && e.role === "user") {
        frage = e.text && !e.images?.length && !e.files?.length ? e.text : null;
        zuege.push({ id: e.id, text: e.text || (e.files?.join(", ") ?? "Bild"), at: e.at, umfang: 0, werkzeuge: 0 });
      } else if (zuege.length) {
        const z = zuege[zuege.length - 1];
        if (e.kind === "message") z.umfang += e.text.length;
        if (e.kind === "tool") z.werkzeuge += 1;
      }
      if (endeVon.has(e.id)) frageVon.set(e.id, frage);
    }
    return { endeVon, frageVon, zuege };
  }, [t, laeuft]);

  const springen = useCallback((id: string) => {
    const el = box.current?.querySelector<HTMLElement>(`[data-frage="${id}"]`);
    if (!el) return;
    amEnde.current = false;
    // Zweimal: Einträge ausserhalb des Bildes haben nur eine geschätzte Höhe
    // (content-visibility). Nach dem ersten Sprung sind die Nachbarn gezeichnet,
    // der zweite trifft genau.
    el.scrollIntoView({ block: "start" });
    requestAnimationFrame(() => requestAnimationFrame(() => el.scrollIntoView({ block: "start" })));
    el.classList.remove("aufblitzen");
    void el.offsetWidth;
    el.classList.add("aufblitzen");
  }, []);

  return (
    <div className="verlauf-rahmen">
      <Sprungleiste zuege={zuege} aktiv={aktiveFrage ?? zuege[zuege.length - 1]?.id ?? null} springen={springen} />
      <div className="verlauf" ref={box} onScroll={beobachten}>
        <div className="spalte">
          {t.map((e) => {
            const ende = endeVon.has(e.id);
            const istFrage = e.kind === "message" && e.role === "user";
            return (
              <div key={e.id} className="verlauf-eintrag" data-frage={istFrage ? e.id : undefined}>
                <Eintrag eintrag={e} terminal={e.kind === "tool" && e.terminalId ? snap.terminals[e.terminalId] : undefined} />
                {e.kind === "tool" &&
                  producedFiles(e.rawInput, e.status)
                    .filter((f) => dateien.get(f) === e.id)
                    .map((f) => <Dateikarte key={f} path={f} version={`${e.id}:${e.status}`} />)}
                {ende && e.kind === "message" && (
                  <Aktionen id={e.id} text={e.text} frage={frageVon.get(e.id) ?? null} at={e.at} canSend={snap.canSend} sprechen={!!snap.readiness?.keyStored} />
                )}
              </div>
            );
          })}
          <Rueckfrage snap={snap} />
          {laeuft && !snap.permission && <Arbeitet key={snap.sessionId ?? "x"} snap={snap} />}
        </div>
      </div>
    </div>
  );
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
