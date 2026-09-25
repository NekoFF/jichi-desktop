/**
 * Der Browser der Seitenleiste.
 *
 * Die Seite selbst ist eine eigene Webansicht des Systems (siehe
 * `src-tauri/src/browser.rs`); diese Komponente zeichnet nur die Leiste und
 * hält den Platz frei, über dem die Ansicht liegt — und meldet jede
 * Veränderung dieses Platzes. Liegt ein Dialog über allem, wird die Ansicht
 * verborgen: eine native Ansicht ließe sich sonst nicht überdecken.
 */

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ExternalLink, Globe, RotateCw } from "lucide-react";

import { agent, type BrowserState } from "../../core/index.ts";
import { panel, type PanelTab } from "./store.ts";

const hoerer = new Map<string, (s: BrowserState) => void>();
let gebunden: Promise<unknown> | null = null;
function binden() {
  gebunden ??= agent.onBrowser((s) => hoerer.get(s.id)?.(s));
  return gebunden;
}

const VORSCHLAEGE = ["localhost:5173", "localhost:3000", "localhost:8080", "uni-giessen.de"];

export function BrowserFenster({ tab, sichtbar }: { tab: Extract<PanelTab, { kind: "browser" }>; sichtbar: boolean }) {
  const platz = useRef<HTMLDivElement>(null);
  const [eingabe, setEingabe] = useState(tab.url);
  const [titel, setTitel] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const offen = useRef(false);
  const id = tab.id.replace(/[^a-z0-9]/gi, "");

  function rechteck() {
    const r = platz.current?.getBoundingClientRect();
    return r ? { x: r.left, y: r.top, w: r.width, h: r.height } : { x: 0, y: 0, w: 1, h: 1 };
  }

  useEffect(() => {
    void binden();
    hoerer.set(id, (s) => {
      if (s.url) {
        setEingabe(s.url === "about:blank" ? "" : s.url);
        panel.update(tab.id, { url: s.url });
      }
      if (s.title !== undefined && s.title !== null) setTitel(s.title);
      if (typeof s.loading === "boolean") setLaedt(s.loading);
    });
    return () => {
      hoerer.delete(id);
      offen.current = false;
      void agent.browserClose(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Eine Adresse (auch von aussen, etwa ein Link im Chat) laden.
  useEffect(() => {
    if (!tab.url) return;
    setFehler(null);
    const r = rechteck();
    const f = offen.current ? agent.browserNavigate(id, tab.url) : agent.browserOpen(id, tab.url, r);
    offen.current = true;
    f.then(() => agent.browserBounds(id, rechteck(), sichtbar), (e: Error) => setFehler(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.url]);

  // Platz und Sichtbarkeit nachführen.
  useEffect(() => {
    const el = platz.current;
    if (!el) return;
    const melde = () => offen.current && void agent.browserBounds(id, rechteck(), sichtbar).catch(() => {});
    melde();
    const b = new ResizeObserver(melde);
    b.observe(el);
    window.addEventListener("resize", melde);
    return () => {
      b.disconnect();
      window.removeEventListener("resize", melde);
    };
  }, [sichtbar, id]);

  function laden(url: string) {
    const u = url.trim();
    if (!u) return;
    panel.update(tab.id, { url: u });
  }

  return (
    <div className="browser">
      <div className="browser-leiste">
        <button type="button" className="knopf-klein knopf-symbol" aria-label="Zurück" disabled={!tab.url} onClick={() => void agent.browserGo(id, "back").catch(() => {})}><ArrowLeft size={14} /></button>
        <button type="button" className="knopf-klein knopf-symbol" aria-label="Vor" disabled={!tab.url} onClick={() => void agent.browserGo(id, "forward").catch(() => {})}><ArrowRight size={14} /></button>
        <button type="button" className="knopf-klein knopf-symbol" aria-label="Neu laden" disabled={!tab.url} onClick={() => void agent.browserGo(id, "reload").catch(() => {})}><RotateCw size={13} className={laedt ? "dreht" : ""} /></button>
        <form className="browser-adresse" onSubmit={(e) => { e.preventDefault(); laden(eingabe); }}>
          <Globe size={12} />
          <input value={eingabe} onChange={(e) => setEingabe(e.target.value)} placeholder="Adresse, z. B. localhost:5173" spellCheck={false} aria-label="Adresse" />
        </form>
        <button type="button" className="knopf-klein knopf-symbol" aria-label="Im System-Browser öffnen" title="Im System-Browser öffnen" disabled={!/^https?:/.test(tab.url)} onClick={() => void agent.openLink(tab.url).catch(() => {})}><ExternalLink size={13} /></button>
      </div>
      {titel && <div className="browser-titel" title={titel}>{titel}</div>}
      {fehler && <p className="panel-fehler">{fehler}</p>}
      <div className="browser-platz" ref={platz}>
        {!tab.url && (
          <div className="panel-leer">
            <p>Eine Adresse eingeben — etwa den Dev-Server deines Projekts.</p>
            <div className="browser-vorschlaege">
              {VORSCHLAEGE.map((v) => (
                <button key={v} type="button" className="knopf-klein" onClick={() => { setEingabe(v); laden(v); }}>{v}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
