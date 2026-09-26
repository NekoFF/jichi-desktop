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
  SPRACHEN,
  t,
  type Appearance,
  type Sprache,
  type LaunchConfig,
  type Preferences,
  type Snapshot,
} from "../core/index.ts";
import { Bericht } from "./Einrichtung.tsx";
import { Erlaubnisse, McpServer } from "./JichiEinstellungen.tsx";
import { nachricht, useSprache } from "./util.ts";

// ── Einstellungen ────────────────────────────────────────────────────────────

/** PDF, Word, Excel für den Agenten — der Schalter und was er bewirkt. */
function Dokumente({ snap }: { snap: Snapshot }) {
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  useSprache();
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
        <h3>{t("Dokumente")}</h3>
        <span className={`zugang-status${an && d?.reachable ? " bereit" : ""}`}>
          {!d ? "…" : an ? (d.reachable ? t("Eingeschaltet") : t("Programm fehlt")) : t("Aus")}
        </span>
      </div>
      <p className="abschnitt-text">
        {t("jichi liest PDF, Word, Excel, PowerPoint und OpenDocument im Projekt und erstellt Word-, Excel-, PDF- und CSV-Dateien. Lesen geschieht ohne Rückfrage, Schreiben fragt wie jede andere Änderung.")}{" "}
        {t("Dafür trägt diese Anwendung sich in")} <code>~/.jichi</code> {t("ein (mit Sicherung als")}
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
          {laeuft ? t("Wird eingetragen …") : an ? t("Ausschalten") : t("Einschalten")}
        </button>
      </div>
    </div>
  );
}

