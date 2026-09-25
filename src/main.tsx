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
  ArrowUp,
  ChevronDown,
  ChevronRight,
  FileText,
  FolderOpen,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
  Terminal,
  Wrench,
  X,
} from "lucide-react";

import {
  agent,
  applyAppearance,
  formatArgs,
  parseArgs,
  permissionTone,
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
  type Snapshot,
  type ToolItem,
  type TranscriptItem,
} from "./core/index.ts";
import "./styles.css";

const useAgent = (): Snapshot =>
  useSyncExternalStore(agent.subscribe, agent.getSnapshot);

// ── Einrichtung ──────────────────────────────────────────────────────────────

function Einrichtung({
  prefs,
  setPrefs,
}: {
  prefs: Preferences;
  setPrefs: (p: Preferences) => void;
}) {
  const [name, setName] = useState(prefs.name);
  const [key, setKey] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [bericht, setBericht] = useState<DoctorReport | null>(null);

  async function verbinden() {
    if (!key.trim()) {
      setMeldung("Bitte den API-Schlüssel eintragen.");
      return;
    }
    setLaeuft(true);
    setMeldung("Schlüssel wird abgelegt und geprüft …");
    setBericht(null);
    setPrefs({ ...prefs, name: name.trim() });
    try {
      const ergebnis = await agent.setup(key);
      setKey(""); // Der Schlüssel hat im Fenster nichts mehr zu suchen.
      setBericht(ergebnis);
      setMeldung(ergebnis.fail ? "Der Agent meldet Fehler." : null);
    } catch (ursache) {
      setMeldung(ursache instanceof Error ? ursache.message : String(ursache));
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className="ueber">
      <div className="tafel einrichtung">
        <div className="marke-zeichen">
          <Terminal size={17} />
        </div>
        <h1>Willkommen bei jichi</h1>
        <p>Einmalig einrichten, dann nie wieder.</p>

        <label className="feld">
          <span>Wie soll jichi dich nennen?</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Dein Name"
            autoComplete="off"
          />
        </label>

        <label className="feld">
          <span>API-Schlüssel</span>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void verbinden()}
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        <button className="knopf haupt" disabled={laeuft} onClick={() => void verbinden()}>
          {laeuft ? "Wird geprüft …" : "Verbinden"}
        </button>

        {meldung && <p className="fussnote">{meldung}</p>}
        <Bericht bericht={bericht} />

        <p className="fussnote">
          Der Schlüssel bleibt auf diesem Gerät und ist nur für dein Benutzerkonto lesbar.
          Er wird nie wieder angezeigt und geht an nichts ausser den Agenten.
        </p>
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
  const gefunden = useMemo(() => {
    const begriff = suche.trim().toLowerCase();
    if (!begriff) return snap.sessions;
    return snap.sessions.filter((s) => s.title.toLowerCase().includes(begriff));
  }, [snap.sessions, suche]);

  return (
    <aside className="seite">
      {/* Ohne Systemleiste (titleBarStyle "Overlay") gibt es nichts, woran man
          das Fenster fassen könnte. Diese Zeile und die Kopfzeile sind der
          Ersatz dafür. */}
      <div className="marke" data-tauri-drag-region>
        <span className="marke-zeichen" data-tauri-drag-region>
          <Terminal size={13} />
        </span>
        <span className="marke-name" data-tauri-drag-region>
          jichi
        </span>
      </div>

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

        <button className="zeile" onClick={() => void agent.newSession()}>
          <Plus size={14} />
          <span>Neuer Chat</span>
          <kbd>⌘N</kbd>
        </button>

        <div className="gruppe">Sitzungen</div>
        {gefunden.length === 0 ? (
          <div className="leer-hinweis">
            {snap.sessions.length ? "Nichts gefunden" : "Noch keine Sitzung"}
          </div>
        ) : (
          gefunden.map((s) => (
            <button
              key={s.id}
              className={`zeile${s.id === snap.sessionId ? " aktiv" : ""}`}
              title={`${s.title}\n${s.workspace ?? ""}\n${relativeTime(s.modified)}`}
              onClick={() => void agent.loadSession(s.id)}
            >
              <span>{s.title}</span>
            </button>
          ))
        )}
      </div>

      <div className="seite-fuss">
        <button className="zeile" onClick={oeffneEinstellungen}>
          <Settings size={14} />
          <span>Einstellungen</span>
        </button>
      </div>
    </aside>
  );
}

// ── Verlauf ──────────────────────────────────────────────────────────────────

function Werkzeug({ eintrag }: { eintrag: ToolItem }) {
  const [offen, setOffen] = useState(false);
  const inhalt = [
    eintrag.output,
    ...eintrag.diffs.map((d) => `--- ${d.path}\n${d.newText}`),
    eintrag.truncated ? "\n… gekürzt" : "",
  ]
    .filter(Boolean)
    .join("\n");

  const lage =
    eintrag.status === "completed" ? "fertig" : eintrag.status === "failed" ? "fehlgeschlagen" : "";

  return (
    <div className={`werkzeug ${lage}`}>
      <button
        className="werkzeug-kopf"
        onClick={() => setOffen((o) => !o)}
        disabled={!inhalt}
        aria-expanded={offen}
      >
        <Wrench size={13} />
        <span className="werkzeug-name">{eintrag.title}</span>
        <span className="werkzeug-lage">
          {toolKindLabel(eintrag.toolKind)} · {toolStatusLabel(eintrag.status)}
        </span>
        {inhalt ? offen ? <ChevronDown size={13} /> : <ChevronRight size={13} /> : null}
      </button>
      {offen && inhalt && <pre>{inhalt}</pre>}
    </div>
  );
}

function Eintrag({ eintrag }: { eintrag: TranscriptItem }) {
  if (eintrag.kind === "tool") return <Werkzeug eintrag={eintrag} />;

  if (eintrag.kind === "notice") {
    return (
      <div className={`hinweis${eintrag.level === "error" ? " fehler" : ""}`}>{eintrag.text}</div>
    );
  }

  if (eintrag.role === "user") {
    return (
      <div className="nachricht vom-nutzer">
        <div>{eintrag.text}</div>
      </div>
    );
  }

  return (
    <div
      className={`nachricht ${eintrag.role === "thought" ? "gedanke" : "vom-agenten"}${
        eintrag.streaming ? " schreibt" : ""
      }`}
    >
      {eintrag.text}
    </div>
  );
}

function Rueckfrage({ snap }: { snap: Snapshot }) {
  const frage = snap.permission;
  if (!frage) return null;
  return (
    <div className="rueckfrage">
      <div className="rueckfrage-titel">jichi bittet um Erlaubnis</div>
      <code>{frage.title}</code>
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

  return (
    <div className="verlauf" ref={box} onScroll={beobachten}>
      <div className="spalte">
        {snap.transcript.map((e) => (
          <Eintrag key={e.id} eintrag={e} />
        ))}
        <Rueckfrage snap={snap} />
      </div>
    </div>
  );
}

function Leer({ snap, frage }: { snap: Snapshot; frage: (text: string) => void }) {
  const name = readPreferences().name;
  return (
    <div className="leer">
      <div className="leer-mitte">
        <h2 className="leer-titel">{name ? `Hallo, ${name}.` : "Womit fangen wir an?"}</h2>
        <p className="leer-text">
          {snap.cwd ? shortPath(snap.cwd, 60) : "Noch kein Projekt geöffnet."}
        </p>

        {!snap.cwd && (
          <button className="vorschlag" onClick={() => void agent.pickWorkspace()}>
            <FolderOpen size={15} />
            Projekt öffnen
            <small>Ordner wählen</small>
          </button>
        )}
        <button className="vorschlag" onClick={() => frage("Erklär mir dieses Projekt.")}>
          <FileText size={15} />
          Projekt erklären
        </button>
        <button className="vorschlag" onClick={() => frage("Führe die Tests aus.")}>
          <Terminal size={15} />
          Tests ausführen
        </button>
      </div>
    </div>
  );
}

// ── Eingabe ──────────────────────────────────────────────────────────────────

function Eingabe({ snap }: { snap: Snapshot }) {
  const [text, setText] = useState("");
  const feld = useRef<HTMLTextAreaElement>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const anpassen = useCallback(() => {
    const el = feld.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, []);

  useEffect(anpassen, [text, anpassen]);

  function senden() {
    const inhalt = text.trim();
    if (!inhalt || !snap.canSend) return;
    setText("");
    setFehler(null);
    void agent.send(inhalt).catch((ursache) => {
      setText(inhalt); // nicht verlieren, wenn der Start scheitert
      setFehler(ursache instanceof Error ? ursache.message : String(ursache));
    });
  }

  return (
    <div className="eingabe">
      <div className="spalte">
        <div className="eingabe-feld">
          <textarea
            ref={feld}
            rows={1}
            value={text}
            placeholder="Frag jichi …"
            readOnly={!snap.canSend}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                senden();
              }
            }}
          />
          <button
            className="senden"
            disabled={!snap.canSend || !text.trim()}
            onClick={senden}
            aria-label="Senden"
          >
            <ArrowUp size={15} />
          </button>
        </div>
        <div className="eingabe-fuss">
          {fehler ?? "Enter senden · Umschalt+Enter neue Zeile"}
        </div>
      </div>
    </div>
  );
}

