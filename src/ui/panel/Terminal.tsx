/**
 * Terminal in der Seitenleiste.
 *
 * Zwei Sorten: das eigene (eine echte Shell im Projektordner, über ein PTY)
 * und das eines Befehls von jichi (nur lesen, live, so wie jichi es sieht).
 */

import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { Plus, RotateCcw } from "lucide-react";

import { agent, t, type Snapshot } from "../../core/index.ts";
import { panel, type PanelTab } from "./store.ts";

// Ein Hörer für alle PTYs, verteilt nach Kennung.
const empfaenger = new Map<number, { data: (d: string) => void; exit: () => void }>();
let gebunden: Promise<unknown> | null = null;
function binden() {
  gebunden ??= agent.onPty(
    (id, d) => empfaenger.get(id)?.data(d),
    (id) => empfaenger.get(id)?.exit(),
  );
  return gebunden;
}

function farben() {
  const css = getComputedStyle(document.documentElement);
  const v = (n: string, f: string) => css.getPropertyValue(n).trim() || f;
  return {
    background: v("--color-code-surface", "#1e1e2e"),
    foreground: v("--color-on-code-surface", "#f1f5f9"),
    cursor: v("--color-code-accent", "#6ee7b7"),
    selectionBackground: "#3b82f655",
  };
}

function neuesXterm(nurLesen: boolean) {
  const css = getComputedStyle(document.documentElement);
  const term = new XTerm({
    fontFamily: css.getPropertyValue("--font-mono").trim() || "Menlo, monospace",
    fontSize: 12.5,
    lineHeight: 1.2,
    cursorBlink: !nurLesen,
    disableStdin: nurLesen,
    scrollback: 5000,
    theme: farben(),
    allowProposedApi: false,
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  // Adressen im Terminal öffnen im Browser der Seitenleiste.
  term.loadAddon(new WebLinksAddon((_e, url) => panel.browser(url)));
  return { term, fit };
}

function EigenesTerminal({ sichtbar }: { sichtbar: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [beendet, setBeendet] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [runde, setRunde] = useState(0);
  const fitRef = useRef<{ fit: FitAddon; term: XTerm; id: number | null } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const { term, fit } = neuesXterm(false);
    term.open(el);
    const zustand = { fit, term, id: null as number | null };
    fitRef.current = zustand;
    let aus = false;
    setBeendet(false);
    setFehler(null);
    try { fit.fit(); } catch { /* noch unsichtbar */ }
    void binden().then(() =>
      agent.ptyOpen(term.cols || 80, term.rows || 24).then((id) => {
        if (aus) return void agent.ptyClose(id);
        zustand.id = id;
        empfaenger.set(id, { data: (d) => term.write(d), exit: () => setBeendet(true) });
        term.onData((d) => void agent.ptyWrite(id, d).catch(() => {}));
        term.onResize(({ cols, rows }) => void agent.ptyResize(id, cols, rows).catch(() => {}));
        term.focus();
      }, (e: Error) => setFehler(e.message)),
    );
    const beobachter = new ResizeObserver(() => { try { fit.fit(); } catch { /* */ } });
    beobachter.observe(el);
    return () => {
      aus = true;
      beobachter.disconnect();
      if (zustand.id !== null) {
        empfaenger.delete(zustand.id);
        void agent.ptyClose(zustand.id);
      }
      term.dispose();
    };
  }, [runde]);

  useEffect(() => {
    if (!sichtbar) return;
    requestAnimationFrame(() => {
      try { fitRef.current?.fit.fit(); } catch { /* */ }
      fitRef.current?.term.focus();
    });
  }, [sichtbar]);

  return (
    <div className="terminal-fenster">
      {fehler && <p className="panel-fehler">{fehler}</p>}
      <div className="xterm-box" ref={box} />
      {beendet && (
        <div className="terminal-ende-leiste">
          {t("Die Shell wurde beendet.")}
          <button type="button" className="knopf-klein" onClick={() => setRunde((r) => r + 1)}><RotateCcw size={12} /> {t("Neu starten")}</button>
        </div>
      )}
    </div>
  );
}

/** Ein Befehl von jichi, live mitgelesen. */
function AgentTerminal({ id, snap }: { id: string; snap: Snapshot }) {
  const box = useRef<HTMLDivElement>(null);
  const x = useRef<{ term: XTerm; fit: FitAddon; geschrieben: number } | null>(null);
  const view = snap.terminals[id];

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const { term, fit } = neuesXterm(true);
    term.open(el);
    x.current = { term, fit, geschrieben: 0 };
    try { fit.fit(); } catch { /* */ }
    const b = new ResizeObserver(() => { try { fit.fit(); } catch { /* */ } });
    b.observe(el);
    return () => {
      b.disconnect();
      term.dispose();
    };
  }, [id]);

  useEffect(() => {
    const z = x.current;
    if (!z || !view) return;
    // Nur das Neue schreiben; bei gekürzter Ausgabe von vorn.
    if (view.output.length < z.geschrieben) {
      z.term.reset();
      z.geschrieben = 0;
    }
    const neu = view.output.slice(z.geschrieben).replace(/\r?\n/g, "\r\n");
    if (neu) z.term.write(neu);
    z.geschrieben = view.output.length;
  }, [view]);

  const ende = view?.exit;
  return (
    <div className="terminal-fenster">
      <div className="xterm-box" ref={box} />
      <div className="terminal-ende-leiste">
        {!view ? t("Dieser Befehl ist nicht mehr da.") : !ende ? t("jichi führt den Befehl aus …") : ende.exitCode === 0 ? t("beendet") : t("beendet mit Code {code}", { code: ende.exitCode ?? "?" })}
      </div>
    </div>
  );
}

export function TerminalFenster({ tab, snap, sichtbar }: { tab: Extract<PanelTab, { kind: "terminal" }>; snap: Snapshot; sichtbar: boolean }) {
  if (!snap.hasProject && !tab.agentTerminal) {
    return <div className="panel-leer"><p>{t("Öffne zuerst ein Projekt — das Terminal startet dort.")}</p></div>;
  }
  return (
    <div className="terminal-wrap">
      {tab.agentTerminal ? <AgentTerminal id={tab.agentTerminal} snap={snap} /> : <EigenesTerminal sichtbar={sichtbar} />}
      {!tab.agentTerminal && (
        <button type="button" className="terminal-neu" title={t("Weiteres Terminal")} aria-label={t("Weiteres Terminal")} onClick={() => panel.terminal(undefined, true)}>
          <Plus size={13} />
        </button>
      )}
    </div>
  );
}
