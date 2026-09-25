/**
 * jichi Desktop — Oberfläche.
 *
 * Gebaut aus den Farben, Schriften und Radien des JLU Design System, aber mit
 * eigenem Gerüst: dessen Komponenten folgen Material 3 und sind für den Finger
 * gerastert, was auf dem Schreibtisch wie eine Fernsehoberfläche wirkt. Die
 * Maße stehen darum in `styles.css` an einer Stelle.
 *
 * Diese Datei kennt kein ACP, keinen Prozess und keinen Schlüssel. Sie liest
 * einen Schnappschuss und ruft Methoden — der Vertrag steht in
 * `docs/CONTRACT.md`.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createRoot } from "react-dom/client";
import {
  Check,
  ChevronDown,
  Copy,
  RotateCcw,
  ChevronRight,
  FileText,
  FolderOpen,
  KeyRound,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sun,
  Terminal,
  Trash2,
  Wrench,
} from "lucide-react";

import {
  agent,
  applyAppearance,
  formatArgs,
  parseArgs,
  permissionTone,
  producedFiles,
  readPreferences,
  relativeTime,
  shortPath,
  statusLabel,
  toolKindLabel,
  toolStatusLabel,
  watchAppearance,
  writePreferences,
  type Appearance,
  type DoctorReport,
  type LaunchConfig,
  type Preferences,
  type StoredSession,
  type Snapshot,
  type TerminalView,
  type ToolItem,
  type TranscriptItem,
} from "./core/index.ts";
import { Dateikarte } from "./ui/Dateikarte.tsx";
import { Eingabe } from "./ui/Eingabe.tsx";
import { Marke } from "./ui/Marke.tsx";
import { Markdown } from "./ui/Markdown.tsx";
import { Vorschau } from "./ui/Vorschau.tsx";
import "./styles.css";

const useAgent = (): Snapshot =>
  useSyncExternalStore(agent.subscribe, agent.getSnapshot);

const IS_MAC = /Mac/i.test(navigator.userAgent);
/** Die Tastenkombination so, wie sie auf dieser Plattform heisst. */
const kurz = (taste: string) => (IS_MAC ? `⌘${taste}` : `Strg+${taste}`);

const nachricht = (ursache: unknown) =>
  ursache instanceof Error ? ursache.message : String(ursache);

// ── Einrichtung ──────────────────────────────────────────────────────────────

