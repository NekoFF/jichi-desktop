/** Der erste Start: Name, Schlüssel, Selbstprüfung — über der echten Oberfläche. */

import { useState } from "react";
import {
  agent,
  shortPath,
  t,
  type DoctorReport,
  type Preferences,
  type Snapshot,
} from "../core/index.ts";
import { nachricht, useSprache } from "./util.ts";

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
  useSprache();

  const r = snap.readiness;
  const agentFehlt = r !== null && !r.agent;
  // Hängt die Einrichtung an einem Fehlbericht, liegt der Schlüssel schon ab:
  // dann wird nur neu geprüft, nicht erneut nach ihm gefragt.
  const pruefenStattEingeben = snap.setupHold && !!r?.keyStored;

  async function verbinden() {
    if (!pruefenStattEingeben && !key.trim()) {
      setMeldung(t("Bitte den API-Schlüssel eintragen."));
      return;
    }
    setLaeuft(true);
    setMeldung(pruefenStattEingeben ? t("Zugang wird geprüft …") : t("Schlüssel wird abgelegt und geprüft …"));
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
          <h1 id="setup-title">{t("jichi einrichten")}</h1>
          <p className="setup-intro">{t("Verbinde deinen Zugang, um mit jichi zu starten.")}</p>

          <label className="feld">
            <span>{t("Wie soll jichi dich nennen?")}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void verbinden()}
              placeholder={t("Dein Name")}
              autoComplete="off"
            />
          </label>

          {agentFehlt && (
            <div className="setup-programm" role="group" aria-label={t("Programm")}>
              <div>
                <strong>{t("jichi wurde nicht gefunden")}</strong>
                <p>{r?.agent ?? (agent.config?.program && agent.config.program !== "jichi"
                  ? t("{pfad} ist nicht ausführbar.", { pfad: shortPath(agent.config.program, 48) })
                  : t("Wähle die gebaute Programmdatei aus."))}</p>
              </div>
              <button type="button" className="knopf" onClick={() => void programmWaehlen()}>
                {t("Auswählen …")}
              </button>
            </div>
          )}

          {!pruefenStattEingeben && (
            <label className="feld">
              <span>{t("API-Schlüssel")}</span>
              <input
                type="password"
                autoFocus
                value={key}
                onChange={(e) => setKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void verbinden()}
                placeholder={t("Schlüssel eingeben")}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
          )}

          <button className="knopf haupt" disabled={laeuft || agentFehlt} onClick={() => void verbinden()}>
            {laeuft ? t("Wird geprüft …") : pruefenStattEingeben ? t("Erneut prüfen") : t("Verbinden")}
          </button>

          {meldung && <p className="setup-message" role="status">{meldung}</p>}
          {snap.setupHold && (
            <>
              <p className="setup-message fehler" role="alert">
                {t("Der Agent meldet Fehler. Ist der Schlüssel richtig und der Server erreichbar?")}
              </p>
              <Bericht bericht={snap.health} />
              <button type="button" className="knopf-text" onClick={() => agent.finishSetup()}>
                {t("Trotzdem fortfahren")}
              </button>
            </>
          )}

          <p className="setup-sicherheit">
            {t("Dein Schlüssel wird auf diesem Gerät gespeichert und ist nur für dein Benutzerkonto lesbar. jichi verwendet ihn für die Verbindung zum Modellserver.")}
          </p>
        </section>
      </div>
    </div>
  );
}

export function Bericht({ bericht }: { bericht: DoctorReport | null }) {
  useSprache();
  if (!bericht) return null;
  const auffaellig = bericht.checks.filter((c) => c.status !== "ok").slice(0, 5);
  return (
    <div className="bericht">
      <div className={bericht.fail ? "fehler" : ""}>
        {bericht.ok === 1 ? t("1 Prüfung bestanden") : t("{n} Prüfungen bestanden", { n: bericht.ok })}
        {bericht.warn ? `, ${bericht.warn === 1 ? t("1 Hinweis") : t("{n} Hinweise", { n: bericht.warn })}` : ""}
        {bericht.fail ? `, ${t("{n} fehlgeschlagen", { n: bericht.fail })}` : ""}
      </div>
      {auffaellig.map((c) => (
        <div key={c.label} className={c.status === "fail" ? "fehler" : "warnung"}>
          {c.label}
        </div>
      ))}
    </div>
  );
}
