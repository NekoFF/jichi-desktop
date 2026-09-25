/** Einstellungen: Name, Aussehen, Zugang, Dokumente, Modelle, Erweitert. */

import { useState } from "react";
import {
  KeyRound,
  RefreshCw,
} from "lucide-react";
import {
  agent,
  formatArgs,
  parseArgs,
  type Appearance,
  type LaunchConfig,
  type Preferences,
  type Snapshot,
} from "../core/index.ts";
import { Bericht } from "./Einrichtung.tsx";
import { Erlaubnisse, McpServer } from "./JichiEinstellungen.tsx";
import { nachricht } from "./util.ts";

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

export function Einstellungen({
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
        <Erlaubnisse />
        <McpServer />

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
