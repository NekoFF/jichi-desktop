/**
 * „Änderungen“: was seit dem letzten Commit anders ist — Datei für Datei.
 *
 * Wie ein Review: links die Dateien, rechts der Unterschied. Ein Klick auf
 * eine Zeile öffnet einen Kommentar; „Kommentare senden“ schickt sie alle
 * gesammelt an jichi, der sie abarbeitet. Nach jedem Zug frischt sich die
 * Ansicht selbst auf.
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { FileCode2, GitBranch, MessageSquarePlus, RefreshCw, Send, ShieldCheck, X } from "lucide-react";

import { agent, t, type GitChange, type GitFileDiff, type GitState, type Snapshot } from "../../core/index.ts";
import { diffRows } from "../Diff.tsx";
import { panel } from "./store.ts";

interface Kommentar {
  path: string;
  line: number;
  seite: "alt" | "neu";
  code: string;
  text: string;
}

function statusText(s: GitChange["status"]): string {
  switch (s) {
    case "M":
      return t("geändert");
    case "D":
      return t("gelöscht");
    case "R":
      return t("umbenannt");
    default:
      return t("neu");
  }
}

function DateiDiff({
  path,
  diff,
  kommentare,
  setKommentare,
}: {
  path: string;
  diff: GitFileDiff;
  kommentare: Kommentar[];
  setKommentare: (f: (k: Kommentar[]) => Kommentar[]) => void;
}) {
  const [offen, setOffen] = useState<string | null>(null);
  const [entwurf, setEntwurf] = useState("");
  const { rows } = useMemo(() => diffRows(diff.before ?? "", diff.after ?? ""), [diff]);

  if (diff.binary) return <p className="panel-hinweis">{t("Binärdatei — kein Textvergleich.")}</p>;

  return (
    <div className="diff-zeilen gross" role="table" aria-label={t("Änderungen an {path}", { path })}>
      {rows.length === 0 && <div className="diff-leer">{t("keine Änderung")}</div>}
      {rows.map((z, i) => {
        if (z.art === "luecke") {
          return (
            <div key={i} className="diff-luecke">
              … {z.anzahl === 1 ? t("1 unveränderte Zeile") : t("{n} unveränderte Zeilen", { n: z.anzahl })}
            </div>
          );
        }
        const nr = z.neu ?? z.alt ?? 0;
        const seite = z.neu !== undefined ? "neu" : "alt";
        const schluessel = `${seite}:${nr}`;
        const hier = kommentare.filter((k) => k.path === path && k.line === nr && k.seite === seite);
        return (
          <Fragment key={i}>
            <div className={`diff-zeile ${z.art} kommentierbar`} role="row" onClick={() => { setOffen(schluessel); setEntwurf(""); }} title={t("Zeile kommentieren")}>
              <span className="nr">{z.alt ?? ""}</span>
              <span className="nr">{z.neu ?? ""}</span>
              <span className="zeichen">{z.art === "neu" ? "+" : z.art === "weg" ? "−" : " "}</span>
              <span className="text">{z.text || " "}</span>
              <span className="diff-plus"><MessageSquarePlus size={12} /></span>
            </div>
            {hier.map((k, j) => (
              <div key={`k${j}`} className="diff-kommentar">
                <span>{k.text}</span>
                <button type="button" aria-label={t("Kommentar entfernen")} onClick={(e) => { e.stopPropagation(); setKommentare((alt) => alt.filter((x) => x !== k)); }}>
                  <X size={11} />
                </button>
              </div>
            ))}
            {offen === schluessel && (
              <div className="diff-kommentar-feld" onClick={(e) => e.stopPropagation()}>
                <textarea
                  autoFocus
                  rows={2}
                  value={entwurf}
                  placeholder={t("Was soll jichi hier ändern? (Enter speichert)")}
                  onChange={(e) => setEntwurf(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setOffen(null);
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (entwurf.trim()) {
                        setKommentare((alt) => [...alt, { path, line: nr, seite, code: z.text, text: entwurf.trim() }]);
                      }
                      setOffen(null);
                    }
                  }}
                />
              </div>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

export function Aenderungen({ snap, sichtbar }: { snap: Snapshot; sichtbar: boolean }) {
  const [stand, setStand] = useState<GitState | null>(null);
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [diff, setDiff] = useState<GitFileDiff | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [kommentare, setKommentare] = useState<Kommentar[]>([]);

  const laden = useCallback(async () => {
    if (!snap.hasProject) return;
    try {
      const s = await agent.gitChanges();
      setStand(s);
      setFehler(null);
      setGewaehlt((g) => (g && s.files.some((f) => f.path === g) ? g : s.files[0]?.path ?? null));
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  }, [snap.hasProject]);

  // Beim Öffnen, bei neuem Projekt und nach jedem Werkzeug des Agenten.
  const werkzeuge = snap.transcript.filter((e) => e.kind === "tool" && e.status === "completed").length;
  useEffect(() => {
    if (sichtbar) void laden();
  }, [sichtbar, laden, snap.cwd, werkzeuge, snap.status]);

  useEffect(() => {
    if (!gewaehlt) return setDiff(null);
    let aktuell = true;
    agent.gitFileDiff(gewaehlt).then((d) => aktuell && setDiff(d), (e: Error) => aktuell && setFehler(e.message));
    return () => {
      aktuell = false;
    };
  }, [gewaehlt, stand]);

  function kommentareSenden() {
    const text =
      t("Bitte überarbeite diese Stellen in den aktuellen Änderungen:") + "\n\n" +
      kommentare
        .map((k) => `- \`${k.path}\` ${t("Zeile {n}", { n: k.line })}${k.seite === "alt" ? ` ${t("(entfernte Fassung)")}` : ""}: ${k.text}\n  > \`${k.code.trim().slice(0, 160)}\``)
        .join("\n");
    void agent.send(text).then(() => {}, () => {});
    setKommentare([]);
  }

  if (!snap.hasProject) return <div className="panel-leer"><p>{t("Noch kein Projekt geöffnet.")}</p></div>;
  if (stand && !stand.repo) {
    return (
      <div className="panel-leer">
        <p>{t("Dieser Ordner steht nicht unter git — ohne Versionsverwaltung gibt es keinen Vergleich.")}</p>
        <button type="button" className="knopf" disabled={!snap.canSend} onClick={() => void agent.send(t("Richte in diesem Projekt ein git-Repository ein (git init) mit einer sinnvollen .gitignore und einem ersten Commit.")).catch(() => {})}>
          {t("jichi git einrichten lassen")}
        </button>
      </div>
    );
  }

  const anzahl = stand?.files.length ?? 0;
  const summe = stand?.files.reduce((a, f) => [a[0] + f.additions, a[1] + f.deletions], [0, 0]) ?? [0, 0];

  return (
    <div className="aenderungen">
      <div className="panel-werkzeuge">
        {stand?.branch && <span className="git-zweig"><GitBranch size={12} /> {stand.branch}</span>}
        <span className="diff-zahl">
          {anzahl === 1 ? t("1 Datei") : t("{n} Dateien", { n: anzahl })} · <span className="plus">+{summe[0]}</span> <span className="minus">−{summe[1]}</span>
        </span>
        <span className="luecke" />
        {kommentare.length > 0 && (
          <button type="button" className="knopf-klein haupt-klein" disabled={!snap.canSend} onClick={kommentareSenden}>
            <Send size={12} /> {kommentare.length === 1 ? t("1 Kommentar senden") : t("{n} Kommentare senden", { n: kommentare.length })}
          </button>
        )}
        <button type="button" className="knopf-klein" disabled={!snap.canSend || !stand?.files.length}
          onClick={() => void agent.send(t("Prüfe die noch nicht committeten Änderungen (git diff) gründlich: Fehler, Sicherheitsprobleme, Randfälle, fehlende Tests. Nenne jeweils Datei und Zeile und schlage die Korrektur vor.")).catch(() => {})}>
          <ShieldCheck size={13} /> {t("Code prüfen lassen")}
        </button>
        <button type="button" className="knopf-klein knopf-symbol" aria-label={t("Neu laden")} title={t("Neu laden")} onClick={() => void laden()}>
          <RefreshCw size={13} />
        </button>
      </div>
      {fehler && <p className="panel-fehler">{fehler}</p>}
      {stand && stand.files.length === 0 ? (
        <div className="panel-leer"><p>{t("Keine Änderungen seit dem letzten Commit.")}</p></div>
      ) : (
        <div className="aenderungen-teilung">
          <div className="aenderungen-liste" role="listbox" aria-label={t("Geänderte Dateien")}>
            {stand?.files.map((f) => (
              <button key={f.path} type="button" role="option" aria-selected={f.path === gewaehlt}
                className={`aenderung${f.path === gewaehlt ? " gewaehlt" : ""}`} onClick={() => setGewaehlt(f.path)} title={`${f.path} — ${statusText(f.status)}`}>
                <span className={`aenderung-status s-${f.status === "?" ? "neu" : f.status}`}>{f.status === "?" ? "U" : f.status}</span>
                <span className="aenderung-name">{f.path.split("/").pop()}</span>
                <span className="aenderung-zahl"><span className="plus">+{f.additions}</span> <span className="minus">−{f.deletions}</span></span>
                {kommentare.some((k) => k.path === f.path) && <span className="aenderung-punkt" aria-label={t("hat Kommentare")} />}
              </button>
            ))}
          </div>
          <div className="aenderungen-diff">
            {gewaehlt && (
              <div className="aenderungen-diff-kopf">
                <span className="diff-pfad">{gewaehlt}</span>
                <button type="button" className="knopf-klein knopf-symbol" title={t("Datei öffnen")} aria-label={t("Datei öffnen")} onClick={() => panel.datei(gewaehlt)}>
                  <FileCode2 size={13} />
                </button>
              </div>
            )}
            {gewaehlt && diff && <DateiDiff path={gewaehlt} diff={diff} kommentare={kommentare} setKommentare={setKommentare} />}
          </div>
        </div>
      )}
    </div>
  );
}
