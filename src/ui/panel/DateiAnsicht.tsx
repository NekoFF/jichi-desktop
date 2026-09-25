/**
 * Eine Datei in der Seitenleiste: ansehen, bearbeiten, an jichi geben.
 *
 * Was angezeigt wird, hängt von der Endung ab — Quelltext mit Hervorhebung,
 * Markdown und HTML als Vorschau oder Quelle, Bilder, PDF, Word als Dokument,
 * Tabellen als Tabelle. Ändert jichi die Datei, lädt die Ansicht nach; wer
 * gerade bearbeitet, bekommt stattdessen einen Hinweis und verliert nichts.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, FolderSearch, MessageSquareQuote, Paperclip, Pencil, RefreshCw, Save, X } from "lucide-react";

import { agent, type SheetPreview, type TextFile } from "../../core/index.ts";
import { Markdown } from "../Markdown.tsx";
import { Code } from "./Code.tsx";
import { PdfAnsicht } from "./Pdf.tsx";
import { zurEingabe } from "./store.ts";

type Art = "text" | "markdown" | "html" | "bild" | "svg" | "pdf" | "dokument" | "tabelle";

export function artVon(path: string): Art {
  const e = path.split(".").pop()?.toLowerCase() ?? "";
  if (["md", "markdown"].includes(e)) return "markdown";
  if (["html", "htm"].includes(e)) return "html";
  if (e === "svg") return "svg";
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico"].includes(e)) return "bild";
  if (e === "pdf") return "pdf";
  if (["docx", "pptx", "odt"].includes(e)) return "dokument";
  if (["xlsx", "xls", "xlsm", "ods", "csv", "tsv"].includes(e)) return "tabelle";
  return "text";
}

const BEARBEITBAR: Art[] = ["text", "markdown", "html", "svg"];
const MIT_VORSCHAU: Art[] = ["markdown", "html", "svg"];

function Tabellen({ blaetter }: { blaetter: SheetPreview[] }) {
  const [i, setI] = useState(0);
  const b = blaetter[Math.min(i, blaetter.length - 1)];
  if (!b) return <p className="panel-hinweis">Keine Tabelle.</p>;
  return (
    <div className="tabellen">
      {blaetter.length > 1 && (
        <div className="blatt-reiter" role="tablist">
          {blaetter.map((x, k) => (
            <button key={x.name} role="tab" aria-selected={k === i} className={k === i ? "gewaehlt" : ""} onClick={() => setI(k)}>
              {x.name}
            </button>
          ))}
        </div>
      )}
      <div className="tabelle-box">
        <table>
          <tbody>
            {b.rows.map((r, ri) => (
              <tr key={ri}>
                <th className="zeilen-nr">{ri + 1}</th>
                {r.map((c, ci) => (ri === 0 ? <th key={ci}>{c}</th> : <td key={ci}>{c}</td>))}
              </tr>
            ))}
          </tbody>
        </table>
        {b.truncated && <p className="panel-hinweis">Nur die ersten 5 000 Zeilen.</p>}
      </div>
    </div>
  );
}

export function DateiAnsicht({ path, line, sichtbar }: { path: string; line?: number; sichtbar: boolean }) {
  const art = artVon(path);
  const [text, setText] = useState<TextFile | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [doc, setDoc] = useState<string | null>(null);
  const [blaetter, setBlaetter] = useState<SheetPreview[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [vorschau, setVorschau] = useState(true);
  const [entwurf, setEntwurf] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const [geaendert, setGeaendert] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [auswahl, setAuswahl] = useState("");
  const [version, setVersion] = useState(0);
  const stand = useRef<number | null>(null);
  const inhalt = useRef<HTMLDivElement>(null);

  const laden = useCallback(async () => {
    setFehler(null);
    try {
      const info = await agent.fileInfo(path);
      stand.current = info.modified;
      if (BEARBEITBAR.includes(art)) setText(await agent.readText(path));
      if (art === "bild" || art === "pdf" || art === "html" || art === "svg") setUrl(await agent.assetUrl(path));
      if (art === "dokument") setDoc(await agent.readDocumentPreview(path));
      if (art === "tabelle") setBlaetter(await agent.readSheets(path));
      setGeaendert(false);
      setVersion((v) => v + 1);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  }, [path, art]);

  useEffect(() => {
    setEntwurf(null);
    void laden();
  }, [laden]);

  // Hat jemand (jichi) die Datei geändert? Alle zwei Sekunden nachsehen, solange sie vorn liegt.
  useEffect(() => {
    if (!sichtbar) return;
    const t = setInterval(() => {
      void agent.fileInfo(path).then((i) => {
        if (stand.current !== null && i.modified !== stand.current) {
          if (entwurf !== null) setGeaendert(true);
          else void laden();
        }
      }, () => {});
    }, 2000);
    return () => clearInterval(t);
  }, [sichtbar, path, entwurf, laden]);

  function kurz(m: string) {
    setMeldung(m);
    setTimeout(() => setMeldung(null), 1800);
  }

  async function speichern() {
    if (entwurf === null || !text) return;
    setSpeichert(true);
    try {
      const modified = await agent.writeText(path, entwurf, text.modified);
      setText({ ...text, text: entwurf, modified });
      setEntwurf(null);
      const info = await agent.fileInfo(path);
      stand.current = info.modified;
      kurz("gespeichert");
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setSpeichert(false);
    }
  }

  // Markierung merken — für „Auswahl an jichi“.
  useEffect(() => {
    const f = () => {
      const s = window.getSelection();
      const node = s?.anchorNode;
      setAuswahl(s && node && inhalt.current?.contains(node) ? s.toString() : "");
    };
    document.addEventListener("selectionchange", f);
    return () => document.removeEventListener("selectionchange", f);
  }, []);

  function auswahlAnJichi() {
    const sel = (entwurf !== null ? feldAuswahl() : auswahl).trim();
    if (!sel) return;
    let wo = "";
    const quelle = entwurf ?? text?.text;
    const at = quelle ? quelle.indexOf(sel) : -1;
    if (quelle && at >= 0) {
      const von = quelle.slice(0, at).split("\n").length;
      const bis = von + sel.split("\n").length - 1;
      wo = von === bis ? ` (Zeile ${von})` : ` (Zeilen ${von}–${bis})`;
    }
    const zaun = sel.includes("```") ? "~~~" : "```";
    zurEingabe.send({ text: `In \`${path}\`${wo}:\n${zaun}\n${sel}\n${zaun}\n` });
  }

  const feldRef = useRef<HTMLTextAreaElement>(null);
  const feldAuswahl = () => {
    const el = feldRef.current;
    return el ? el.value.slice(el.selectionStart, el.selectionEnd) : "";
  };

  const bearbeitbar = BEARBEITBAR.includes(art) && text && !text.binary;
  const zeigtVorschau = MIT_VORSCHAU.includes(art) && vorschau && entwurf === null;

  return (
    <div className="datei-ansicht">
      <div className="panel-werkzeuge">
        <button type="button" className="datei-pfad" title="Pfad kopieren" onClick={() => void navigator.clipboard.writeText(path).then(() => kurz("Pfad kopiert"), () => {})}>
          {path}
        </button>
        {meldung && <span className="panel-meldung"><Check size={12} /> {meldung}</span>}
        <span className="luecke" />
        {MIT_VORSCHAU.includes(art) && entwurf === null && (
          <div className="umschalter" role="group" aria-label="Ansicht">
            <button type="button" className={vorschau ? "gewaehlt" : ""} onClick={() => setVorschau(true)}>Vorschau</button>
            <button type="button" className={!vorschau ? "gewaehlt" : ""} onClick={() => setVorschau(false)}>Quelltext</button>
          </div>
        )}
        {(auswahl || entwurf !== null) && (
          <button type="button" className="knopf-klein" onClick={auswahlAnJichi} title="Markierten Ausschnitt in die Nachricht übernehmen">
            <MessageSquareQuote size={13} /> An jichi
          </button>
        )}
        {entwurf === null ? (
          <>
            {bearbeitbar && (
              <button type="button" className="knopf-klein knopf-symbol" title="Bearbeiten" aria-label="Bearbeiten" onClick={() => { setEntwurf(text!.text); setVorschau(false); }}>
                <Pencil size={13} />
              </button>
            )}
            <button type="button" className="knopf-klein knopf-symbol" title="Als Kontext an die nächste Nachricht hängen" aria-label="Als Kontext anhängen" onClick={() => zurEingabe.send({ datei: path })}>
              <Paperclip size={13} />
            </button>
            <button type="button" className="knopf-klein knopf-symbol" title="Im Ordner zeigen" aria-label="Im Ordner zeigen" onClick={() => void agent.revealFile(path).catch(() => {})}>
              <FolderSearch size={13} />
            </button>
            <button type="button" className="knopf-klein knopf-symbol" title="Mit dem Standardprogramm öffnen" aria-label="Extern öffnen" onClick={() => void agent.openFile(path).catch((e: Error) => setFehler(e.message))}>
              <ExternalLink size={13} />
            </button>
            <button type="button" className="knopf-klein knopf-symbol" title="Neu laden" aria-label="Neu laden" onClick={() => void laden()}>
              <RefreshCw size={13} />
            </button>
          </>
        ) : (
          <>
            <button type="button" className="knopf-klein" onClick={() => { setEntwurf(null); setGeaendert(false); }}>
              <X size={13} /> Verwerfen
            </button>
            <button type="button" className="knopf-klein haupt-klein" disabled={speichert || entwurf === text?.text} onClick={() => void speichern()}>
              <Save size={13} /> {speichert ? "Speichert …" : "Speichern"}
            </button>
          </>
        )}
      </div>

      {geaendert && (
        <div className="panel-banner">
          Die Datei wurde geändert, während du bearbeitest.
          <button type="button" onClick={() => { setEntwurf(null); void laden(); }}>Neu laden (Entwurf verwerfen)</button>
        </div>
      )}
      {fehler && <p className="panel-fehler">{fehler}</p>}

      <div className="datei-inhalt" ref={inhalt}>
        {entwurf !== null ? (
          <textarea
            ref={feldRef}
            className="datei-editor"
            value={entwurf}
            spellCheck={false}
            onChange={(e) => setEntwurf(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "s") {
                e.preventDefault();
                void speichern();
              }
              if (e.key === "Tab") {
                e.preventDefault();
                const el = e.currentTarget;
                const { selectionStart: a, selectionEnd: b } = el;
                setEntwurf(el.value.slice(0, a) + "  " + el.value.slice(b));
                requestAnimationFrame(() => el.setSelectionRange(a + 2, a + 2));
              }
            }}
          />
        ) : art === "bild" ? (
          url && <div className="bild-box"><img src={url} alt={path} /></div>
        ) : art === "pdf" ? (
          url && <PdfAnsicht url={url} key={version} />
        ) : art === "dokument" ? (
          doc !== null && <div className="dokument-blatt"><Markdown text={doc} /></div>
        ) : art === "tabelle" ? (
          blaetter && <Tabellen blaetter={blaetter} />
        ) : zeigtVorschau && art === "markdown" ? (
          text && <div className="dokument-blatt"><Markdown text={text.text} /></div>
        ) : zeigtVorschau && (art === "html" || art === "svg") ? (
          url && (
            <iframe
              key={version}
              className="html-vorschau"
              src={url}
              title={path}
              // Ohne allow-same-origin: die Seite sieht weder die Anwendung noch Tauri.
              sandbox="allow-scripts allow-forms allow-modals"
            />
          )
        ) : text?.binary ? (
          <p className="panel-hinweis">Keine Textdatei. „Extern öffnen“ zeigt sie im passenden Programm.</p>
        ) : (
          text && <Code text={text.text} path={path} line={line} />
        )}
      </div>
    </div>
  );
}

export function KopierKnopf({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className="knopf-klein knopf-symbol" title="Kopieren" aria-label="Kopieren"
      onClick={() => void navigator.clipboard.writeText(text).then(() => { setOk(true); setTimeout(() => setOk(false), 1200); }, () => {})}>
      {ok ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}