/** Beim Zeichnen ausgewertet, damit ein Sprachwechsel greift. */
function modellArt(art: string): string | undefined {
  switch (art) {
    case "chat": return t("Chat");
    case "embed": return t("Einbettung");
    case "rerank": return t("Rangfolge");
    case "transcribe": return t("Sprache → Text");
    case "speech": return t("Text → Sprache");
    case "image": return t("Bild");
    default: return undefined;
  }
}

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
  useSprache();

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
        throw new Error(t("Der Schlüssel ist noch verfügbar. Bitte prüfe die Schlüsselablage."));
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
        <h2>{t("Einstellungen")}</h2>

        <label className="feld">
          <span>{t("Name")}</span>
          <input
            value={prefs.name}
            onChange={(e) => setPrefs({ ...prefs, name: e.target.value })}
            autoComplete="off"
          />
        </label>

        <label className="feld">
          <span>{t("Sprache")}</span>
          <select
            value={prefs.language}
            onChange={(e) => setPrefs({ ...prefs, language: e.target.value as Sprache })}
          >
            {SPRACHEN.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>

        <label className="feld">
          <span>{t("Erscheinungsbild")}</span>
          <select
            value={prefs.appearance}
            onChange={(e) => setPrefs({ ...prefs, appearance: e.target.value as Appearance })}
          >
            <option value="system">{t("System")}</option>
            <option value="light">{t("Hell")}</option>
            <option value="dark">{t("Dunkel")}</option>
          </select>
        </label>

        <div className="feld">
          <span>{t("Fensterlayout")}</span>
          <div className="layout-optionen" role="group" aria-label={t("Fensterlayout")}>
            <button type="button" className={prefs.layout === "floating" ? "gewaehlt" : ""}
              aria-pressed={prefs.layout === "floating"}
              onClick={() => setPrefs({ ...prefs, layout: "floating" })}>
              <span className="layout-vorschau freistehend" aria-hidden="true"><i /><i /></span>
              <span>{t("Freistehend")}</span>
            </button>
            <button type="button" className={prefs.layout === "classic" ? "gewaehlt" : ""}
              aria-pressed={prefs.layout === "classic"}
              onClick={() => setPrefs({ ...prefs, layout: "classic" })}>
              <span className="layout-vorschau klassisch" aria-hidden="true"><i /><i /></span>
              <span>{t("Klassisch")}</span>
            </button>
          </div>
        </div>

        <div className="abschnitt">
          <h3>{t("Zugang")}</h3>
          <div className="zugang">
            <div className="zugang-kopf">
              <span className="zugang-symbol"><KeyRound size={16} /></span>
              <div className="zugang-text">
                <strong>{t("jichi Assistent")}</strong>
                <p>{!r
                  ? t("Der Zugang wird geprüft.")
                  : r.keyStored
                    ? t("Dein API-Schlüssel ist auf diesem Gerät gespeichert.")
                    : t("Für neue Chats wird ein API-Schlüssel benötigt.")}</p>
              </div>
              <span className={`zugang-status${r && !r.needsSetup ? " bereit" : ""}`}>
                {!r ? t("Prüft …") : r.needsSetup ? t("Einrichtung nötig") : t("Bereit")}
              </span>
            </div>
            {verbindungsFehler && <p className="zugang-fehler" role="alert">{verbindungsFehler}</p>}
            {snap.health && (
              <details className="zugang-pruefung">
                <summary>{t("Prüfbericht ansehen")}</summary>
                <Bericht bericht={snap.health} />
              </details>
            )}
            <div className="knopfreihe zugang-aktionen">
              <button className="knopf" disabled={prueft || entfernt} onClick={() => void pruefen()}>
                {prueft ? t("Prüft …") : t("Zugang prüfen")}
              </button>
              <button className="knopf gefahr" disabled={!r?.keyStored || entfernt}
                onClick={() => void schluesselEntfernen()}>
                {entfernt ? t("Entfernt …") : t("API-Schlüssel entfernen")}
              </button>
            </div>
          </div>
        </div>

        <Dokumente snap={snap} />
        <Erlaubnisse />
        <McpServer />

        <div className="abschnitt">
          <div className="abschnitt-kopf">
            <h3>{t("Verfügbare Modelle")}</h3>
            <button
              type="button"
              className="knopf-klein knopf-symbol"
              disabled={!r?.keyStored || snap.gateway?.loading}
              onClick={() => void agent.refreshGateway()}
              aria-label={t("Liste neu laden")}
              title={t("Liste neu laden")}
            >
              <RefreshCw size={13} className={snap.gateway?.loading ? "dreht" : ""} />
            </button>
          </div>
          <p className="abschnitt-text">
            {t("Was dein Schlüssel am Gateway erreicht. Gezeigt werden nur die freien Modelle der JLU")}{" "}
            (<code>jlu/…</code>) {t("— Modelle anderer Anbieter kosten Geld und erscheinen hier nicht.")}
          </p>
          {snap.gateway?.error && <p className="zugang-fehler" role="alert">{snap.gateway.error}</p>}
          {!snap.gateway && <p className="abschnitt-text">{t("Noch nicht abgefragt.")}</p>}
          {snap.gateway && snap.gateway.models.length > 0 && (
            <ul className="modellliste">
              {snap.gateway.models.map((m) => (
                <li key={m.id}>
                  <span className="modell-id">{m.id}</span>
                  <span className={`modell-art ${m.kind}`}>{modellArt(m.kind)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="abschnitt">
          <details>
            <summary>{t("Erweitert")}</summary>

            <div className="technik-meta">
              {r?.version && <div>{t("Agent: {version}", { version: r.version })}</div>}
              {r?.config.models[0]?.apiBase && <div>{t("Server: {adresse}", { adresse: r.config.models[0].apiBase })}</div>}
              {r?.config.exists && <div>{t("Modelle: {n}", { n: r.config.models.length })}</div>}
            </div>

            <label className="feld mono">
              <span>{t("Programm")}</span>
              <input
                value={config?.program ?? ""}
                onChange={(e) => config && setConfig({ ...config, program: e.target.value })}
                spellCheck={false}
              />
            </label>

            <label className="feld mono">
              <span>{t("Argumente")}</span>
              <input value={args} onChange={(e) => setArgs(e.target.value)} spellCheck={false} />
            </label>

            <label className="feld mono">
              <span>{t("Arbeitsverzeichnis")}</span>
              <input
                value={config?.cwd ?? ""}
                onChange={(e) => config && setConfig({ ...config, cwd: e.target.value })}
                spellCheck={false}
              />
            </label>

            <pre className="diagnose">{snap.diagnostics.join("\n") || t("— noch nichts —")}</pre>
          </details>
        </div>

        <div className="tafel-fuss">
          <button className="knopf" onClick={schliessen}>
            {t("Schließen")}
          </button>
          <button className="knopf haupt" onClick={() => void speichern()}>
            {t("Speichern")}
          </button>
        </div>
      </div>
    </div>
  );
}
