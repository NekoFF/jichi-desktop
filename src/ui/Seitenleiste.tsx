/** Die linke Leiste: Suche, neuer Chat, Sitzungen, Einstellungen. */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Search,
  Settings,
  Trash2,
} from "lucide-react";
import {
  agent,
  relativeTime,
  type StoredSession,
  type Snapshot,
} from "../core/index.ts";
import { panel } from "./panel/store.ts";
import { kurz, nachricht } from "./util.ts";

// ── Seitenleiste ─────────────────────────────────────────────────────────────

export function Seitenleiste({
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
    panel.setOverlay(!!zuLoeschen);
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
