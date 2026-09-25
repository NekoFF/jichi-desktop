/** Der erste Start: Name, Schlüssel, Selbstprüfung — über der echten Oberfläche. */

import { useState } from "react";
import {
  agent,
  shortPath,
  type DoctorReport,
  type Preferences,
  type Snapshot,
} from "../core/index.ts";
import { nachricht } from "./util.ts";

// ── Einrichtung ──────────────────────────────────────────────────────────────

export function Einrichtung({
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

export function Bericht({ bericht }: { bericht: DoctorReport | null }) {
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