function Einrichtung({
  snap,
  prefs,
  setPrefs,
}: {
  snap: Snapshot;
  prefs: Preferences;
  setPrefs: (p: Preferences) => void;
}) {
  const [name, setName] = useState(prefs.name);
  const [key, setKey] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);

  const r = snap.readiness;
  const agentFehlt = r !== null && !r.agent;
  // Hängt die Einrichtung an einem Fehlbericht, liegt der Schlüssel schon ab:
  // dann wird nur neu geprüft, nicht erneut nach ihm gefragt.
  const pruefenStattEingeben = snap.setupHold && !!r?.keyStored;

  async function verbinden() {
    if (!pruefenStattEingeben && !key.trim()) {
      setMeldung("Bitte den API-Schlüssel eintragen.");
      return;
    }
    setLaeuft(true);
    setMeldung(pruefenStattEingeben ? "Zugang wird geprüft …" : "Schlüssel wird abgelegt und geprüft …");
    setPrefs({ ...prefs, name: name.trim() });
    try {
      if (pruefenStattEingeben) {
        const ergebnis = await agent.checkHealth();
        if (!ergebnis.fail) agent.finishSetup();
      } else {
        await agent.setup(key);
      }
      setMeldung(null);
    } catch (ursache) {
      setMeldung(nachricht(ursache));
    } finally {
      // Der Schlüssel hat im Fenster nichts mehr zu suchen — sobald er abgelegt ist.
      if (agent.getSnapshot().readiness?.keyStored) setKey("");
      setLaeuft(false);
    }
  }

  async function programmWaehlen() {
    setMeldung(null);
    try {
      await agent.pickProgram();
    } catch (ursache) {
      setMeldung(nachricht(ursache));
    }
  }

  return (
    <div className="ueber setup-overlay">
      <div className="setup-content" role="dialog" aria-modal="true" aria-labelledby="setup-title">
        <div className="setup-art" aria-hidden="true">
          <div className="setup-art-glow setup-art-glow-a" />
          <div className="setup-art-glow setup-art-glow-b" />
          <div className="setup-art-curve" />
        </div>
        <section className="setup-card" aria-labelledby="setup-title">
          <h1 id="setup-title">jichi einrichten</h1>
          <p className="setup-intro">Verbinde deinen Zugang, um mit jichi zu starten.</p>

          <label className="feld">
            <span>Wie soll jichi dich nennen?</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void verbinden()}
              placeholder="Dein Name"
              autoComplete="off"
            />
          </label>

          {agentFehlt && (
            <div className="setup-programm" role="group" aria-label="Programm">
              <div>
                <strong>jichi wurde nicht gefunden</strong>
                <p>{r?.agent ?? (agent.config?.program && agent.config.program !== "jichi"
                  ? `${shortPath(agent.config.program, 48)} ist nicht ausführbar.`
                  : "Wähle die gebaute Programmdatei aus.")}</p>
              </div>
              <button type="button" className="knopf" onClick={() => void programmWaehlen()}>
                Auswählen …
              </button>
            </div>
          )}

          {!pruefenStattEingeben && (
            <label className="feld">
              <span>API-Schlüssel</span>
              <input
                type="password"
                autoFocus
                value={key}
                onChange={(e) => setKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void verbinden()}
                placeholder="Schlüssel eingeben"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
          )}

          <button className="knopf haupt" disabled={laeuft || agentFehlt} onClick={() => void verbinden()}>
            {laeuft ? "Wird geprüft …" : pruefenStattEingeben ? "Erneut prüfen" : "Verbinden"}
          </button>

          {meldung && <p className="setup-message" role="status">{meldung}</p>}
          {snap.setupHold && (
            <>
              <p className="setup-message fehler" role="alert">
                Der Agent meldet Fehler. Ist der Schlüssel richtig und der Server erreichbar?
              </p>
              <Bericht bericht={snap.health} />
              <button type="button" className="knopf-text" onClick={() => agent.finishSetup()}>
                Trotzdem fortfahren
              </button>
            </>
          )}

          <p className="setup-sicherheit">
            Dein Schlüssel wird auf diesem Gerät gespeichert und ist nur für dein
            Benutzerkonto lesbar. jichi verwendet ihn für die Verbindung zum Modellserver.
          </p>
        </section>
      </div>
    </div>
  );
}

function Bericht({ bericht }: { bericht: DoctorReport | null }) {
  if (!bericht) return null;
  const auffaellig = bericht.checks.filter((c) => c.status !== "ok").slice(0, 5);
  return (
    <div className="bericht">
      <div className={bericht.fail ? "fehler" : ""}>
        {bericht.ok} Prüfungen bestanden
        {bericht.warn ? `, ${bericht.warn} Hinweise` : ""}
        {bericht.fail ? `, ${bericht.fail} fehlgeschlagen` : ""}
      </div>
      {auffaellig.map((c) => (
        <div key={c.label} className={c.status === "fail" ? "fehler" : "warnung"}>
          {c.label}
        </div>
      ))}
    </div>
  );
}

// ── Seitenleiste ─────────────────────────────────────────────────────────────

