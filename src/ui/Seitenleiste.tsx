/** Die linke Leiste: Suche, neuer Chat, Sitzungen, Einstellungen. */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings,
  Trash2,
} from "lucide-react";
import {
  agent,
  relativeTime,
  t,
  type ChatHit,
  type StoredSession,
  type Snapshot,
} from "../core/index.ts";
import { panel } from "./panel/store.ts";
import { kurz, nachricht, useSprache } from "./util.ts";

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
  useSprache();

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

  // Im Inhalt suchen — kurz gewartet, damit nicht jeder Tastendruck die Platte liest.
  const [treffer, setTreffer] = useState<ChatHit[]>([]);
  useEffect(() => {
    const q = suche.trim();
    if (q.length < 2) return setTreffer([]);
    const zeit = setTimeout(() => void agent.searchChats(q).then(setTreffer, () => setTreffer([])), 220);
    return () => clearTimeout(zeit);
  }, [suche]);
  const imInhalt = treffer.filter((h) => !gefunden.some((g) => g.id === h.id));

  const [menue, setMenue] = useState<string | null>(null);
  const [umbenennen, setUmbenennen] = useState<{ id: string; text: string } | null>(null);
  useEffect(() => {
    if (!menue) return;
    const zu = () => setMenue(null);
    window.addEventListener("mousedown", zu);
    return () => window.removeEventListener("mousedown", zu);
  }, [menue]);

  async function namenSpeichern() {
    if (!umbenennen) return;
    const u = umbenennen;
    setUmbenennen(null);
    await wechseln(() => agent.renameChat(u.id, u.text));
  }

  const angeheftet = gefunden.filter((s) => s.pinned);
  const uebrige = gefunden.filter((s) => !s.pinned);

  const zeile = (s: StoredSession) => (
    <div key={s.id} className={`sitzung${s.id === snap.sessionId ? " aktiv" : ""}${menue === s.id ? " menue-offen" : ""}`}>
      {umbenennen?.id === s.id ? (
        <input
          className="sitzung-name-feld"
          autoFocus
          value={umbenennen.text}
          aria-label={t("Neuer Name")}
          onChange={(e) => setUmbenennen({ id: s.id, text: e.target.value })}
          onBlur={() => void namenSpeichern()}
          onKeyDown={(e) => {
            if (e.key === "Enter") void namenSpeichern();
            if (e.key === "Escape") setUmbenennen(null);
          }}
        />
      ) : (
        <button
          className="sitzung-oeffnen"
          title={`${s.title}${s.originalTitle ? `\n(jichi: ${s.originalTitle})` : ""}\n${s.workspace ?? ""}\n${relativeTime(s.modified)}`}
          disabled={!snap.canSwitch && s.id !== snap.sessionId}
          onClick={() => s.id !== snap.sessionId && void wechseln(() => agent.loadSession(s.id))}
          onDoubleClick={() => setUmbenennen({ id: s.id, text: s.title })}
        >
          {s.pinned && <Pin size={11} className="sitzung-pin" />}
          <span>{s.title}</span>
        </button>
      )}
      <button
        className="sitzung-mehr"
        aria-label={t("Aktionen für {titel}", { titel: s.title })}
        aria-haspopup="menu"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => setMenue((m) => (m === s.id ? null : s.id))}
      >
        <MoreHorizontal size={14} />
      </button>
      {menue === s.id && (
        <div className="menue sitzung-menue" role="menu" onMouseDown={(e) => e.stopPropagation()}>
          <button type="button" role="menuitem" className="menue-punkt" onClick={() => { setMenue(null); setUmbenennen({ id: s.id, text: s.title }); }}>
            <span className="menue-icon"><Pencil size={14} /></span><span className="menue-titel">{t("Umbenennen")}</span>
          </button>
          <button type="button" role="menuitem" className="menue-punkt" onClick={() => { setMenue(null); void wechseln(() => agent.pinChat(s.id, !s.pinned)); }}>
            <span className="menue-icon">{s.pinned ? <PinOff size={14} /> : <Pin size={14} />}</span>
            <span className="menue-titel">{s.pinned ? t("Lösen") : t("Anheften")}</span>
          </button>
          <button type="button" role="menuitem" className="menue-punkt gefahr" disabled={!snap.canSwitch}
            onClick={() => { setMenue(null); setLoeschfehler(null); setZuLoeschen(s); }}>
            <span className="menue-icon"><Trash2 size={14} /></span><span className="menue-titel">{t("Löschen")}</span>
          </button>
        </div>
      )}
    </div>
  );

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
            placeholder={t("Chats durchsuchen")}
            aria-label={t("Chats nach Titel und Inhalt durchsuchen")}
          />
        </div>

        <button className="zeile" disabled={!snap.canSwitch} onClick={() => void wechseln(() => agent.newSession())}>
          <Plus size={14} />
          <span>{t("Neuer Chat")}</span>
          <kbd>{kurz("N")}</kbd>
        </button>

        {wechselFehler && <div className="leer-hinweis fehler" role="alert">{wechselFehler}</div>}
        {angeheftet.length > 0 && <div className="gruppe">{t("Angeheftet")}</div>}
        {angeheftet.map(zeile)}
        <div className="gruppe">{suche.trim() ? t("Treffer im Titel") : t("Sitzungen")}</div>
        {uebrige.length === 0 ? (
          <div className="leer-hinweis">
            {snap.sessions.length ? (suche.trim() ? t("Kein Titel passt") : t("Alle angeheftet")) : t("Noch keine Sitzung")}
          </div>
        ) : (
          uebrige.map(zeile)
        )}
        {imInhalt.length > 0 && (
          <>
            <div className="gruppe">{t("Im Inhalt")}</div>
            {imInhalt.map((h) => {
              const s = snap.sessions.find((x) => x.id === h.id);
              return (
                <button key={h.id} className="treffer" disabled={!snap.canSwitch && h.id !== snap.sessionId}
                  onClick={() => h.id !== snap.sessionId && void wechseln(() => agent.loadSession(h.id))}>
                  <span className="treffer-titel">{s?.title ?? t("Chat")}</span>
                  <span className="treffer-text">{h.snippet}</span>
                </button>
              );
            })}
          </>
        )}
      </div>

      <div className="seite-fuss">
        <button className="zeile" onClick={oeffneEinstellungen}>
          <Settings size={14} />
          <span>{t("Einstellungen")}</span>
        </button>
      </div>
      {zuLoeschen && (
        <div className="ueber" onMouseDown={(e) => {
          if (e.target === e.currentTarget && !loescht) setZuLoeschen(null);
        }}>
          <div className="tafel loesch-dialog" role="alertdialog" aria-modal="true"
            aria-labelledby="loesch-titel" aria-describedby="loesch-text">
            <h2 id="loesch-titel">{t("Chat löschen?")}</h2>
            <p id="loesch-text">{t("„{titel}“ wird dauerhaft aus deiner Chatliste entfernt.", { titel: zuLoeschen.title })}</p>
            {loeschfehler && <p className="hinweis fehler" role="alert">{loeschfehler}</p>}
            <div className="tafel-fuss">
              <button ref={abbrechen} className="knopf" disabled={loescht} onClick={() => setZuLoeschen(null)}>{t("Abbrechen")}</button>
              <button className="knopf gefahr" disabled={loescht} onClick={() => void loeschen()}>
                {loescht ? t("Löscht …") : t("Chat löschen")}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
