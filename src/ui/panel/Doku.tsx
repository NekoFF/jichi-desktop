/**
 * jichis Dokumentation in der Seitenleiste.
 *
 * Die Übersicht folgt jichis eigener Karte (`docs/README.md`), eine Seite wird
 * wie eine Antwort gezeichnet, Verweise zwischen Seiten bleiben hier. Dazu die
 * Frage, ob jichi dieselbe Dokumentation beim Antworten nachschlagen darf
 * (`search_docs`) — denn gezeigt und gefragt werden soll dasselbe.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, BookOpen, FolderOpen, Home, MessageSquarePlus, Search, X } from "lucide-react";

import {
  agent,
  dokuKarte,
  dokuTitel,
  dokuVerweis,
  t,
  type DokuAbschnitt,
  type DokuStatus,
  type DokuTreffer,
  type Snapshot,
} from "../../core/index.ts";
import { Markdown, anker } from "../Markdown.tsx";
import { nachricht, useSprache } from "../util.ts";
import { panel, zurEingabe, type PanelTab } from "./store.ts";

type Tab = Extract<PanelTab, { kind: "doku" }>;

export function DokuFenster({ tab, snap }: { tab: Tab; snap: Snapshot }) {
  useSprache();
  const [status, setStatus] = useState<DokuStatus | null>(null);
  const [karte, setKarte] = useState<DokuAbschnitt[]>([]);
  const [alle, setAlle] = useState<string[]>([]);
  const [text, setText] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [verlauf, setVerlauf] = useState<string[]>([]);
  const [suche, setSuche] = useState("");
  const [treffer, setTreffer] = useState<DokuTreffer[] | null>(null);
  const [schaltet, setSchaltet] = useState(false);
  const blatt = useRef<HTMLDivElement>(null);
  const seite = tab.seite || null;

  const laden = useCallback(async () => {
    setFehler(null);
    try {
      const s = await agent.dokuStatus();
      setStatus(s);
      if (s.ort) {
        const [readme, liste] = await Promise.all([agent.dokuLesen("README.md"), agent.dokuListe()]);
        setKarte(dokuKarte(readme));
        setAlle(liste);
      }
    } catch (e) {
      setFehler(nachricht(e));
    }
  }, []);

  useEffect(() => {
    void laden();
  }, [laden]);

  // Die Seite laden, wenn sie wechselt; ein Ordner ohne README wird zur Liste.
  useEffect(() => {
    if (!seite || !status?.ort) {
      setText(null);
      return;
    }
    let weg = false;
    setText(null);
    setFehler(null);
    agent.dokuLesen(seite).then(
      (t0) => !weg && setText(t0),
      (e) => !weg && (seite.endsWith("/README.md") ? setText("") : setFehler(nachricht(e))),
    );
    return () => {
      weg = true;
    };
  }, [seite, status?.ort]);

  // Zum Anker springen, sobald die Seite gezeichnet ist.
  useEffect(() => {
    if (text === null) return;
    const el = tab.anker ? document.getElementById(anker(tab.anker)) : null;
    // Mit ?.(): nicht jede Umgebung kennt beides (jsdom in den Prüfungen nicht).
    if (el) el.scrollIntoView?.({ block: "start" });
    else blatt.current?.scrollTo?.({ top: 0 });
  }, [text, tab.anker]);

  function oeffnen(neu: string, ank: string | null = null) {
    if (seite) setVerlauf((v) => [...v, seite]);
    setTreffer(null);
    panel.update(tab.id, { seite: neu, anker: ank ?? undefined } as Partial<PanelTab>);
  }

  function zurueck() {
    const v = [...verlauf];
    const vorher = v.pop();
    setVerlauf(v);
    panel.update(tab.id, { seite: vorher, anker: undefined } as Partial<PanelTab>);
  }

  const verweis = useCallback(
    (href: string) => {
      const ziel = dokuVerweis(seite ?? "README.md", href);
      if (ziel) oeffnen(ziel.seite, ziel.anker);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seite, tab.id],
  );

  async function suchen(e: React.FormEvent) {
    e.preventDefault();
    if (!suche.trim()) return setTreffer(null);
    try {
      setTreffer(await agent.dokuSuchen(suche));
    } catch (err) {
      setFehler(nachricht(err));
    }
  }

  async function fuerJichi(an: boolean) {
    setSchaltet(true);
    setFehler(null);
    try {
      setStatus(await agent.dokuFuerAgent(an));
    } catch (e) {
      setFehler(nachricht(e));
    } finally {
      setSchaltet(false);
    }
  }

  if (!status) {
    return <div className="panel-leer">{fehler ? <p role="alert">{fehler}</p> : <p>{t("Suche die Dokumentation von jichi …")}</p>}</div>;
  }

  if (!status.ort) {
    return (
      <div className="panel-leer">
        <BookOpen size={22} />
        <p>
          {t("Die Dokumentation von jichi liegt nicht neben dem Programm. jichi bringt sie nicht mit der Installation mit — sie steht im Quellbaum, im Ordner docs/.")}
        </p>
        {fehler && <p className="zugang-fehler" role="alert">{fehler}</p>}
        <button type="button" className="knopf" onClick={() => void agent.dokuOrdnerWaehlen().then((s) => s && laden(), (e) => setFehler(nachricht(e)))}>
          <FolderOpen size={14} /> {t("Ordner wählen …")}
        </button>
      </div>
    );
  }

  const titel = seite ? (text ? dokuTitel(text, seite) : seite) : t("Dokumentation");
  const ordner = seite?.endsWith("/README.md") && text === "" ? seite.replace(/README\.md$/, "") : null;

  return (
    <div className="doku">
      <div className="panel-werkzeuge">
        <button type="button" className="knopf-klein knopf-symbol" disabled={!verlauf.length} onClick={zurueck} aria-label={t("Zurück")} title={t("Zurück")}>
          <ArrowLeft size={13} />
        </button>
        <button type="button" className="knopf-klein knopf-symbol" disabled={!seite && !treffer} onClick={() => { setTreffer(null); if (seite) oeffnen(""); }} aria-label={t("Übersicht")} title={t("Übersicht")}>
          <Home size={13} />
        </button>
        <form className="doku-suche" onSubmit={(e) => void suchen(e)} role="search">
          <Search size={12} />
          <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder={t("In der Dokumentation suchen")} aria-label={t("In der Dokumentation suchen")} spellCheck={false} />
          {suche && (
            <button type="button" aria-label={t("Suche leeren")} onClick={() => { setSuche(""); setTreffer(null); }}><X size={11} /></button>
          )}
        </form>
        {seite && text && (
          <button type="button" className="knopf-klein knopf-symbol" disabled={!snap.canSend}
            title={t("Frage zu dieser Seite an jichi")} aria-label={t("Frage zu dieser Seite an jichi")}
            onClick={() => zurEingabe.send({ text: t("Zur jichi-Dokumentation, Seite „{titel}“ (docs/{seite}): ", { titel, seite }) })}>
            <MessageSquarePlus size={13} />
          </button>
        )}
      </div>

      <div className="doku-inhalt" ref={blatt}>
        {fehler && <p className="zugang-fehler doku-fehler" role="alert">{fehler}</p>}

        {treffer ? (
          <div className="doku-treffer">
            <div className="doku-kopf">{treffer.length ? t("{n} Treffer", { n: treffer.length }) : t("Nichts gefunden.")}</div>
            {treffer.map((h) => (
              <button key={`${h.datei}:${h.zeile}`} type="button" className="doku-treffer-zeile" onClick={() => oeffnen(h.datei)}>
                <span className="doku-treffer-datei">{h.datei}<span>:{h.zeile}</span></span>
                <span className="doku-treffer-text">{h.text}</span>
              </button>
            ))}
          </div>
        ) : !seite ? (
          <Uebersicht status={status} karte={karte} oeffnen={oeffnen} fuerJichi={(an) => void fuerJichi(an)} schaltet={schaltet} busy={!snap.canSwitch} />
        ) : ordner !== null ? (
          <div className="doku-treffer">
            <div className="doku-kopf">{ordner}</div>
            {alle.filter((d) => d.startsWith(ordner) && !d.slice(ordner.length).includes("/")).map((d) => (
              <button key={d} type="button" className="doku-treffer-zeile" onClick={() => oeffnen(d)}>
                <span className="doku-treffer-datei">{d.slice(ordner.length)}</span>
              </button>
            ))}
          </div>
        ) : text === null ? null : (
          <div className="dokument-blatt doku-blatt">
            <div className="doku-pfad">docs/{seite}</div>
            <Markdown text={text} verweis={verweis} />
          </div>
        )}
      </div>
    </div>
  );
}

function Uebersicht({ status, karte, oeffnen, fuerJichi, schaltet, busy }: {
  status: DokuStatus;
  karte: DokuAbschnitt[];
  oeffnen: (seite: string) => void;
  fuerJichi: (an: boolean) => void;
  schaltet: boolean;
  busy: boolean;
}) {
  const q = status.quelle;
  return (
    <div className="doku-uebersicht">
      <div className="doku-herkunft">
        <div>
          <strong>{t("{n} Seiten", { n: status.seiten })}</strong>
          <code title={status.ort!.root}>{status.ort!.root}</code>
          {status.ort!.commit && <span className="doku-commit">{t("Stand {commit}", { commit: status.ort!.commit })}</span>}
        </div>
        <label className="doku-schalter">
          <span>
            <strong>{t("jichi schlägt hier nach")}</strong>
            <small>
              {q.eingetragen && !q.aktuell
                ? t("Eingetragen, zeigt aber auf einen anderen Ordner — neu eintragen.")
                : !q.embedModell
                  ? t("Braucht ein Modell mit der Rolle „embed“ in der Konfiguration, sonst bietet jichi search_docs nicht an.")
                  : t("Als Quelle „jichi“ für search_docs in ~/.jichi (mit Sicherung). jichi startet dafür neu.")}
            </small>
          </span>
          <span className="schalter">
            <input type="checkbox" checked={q.eingetragen && q.aktuell} disabled={schaltet || busy} onChange={(e) => fuerJichi(e.target.checked)} />
            <span />
          </span>
        </label>
        {status.problem && <p className="zugang-fehler">{status.problem}</p>}
      </div>
      {karte.map((a) => (
        <section key={a.titel} className="doku-abschnitt">
          <h3>{a.titel}</h3>
          {a.text && <p>{a.text}</p>}
          <ul>
            {a.seiten.map((s) => (
              <li key={s.datei}>
                <button type="button" onClick={() => oeffnen(s.datei.endsWith("/") ? `${s.datei}README.md` : s.datei)}>
                  <span className="doku-name">{s.datei.replace(/\.md$/, "")}</span>
                  <span className="doku-titel">{s.titel}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
