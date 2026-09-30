/**
 * Ein Projekt für jichi einrichten — mit `jichi init`, nicht mit eigenen Vorlagen.
 *
 * Die Packs, ihre Beschreibung und was sie schreiben kommen von jichi. Erst
 * zeigt die Vorschau (`--dry-run`), was entstehen würde; eingerichtet wird nur
 * genau diese Auswahl. Vorhandene Dateien lässt jichi stehen („bleibt“).
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import { BookOpen, FilePlus2, FileCheck2, FilePen, X } from "lucide-react";

import { agent, shortPath, t, type InitErgebnis, type InitPack, type Snapshot } from "../core/index.ts";
import { panel } from "./panel/store.ts";
import { nachricht, useSprache } from "./util.ts";

let offen = false;
const hoerer = new Set<() => void>();
const setOffen = (o: boolean) => {
  offen = o;
  hoerer.forEach((f) => f());
};
/** Den Dialog öffnen — aus dem Menü „+“ oder der leeren Seite. */
export const projektEinrichten = () => setOffen(true);

export function ProjektEinrichten({ snap }: { snap: Snapshot }) {
  const ist = useSyncExternalStore((f) => (hoerer.add(f), () => hoerer.delete(f)), () => offen);
  if (!ist) return null;
  return <Dialog snap={snap} schliessen={() => setOffen(false)} />;
}

function Dialog({ snap, schliessen }: { snap: Snapshot; schliessen: () => void }) {
  useSprache();
  const [packs, setPacks] = useState<InitPack[] | null>(null);
  const [wahl, setWahl] = useState<string[]>(["default"]);
  const [vorschau, setVorschau] = useState<{ fuer: string; e: InitErgebnis } | null>(null);
  const [fertig, setFertig] = useState<InitErgebnis | null>(null);
  const [arbeitet, setArbeitet] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const schluessel = wahl.join(" ");

  useEffect(() => {
    void agent.initPacks().then(setPacks, (e) => setFehler(nachricht(e)));
  }, []);

  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === "Escape" && !arbeitet && schliessen();
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [arbeitet, schliessen]);

  const umschalten = (name: string) =>
    setWahl((w) => (w.includes(name) ? w.filter((x) => x !== name) : [...w, name]));

  async function probe() {
    setArbeitet(true);
    setFehler(null);
    try {
      setVorschau({ fuer: schluessel, e: await agent.initVorschau(wahl) });
    } catch (e) {
      setFehler(nachricht(e));
    } finally {
      setArbeitet(false);
    }
  }

  async function anwenden() {
    setArbeitet(true);
    setFehler(null);
    try {
      const e = await agent.initAnwenden(wahl);
      if (e.ok) setFertig(e);
      else setFehler(e.meldung);
    } catch (e) {
      setFehler(nachricht(e));
    } finally {
      setArbeitet(false);
    }
  }

  const aktuell = vorschau?.fuer === schluessel ? vorschau.e : null;
  const zahl = (e: InitErgebnis, art: string) => e.dateien.filter((d) => d.art === art).length;

  return (
    <div className="ueber" onMouseDown={(e) => e.target === e.currentTarget && !arbeitet && schliessen()}>
      <div className="tafel einrichten-tafel" role="dialog" aria-modal="true" aria-labelledby="einrichten-titel">
        <div className="tasten-kopf">
          <h2 id="einrichten-titel">{t("Projekt für jichi einrichten")}</h2>
          <button type="button" className="knopf-klein knopf-symbol" aria-label={t("Schließen")} disabled={arbeitet} onClick={schliessen}><X size={14} /></button>
        </div>
        <p className="abschnitt-text">
          {t("jichi legt Agenten, Skills, Befehle und eine AGENTS.md in {ort} an — mit", { ort: shortPath(snap.cwd, 40) })} <code>jichi init</code>.{" "}
          {t("Vorhandene Dateien bleiben unberührt.")}{" "}
          <button type="button" className="link-knopf" onClick={() => panel.doku("SCAFFOLDING.md")}>
            <BookOpen size={12} /> {t("Was die Packs tun")}
          </button>
        </p>

        {fertig ? (
          <div className="einrichten-fertig" role="status">
            <FileCheck2 size={18} />
            <div>
              <strong>{t("Eingerichtet.")}</strong>{" "}
              {t("{neu} Dateien neu, {bleibt} unverändert. jichi liest sie beim nächsten Start der Sitzung — er startet dafür neu.", { neu: zahl(fertig, "neu"), bleibt: zahl(fertig, "bleibt") })}
            </div>
          </div>
        ) : (
          <>
            <div className="einrichten-packs" role="group" aria-label={t("Packs")}>
              {!packs && !fehler && <p className="abschnitt-text">{t("Frage jichi nach seinen Packs …")}</p>}
              {packs?.map((p) => (
                <label key={p.name} className={wahl.includes(p.name) ? "gewaehlt" : ""}>
                  <input type="checkbox" checked={wahl.includes(p.name)} onChange={() => umschalten(p.name)} disabled={arbeitet} />
                  <code>{p.name}</code>
                  <span>{p.text}</span>
                </label>
              ))}
            </div>

            {aktuell && (
              <div className="einrichten-vorschau">
                <div className="einrichten-summe">
                  <span><FilePlus2 size={12} /> {t("{n} neu", { n: zahl(aktuell, "neu") })}</span>
                  <span><FileCheck2 size={12} /> {t("{n} bleiben", { n: zahl(aktuell, "bleibt") })}</span>
                  {zahl(aktuell, "ueberschrieben") > 0 && <span className="warnung"><FilePen size={12} /> {t("{n} überschrieben", { n: zahl(aktuell, "ueberschrieben") })}</span>}
                </div>
                <ul>
                  {aktuell.dateien.map((d) => (
                    <li key={d.pfad} className={d.art}><span>{d.art === "neu" ? "+" : d.art === "bleibt" ? "=" : "~"}</span><code>{d.pfad}</code></li>
                  ))}
                </ul>
                {!aktuell.ok && <p className="zugang-fehler">{aktuell.meldung}</p>}
              </div>
            )}
          </>
        )}

        {fehler && <p className="zugang-fehler" role="alert">{fehler}</p>}

        <div className="tafel-fuss">
          {fertig ? (
            <button type="button" className="knopf haupt" onClick={schliessen}>{t("Fertig")}</button>
          ) : (
            <>
              <button type="button" className="knopf" disabled={arbeitet || !wahl.length || !snap.hasProject} onClick={() => void probe()}>
                {t("Vorschau")}
              </button>
              <button type="button" className="knopf haupt" disabled={arbeitet || !aktuell?.ok || !snap.canSwitch}
                title={aktuell ? undefined : t("Erst die Vorschau ansehen")} onClick={() => void anwenden()}>
                {arbeitet ? t("Arbeitet …") : t("Einrichten")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
