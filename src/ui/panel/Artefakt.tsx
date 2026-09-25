/**
 * Ein Artefakt: ein Stück Code aus einer Antwort, lebendig — wie bei Claude.
 *
 * Reiter „Vorschau“ und „Code“. HTML, SVG, Mermaid und React laufen in einem
 * abgeschotteten iframe (eigenes Schema, strenge Richtlinie, kein Zugriff auf
 * die Anwendung); Markdown wird direkt gezeichnet.
 */

import { useEffect, useState } from "react";
import { Download, RotateCw } from "lucide-react";

import { agent } from "../../core/index.ts";
import { Markdown } from "../Markdown.tsx";
import { Code } from "./Code.tsx";
import { KopierKnopf } from "./DateiAnsicht.tsx";
import type { PanelTab } from "./store.ts";

const ENDUNG: Record<string, string> = { html: "html", svg: "svg", mermaid: "mmd", markdown: "md", md: "md", jsx: "jsx", tsx: "tsx", react: "jsx" };

export function ArtefaktFenster({ tab }: { tab: Extract<PanelTab, { kind: "artefakt" }> }) {
  const [ansicht, setAnsicht] = useState<"vorschau" | "code">("vorschau");
  const [url, setUrl] = useState<string | null>(null);
  const [runde, setRunde] = useState(0);
  const [meldung, setMeldung] = useState<string | null>(null);
  const md = tab.lang === "markdown" || tab.lang === "md";
  const id = tab.id.replace(/[^a-z0-9]/gi, "");

  useEffect(() => {
    if (md) return;
    void agent.artifactUrl(id, tab.lang, tab.title, tab.code).then(setUrl, () => setUrl(null));
  }, [id, tab.lang, tab.title, tab.code, md]);

  async function speichern() {
    const ext = ENDUNG[tab.lang] ?? "txt";
    const name = `${tab.title.replace(/[^\w\-äöüÄÖÜß ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "artefakt"}.${ext}`;
    try {
      // Nie eine vorhandene Datei überschreiben: -2, -3 … anhängen.
      let pfad = name;
      for (let n = 2; n < 100; n += 1) {
        const da = await agent.fileInfo(pfad).then(() => true, () => false);
        if (!da) break;
        pfad = name.replace(/(\.[^.]+)$/, `-${n}$1`);
      }
      await agent.writeText(pfad, tab.code, null);
      setMeldung(`als ${pfad} gespeichert`);
    } catch (e) {
      setMeldung(e instanceof Error ? e.message : String(e));
    }
    setTimeout(() => setMeldung(null), 2500);
  }

  return (
    <div className="artefakt">
      <div className="panel-werkzeuge">
        <div className="umschalter" role="group" aria-label="Ansicht">
          <button type="button" className={ansicht === "vorschau" ? "gewaehlt" : ""} onClick={() => setAnsicht("vorschau")}>Vorschau</button>
          <button type="button" className={ansicht === "code" ? "gewaehlt" : ""} onClick={() => setAnsicht("code")}>Code</button>
        </div>
        <span className="artefakt-titel">{tab.title}</span>
        {meldung && <span className="panel-meldung">{meldung}</span>}
        <span className="luecke" />
        {!md && ansicht === "vorschau" && (
          <button type="button" className="knopf-klein knopf-symbol" title="Neu starten" aria-label="Neu starten" onClick={() => setRunde((r) => r + 1)}><RotateCw size={13} /></button>
        )}
        <KopierKnopf text={tab.code} />
        <button type="button" className="knopf-klein knopf-symbol" title="Im Projekt speichern" aria-label="Im Projekt speichern" onClick={() => void speichern()}><Download size={13} /></button>
      </div>
      <div className="artefakt-inhalt">
        {ansicht === "code" ? (
          <Code text={tab.code} path={`artefakt.${ENDUNG[tab.lang] ?? tab.lang}`} />
        ) : md ? (
          <div className="dokument-blatt"><Markdown text={tab.code} /></div>
        ) : (
          url && (
            <iframe
              key={runde}
              className="html-vorschau"
              src={url}
              title={tab.title}
              sandbox="allow-scripts allow-modals allow-popups-to-escape-sandbox"
            />
          )
        )}
      </div>
    </div>
  );
}
