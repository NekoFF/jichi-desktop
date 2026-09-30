/** Das Menü des offenen Chats in der Kopfzeile: exportieren, Tastenkürzel. */

import { useEffect, useRef, useState } from "react";
import { BookOpen, FileDown, FileText, FileType2, Keyboard, MoreHorizontal } from "lucide-react";
import { panel } from "./panel/store.ts";

import { agent, t, type ExportFormat, type Snapshot } from "../core/index.ts";
import { nachricht } from "./util.ts";

export function ChatMenue({ snap, tasten }: { snap: Snapshot; tasten: () => void }) {
  const [offen, setOffen] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!offen) return;
    const zu = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOffen(false);
    document.addEventListener("mousedown", zu);
    return () => document.removeEventListener("mousedown", zu);
  }, [offen]);

  async function exportieren(f: ExportFormat) {
    setOffen(false);
    try {
      if (await agent.exportChat(f)) {
        setMeldung(t("exportiert"));
        setTimeout(() => setMeldung(null), 2000);
      }
    } catch (e) {
      setMeldung(nachricht(e));
      setTimeout(() => setMeldung(null), 4000);
    }
  }

  const leer = snap.transcript.length === 0;
  const punkt = (icon: React.ReactNode, titel: string, text: string, f: () => void, aus = false) => (
    <button type="button" role="menuitem" className="menue-punkt" disabled={aus} onClick={f}>
      <span className="menue-icon">{icon}</span>
      <span className="menue-titel">{titel}</span>
      <span className="menue-text">{text}</span>
    </button>
  );

  return (
    <div className="chat-menue" ref={box}>
      {meldung && <span className="panel-meldung">{meldung}</span>}
      <button type="button" className="knopf-klein knopf-symbol" aria-label={t("Chat-Menü")} aria-haspopup="menu" aria-expanded={offen} title={t("Mehr")} onClick={() => setOffen((o) => !o)}>
        <MoreHorizontal size={15} />
      </button>
      {offen && (
        <div className="menue chat-menue-liste" role="menu">
          <div className="menue-gruppe">{t("Chat exportieren")}</div>
          {punkt(<FileText size={15} />, "Markdown", ".md", () => void exportieren("md"), leer)}
          {punkt(<FileType2 size={15} />, "Word", ".docx", () => void exportieren("docx"), leer)}
          {punkt(<FileDown size={15} />, "PDF", ".pdf", () => void exportieren("pdf"), leer)}
          <div className="menue-gruppe">{t("Hilfe")}</div>
          {punkt(<BookOpen size={15} />, t("jichi-Dokumentation"), /Mac/i.test(navigator.userAgent) ? "⌘⇧H" : `${t("Strg")}+${t("Umschalt")}+H`, () => { setOffen(false); panel.doku(); })}
          {punkt(<Keyboard size={15} />, t("Tastenkürzel"), /Mac/i.test(navigator.userAgent) ? "⌘/" : `${t("Strg")}+/`, () => { setOffen(false); tasten(); })}
        </div>
      )}
    </div>
  );
}