// ── Einstellungen ────────────────────────────────────────────────────────────

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

  const r = snap.readiness;

  function speichern() {
    if (config) {
      void agent
        .setConfig({ ...config, args: parseArgs(args), env: agent.config?.env ?? [] })
        .catch(() => {});
    }
    schliessen();
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

        <div className="abschnitt">
          <h3>KI-Verbindung</h3>
          <div className="bericht">
            <div>
              {r?.keyStored ? "Schlüssel hinterlegt" : "Kein Schlüssel"}
              {r?.config.exists ? ` · ${r.config.models.length} Modelle` : " · keine Konfiguration"}
              {r?.version ? ` · ${r.version}` : ""}
            </div>
            {r?.config.models[0]?.apiBase && <div>{r.config.models[0].apiBase}</div>}
          </div>
          <Bericht bericht={snap.health} />
          <div className="knopfreihe" style={{ marginTop: 12 }}>
            <button
              className="knopf"
              disabled={prueft}
              onClick={() => {
                setPrueft(true);
                void agent.checkHealth().finally(() => setPrueft(false));
              }}
            >
              {prueft ? "Prüft …" : "Verbindung prüfen"}
            </button>
            <button
              className="knopf gefahr"
              onClick={() => {
                schliessen();
                void agent.forgetKey();
              }}
            >
              Schlüssel entfernen
            </button>
          </div>
        </div>

        <div className="abschnitt">
          <details>
            <summary>Erweitert</summary>

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
          <button className="knopf haupt" onClick={speichern}>
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
        void agent.newSession();
      }
      if (e.key === "Escape") setEinstellungen(false);
    }
    window.addEventListener("keydown", tasten);
    return () => window.removeEventListener("keydown", tasten);
  }, []);

  if (snap.needsSetup) return <Einrichtung prefs={prefs} setPrefs={setPrefs} />;

  const punkt =
    snap.status === "ready"
      ? "bereit"
      : snap.status === "busy" || snap.status === "starting" || snap.status === "cancelling"
        ? "aktiv"
        : snap.status === "error"
          ? "fehler"
          : "";

  return (
    <div className="app">
      <Seitenleiste snap={snap} oeffneEinstellungen={() => setEinstellungen(true)} />

      <main className="haupt">
        <header className="kopf" data-tauri-drag-region>
          <div className="zustand" data-tauri-drag-region>
            <span className={`punkt ${punkt}`} data-tauri-drag-region />
            {snap.error ?? statusLabel(snap.status)}
          </div>

          <div className="kopf-rechts" data-tauri-drag-region>
            {snap.canCancel && (
              <button className="knopf-klein abbrechen" onClick={() => void agent.cancel()}>
                <X size={13} />
                Abbrechen
              </button>
            )}
            <button
              className="knopf-klein"
              onClick={() => void agent.pickWorkspace()}
              title={snap.cwd ?? "Projektordner wählen"}
            >
              <FolderOpen size={13} />
              <span className="pfad">{shortPath(snap.cwd, 34) || "Projekt öffnen"}</span>
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
          <Leer snap={snap} frage={(t) => void agent.send(t)} />
        ) : (
          <Verlauf snap={snap} />
        )}

        <Eingabe snap={snap} />
      </main>

      {einstellungen && (
        <Einstellungen
          snap={snap}
          prefs={prefs}
          setPrefs={setPrefs}
          schliessen={() => setEinstellungen(false)}
        />
      )}
    </div>
  );
}

// Nur auf macOS schwebt die Ampel über dem Inhalt und braucht Platz.
if (/Mac/i.test(navigator.userAgent)) document.documentElement.classList.add("mac");

const wurzel = document.getElementById("root");
if (wurzel) createRoot(wurzel).render(<App />);