function Seitenleiste({
  snap,
  oeffneEinstellungen,
}: {
  snap: Snapshot;
  oeffneEinstellungen: () => void;
}) {
  const [suche, setSuche] = useState("");
  const [zuLoeschen, setZuLoeschen] = useState<StoredSession | null>(null);
  const [loescht, setLoescht] = useState(false);
  const [loeschfehler, setLoeschfehler] = useState<string | null>(null);
  const abbrechen = useRef<HTMLButtonElement>(null);
  const [wechselFehler, setWechselFehler] = useState<string | null>(null);

  async function wechseln(aktion: () => Promise<void>) {
    setWechselFehler(null);
    try {
      await aktion();
    } catch (ursache) {
      setWechselFehler(nachricht(ursache));
    }
  }
  const gefunden = useMemo(() => {
    const begriff = suche.trim().toLowerCase();
    if (!begriff) return snap.sessions;
    return snap.sessions.filter((s) => s.title.toLowerCase().includes(begriff));
  }, [snap.sessions, suche]);

  useEffect(() => {
    if (!zuLoeschen) return;
    const schliessen = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loescht) setZuLoeschen(null);
    };
    window.addEventListener("keydown", schliessen);
    return () => window.removeEventListener("keydown", schliessen);
  }, [zuLoeschen, loescht]);

  useEffect(() => {
    if (zuLoeschen) abbrechen.current?.focus();
  }, [zuLoeschen]);

  async function loeschen() {
    if (!zuLoeschen) return;
    setLoescht(true);
    setLoeschfehler(null);
    try {
      await agent.deleteSession(zuLoeschen.id);
      setZuLoeschen(null);
    } catch (ursache) {
      setLoeschfehler(ursache instanceof Error ? ursache.message : String(ursache));
    } finally {
      setLoescht(false);
    }
  }

  return (
    <aside className="seite">
      {/* Ohne Systemleiste (titleBarStyle "Overlay") gibt es nichts, woran man
          das Fenster fassen könnte. Diese Zeile und die Kopfzeile sind der
          Ersatz dafür. */}
      <div className="marke" data-tauri-drag-region />

      <div className="seite-inhalt">
        <div className="zeile suche">
          <Search size={14} />
          <input
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            placeholder="Suchen"
            aria-label="Sitzungen durchsuchen"
          />
        </div>

        <button className="zeile" disabled={!snap.canSwitch} onClick={() => void wechseln(() => agent.newSession())}>
          <Plus size={14} />
          <span>Neuer Chat</span>
          <kbd>{kurz("N")}</kbd>
        </button>

        {wechselFehler && <div className="leer-hinweis fehler" role="alert">{wechselFehler}</div>}
        <div className="gruppe">Sitzungen</div>
        {gefunden.length === 0 ? (
          <div className="leer-hinweis">
            {snap.sessions.length ? "Nichts gefunden" : "Noch keine Sitzung"}
          </div>
        ) : (
          gefunden.map((s) => (
            <div key={s.id} className={`sitzung${s.id === snap.sessionId ? " aktiv" : ""}`}>
              <button
                className="sitzung-oeffnen"
                title={`${s.title}\n${s.workspace ?? ""}\n${relativeTime(s.modified)}`}
                disabled={!snap.canSwitch && s.id !== snap.sessionId}
                onClick={() => s.id !== snap.sessionId && void wechseln(() => agent.loadSession(s.id))}
              >
                <span>{s.title}</span>
              </button>
              <button
                className="sitzung-loeschen"
                disabled={!snap.canSwitch}
                aria-label={`Chat ${s.title} löschen`}
                title="Chat löschen"
                onClick={() => { setLoeschfehler(null); setZuLoeschen(s); }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="seite-fuss">
        <button className="zeile" onClick={oeffneEinstellungen}>
          <Settings size={14} />
          <span>Einstellungen</span>
        </button>
      </div>
      {zuLoeschen && (
        <div className="ueber" onMouseDown={(e) => {
          if (e.target === e.currentTarget && !loescht) setZuLoeschen(null);
        }}>
          <div className="tafel loesch-dialog" role="alertdialog" aria-modal="true"
            aria-labelledby="loesch-titel" aria-describedby="loesch-text">
            <h2 id="loesch-titel">Chat löschen?</h2>
            <p id="loesch-text">„{zuLoeschen.title}“ wird dauerhaft aus deiner Chatliste entfernt.</p>
            {loeschfehler && <p className="hinweis fehler" role="alert">{loeschfehler}</p>}
            <div className="tafel-fuss">
              <button ref={abbrechen} className="knopf" disabled={loescht} onClick={() => setZuLoeschen(null)}>Abbrechen</button>
              <button className="knopf gefahr" disabled={loescht} onClick={() => void loeschen()}>
                {loescht ? "Löscht …" : "Chat löschen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

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

function Verlauf({ snap }: { snap: Snapshot }) {
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

function Leer({
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

// ── Eingabe ──────────────────────────────────────────────────────────────────

// ── Einstellungen ────────────────────────────────────────────────────────────

/** PDF, Word, Excel für den Agenten — der Schalter und was er bewirkt. */
function Dokumente({ snap }: { snap: Snapshot }) {
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const d = snap.documents;
  const an = !!d?.enabled;

  async function schalten() {
    setLaeuft(true);
    setFehler(null);
    try {
      await agent.setDocuments(!an);
    } catch (ursache) {
      setFehler(nachricht(ursache));
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className="abschnitt">
      <div className="abschnitt-kopf">
        <h3>Dokumente</h3>
        <span className={`zugang-status${an && d?.reachable ? " bereit" : ""}`}>
          {!d ? "…" : an ? (d.reachable ? "Eingeschaltet" : "Programm fehlt") : "Aus"}
        </span>
      </div>
      <p className="abschnitt-text">
        jichi liest PDF, Word, Excel, PowerPoint und OpenDocument im Projekt und erstellt Word-,
        Excel-, PDF- und CSV-Dateien. Lesen geschieht ohne Rückfrage, Schreiben fragt wie jede andere
        Änderung. Dafür trägt diese Anwendung sich in <code>~/.jichi</code> ein (mit Sicherung als
        <code> .jichi.bak-desktop</code>).
      </p>
      {(d?.problem || fehler) && <p className="zugang-fehler" role="alert">{d?.problem ?? fehler}</p>}
      <div className="knopfreihe">
        <button
          type="button"
          className={`knopf${an ? "" : " haupt"}`}
          disabled={laeuft || !d || !!d.problem || !snap.canSwitch}
          onClick={() => void schalten()}
        >
          {laeuft ? "Wird eingetragen …" : an ? "Ausschalten" : "Einschalten"}
        </button>
      </div>
    </div>
  );
}

const MODELLART: Record<string, string> = {
  chat: "Chat",
  embed: "Einbettung",
  rerank: "Rangfolge",
  transcribe: "Sprache → Text",
  speech: "Text → Sprache",
  image: "Bild",
};

function Einstellungen({
  snap,
  prefs,
  setPrefs,
  schliessen,
}: {
  snap: Snapshot;
  prefs: Preferences;
  setPrefs: (p: Preferences) => void;
  schliessen: () => void;
}) {
  const [config, setConfig] = useState<LaunchConfig | null>(agent.config);
  const [args, setArgs] = useState(formatArgs(agent.config?.args ?? []));
  const [prueft, setPrueft] = useState(false);
  const [entfernt, setEntfernt] = useState(false);
  const [verbindungsFehler, setVerbindungsFehler] = useState<string | null>(null);

  const r = snap.readiness;

  async function pruefen() {
    setPrueft(true);
    setVerbindungsFehler(null);
    try {
      await agent.checkHealth();
    } catch (ursache) {
      setVerbindungsFehler(ursache instanceof Error ? ursache.message : String(ursache));
    } finally {
      setPrueft(false);
    }
  }

  async function schluesselEntfernen() {
    setEntfernt(true);
    setVerbindungsFehler(null);
    try {
      await agent.forgetKey();
      if (!agent.getSnapshot().needsSetup) {
        throw new Error("Der Schlüssel ist noch verfügbar. Bitte prüfe die Schlüsselablage.");
      }
      schliessen();
    } catch (ursache) {
      setVerbindungsFehler(ursache instanceof Error ? ursache.message : String(ursache));
    } finally {
      setEntfernt(false);
    }
  }

  async function speichern() {
    if (!config) return schliessen();
    setVerbindungsFehler(null);
    try {
      // Der Kern startet nur neu, wenn sich am Start etwas geändert hat.
      await agent.setConfig({ ...config, args: parseArgs(args), env: agent.config?.env ?? [] });
      schliessen();
    } catch (ursache) {
      setVerbindungsFehler(nachricht(ursache));
    }
  }

  return (
    <div className="ueber" onMouseDown={(e) => e.target === e.currentTarget && schliessen()}>
      <div className="tafel">
        <h2>Einstellungen</h2>

        <label className="feld">
          <span>Name</span>
          <input
            value={prefs.name}
            onChange={(e) => setPrefs({ ...prefs, name: e.target.value })}
            autoComplete="off"
          />
        </label>

        <label className="feld">
          <span>Erscheinungsbild</span>
          <select
            value={prefs.appearance}
            onChange={(e) => setPrefs({ ...prefs, appearance: e.target.value as Appearance })}
          >
            <option value="system">System</option>
            <option value="light">Hell</option>
            <option value="dark">Dunkel</option>
          </select>
        </label>

        <div className="feld">
          <span>Fensterlayout</span>
          <div className="layout-optionen" role="group" aria-label="Fensterlayout">
            <button type="button" className={prefs.layout === "floating" ? "gewaehlt" : ""}
              aria-pressed={prefs.layout === "floating"}
              onClick={() => setPrefs({ ...prefs, layout: "floating" })}>
              <span className="layout-vorschau freistehend" aria-hidden="true"><i /><i /></span>
              <span>Freistehend</span>
            </button>
            <button type="button" className={prefs.layout === "classic" ? "gewaehlt" : ""}
              aria-pressed={prefs.layout === "classic"}
              onClick={() => setPrefs({ ...prefs, layout: "classic" })}>
              <span className="layout-vorschau klassisch" aria-hidden="true"><i /><i /></span>
              <span>Klassisch</span>
            </button>
          </div>
        </div>

        <div className="abschnitt">
          <h3>Zugang</h3>
          <div className="zugang">
            <div className="zugang-kopf">
              <span className="zugang-symbol"><KeyRound size={16} /></span>
              <div className="zugang-text">
                <strong>jichi Assistent</strong>
                <p>{!r
                  ? "Der Zugang wird geprüft."
                  : r.keyStored
                    ? "Dein API-Schlüssel ist auf diesem Gerät gespeichert."
                    : "Für neue Chats wird ein API-Schlüssel benötigt."}</p>
              </div>
              <span className={`zugang-status${r && !r.needsSetup ? " bereit" : ""}`}>
                {!r ? "Prüft …" : r.needsSetup ? "Einrichtung nötig" : "Bereit"}
              </span>
            </div>
            {verbindungsFehler && <p className="zugang-fehler" role="alert">{verbindungsFehler}</p>}
            {snap.health && (
              <details className="zugang-pruefung">
                <summary>Prüfbericht ansehen</summary>
                <Bericht bericht={snap.health} />
              </details>
            )}
            <div className="knopfreihe zugang-aktionen">
              <button className="knopf" disabled={prueft || entfernt} onClick={() => void pruefen()}>
                {prueft ? "Prüft …" : "Zugang prüfen"}
              </button>
              <button className="knopf gefahr" disabled={!r?.keyStored || entfernt}
                onClick={() => void schluesselEntfernen()}>
                {entfernt ? "Entfernt …" : "API-Schlüssel entfernen"}
              </button>
            </div>
          </div>
        </div>

        <Dokumente snap={snap} />

        <div className="abschnitt">
          <div className="abschnitt-kopf">
            <h3>Verfügbare Modelle</h3>
            <button
              type="button"
              className="knopf-klein knopf-symbol"
              disabled={!r?.keyStored || snap.gateway?.loading}
              onClick={() => void agent.refreshGateway()}
              aria-label="Liste neu laden"
              title="Liste neu laden"
            >
              <RefreshCw size={13} className={snap.gateway?.loading ? "dreht" : ""} />
            </button>
          </div>
          <p className="abschnitt-text">
            Was dein Schlüssel am Gateway erreicht. Gezeigt werden nur die freien Modelle der JLU
            (<code>jlu/…</code>) — Modelle anderer Anbieter kosten Geld und erscheinen hier nicht.
          </p>
          {snap.gateway?.error && <p className="zugang-fehler" role="alert">{snap.gateway.error}</p>}
          {!snap.gateway && <p className="abschnitt-text">Noch nicht abgefragt.</p>}
          {snap.gateway && snap.gateway.models.length > 0 && (
            <ul className="modellliste">
              {snap.gateway.models.map((m) => (
                <li key={m.id}>
                  <span className="modell-id">{m.id}</span>
                  <span className={`modell-art ${m.kind}`}>{MODELLART[m.kind]}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="abschnitt">
          <details>
            <summary>Erweitert</summary>

            <div className="technik-meta">
              {r?.version && <div>Agent: {r.version}</div>}
              {r?.config.models[0]?.apiBase && <div>Server: {r.config.models[0].apiBase}</div>}
              {r?.config.exists && <div>Modelle: {r.config.models.length}</div>}
            </div>

            <label className="feld mono">
              <span>Programm</span>
              <input
                value={config?.program ?? ""}
                onChange={(e) => config && setConfig({ ...config, program: e.target.value })}
                spellCheck={false}
              />
            </label>

            <label className="feld mono">
              <span>Argumente</span>
              <input value={args} onChange={(e) => setArgs(e.target.value)} spellCheck={false} />
            </label>

            <label className="feld mono">
              <span>Arbeitsverzeichnis</span>
              <input
                value={config?.cwd ?? ""}
                onChange={(e) => config && setConfig({ ...config, cwd: e.target.value })}
                spellCheck={false}
              />
            </label>

            <pre className="diagnose">{snap.diagnostics.join("\n") || "— noch nichts —"}</pre>
          </details>
        </div>

        <div className="tafel-fuss">
          <button className="knopf" onClick={schliessen}>
            Schließen
          </button>
          <button className="knopf haupt" onClick={() => void speichern()}>
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Anwendung ────────────────────────────────────────────────────────────────

function App() {
  const snap = useAgent();
  const [prefs, setPrefsState] = useState<Preferences>(() => readPreferences());
  const [einstellungen, setEinstellungen] = useState(false);

  const setPrefs = useCallback((next: Preferences) => {
    setPrefsState(next);
    writePreferences(next);
    applyAppearance(next.appearance);
  }, []);

  useEffect(() => {
    void agent.init();
  }, []);

  // Der Systemeinstellung folgen, solange "System" gewählt ist.
  const wahl = useRef(prefs.appearance);
  wahl.current = prefs.appearance;
  useEffect(() => watchAppearance(() => wahl.current), []);

  useEffect(() => {
    function tasten(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        if (!agent.getSnapshot().canSwitch) return;
        void agent.newSession().catch(() => {});
      }
      if (e.key === "Escape") setEinstellungen(false);
    }
    window.addEventListener("keydown", tasten);
    return () => window.removeEventListener("keydown", tasten);
  }, []);

  // Wird die Einrichtung nötig (Schlüssel entfernt), schliessen die Einstellungen
  // — sonst sprängen sie danach ungefragt wieder auf.
  useEffect(() => {
    if (snap.needsSetup) setEinstellungen(false);
  }, [snap.needsSetup]);

  const punkt =
    snap.status === "ready"
      ? "bereit"
      : snap.status === "busy" || snap.status === "starting" || snap.status === "cancelling"
        ? "aktiv"
        : snap.status === "error"
          ? "fehler"
          : "";

  return (
    <>
      <div className={`app layout-${prefs.layout}`} inert={snap.needsSetup} aria-hidden={snap.needsSetup}>
      <Seitenleiste snap={snap} oeffneEinstellungen={() => setEinstellungen(true)} />

      <main className="haupt">
        <header className="kopf" data-tauri-drag-region>
          <div className="zustand" data-tauri-drag-region>
            <span className={`punkt ${punkt}`} data-tauri-drag-region />
            {snap.error ?? statusLabel(snap.status)}
          </div>

          <div className="kopf-rechts" data-tauri-drag-region>
            <button
              className="knopf-klein"
              disabled={!snap.canSwitch}
              onClick={() => void agent.pickWorkspace().catch(() => {})}
              title={snap.hasProject && snap.cwd ? snap.cwd : "Projektordner wählen"}
            >
              <FolderOpen size={13} />
              <span className="pfad">{snap.hasProject ? shortPath(snap.cwd, 34) : "Projekt öffnen"}</span>
            </button>
            <button
              className="knopf-klein knopf-symbol"
              onClick={() =>
                setPrefs({
                  ...prefs,
                  appearance: prefs.appearance === "dark" ? "light" : "dark",
                })
              }
              aria-label="Erscheinungsbild wechseln"
            >
              {prefs.appearance === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </div>
        </header>

        {snap.transcript.length === 0 && !snap.permission ? (
          <Leer snap={snap} name={prefs.name} frage={(t) => void agent.send(t).catch(() => {})} />
        ) : (
          <Verlauf snap={snap} />
        )}

        <Eingabe snap={snap} />
      </main>

      {einstellungen && !snap.needsSetup && (
        <Einstellungen
          snap={snap}
          prefs={prefs}
          setPrefs={setPrefs}
          schliessen={() => setEinstellungen(false)}
        />
      )}
      </div>
      {snap.needsSetup && <Einrichtung snap={snap} prefs={prefs} setPrefs={setPrefs} />}
    </>
  );
}

// Nur auf macOS schwebt die Ampel über dem Inhalt und braucht Platz.
if (IS_MAC) document.documentElement.classList.add("mac");

const wurzel = document.getElementById("root");
if (wurzel) createRoot(wurzel).render(<App />);
