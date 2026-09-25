/**
 * Die Datei, die ein Werkzeug hinterlassen hat — zum Öffnen, Zeigen, Speichern.
 *
 * Ohne sie endet „Mach mir ein PDF“ mit einem Satz, *wo* es liegt; man
 * müsste den Ordner selbst suchen. Mit ihr ist das Ergebnis ein Klick entfernt.
 */

import { useEffect, useState } from "react";
import { Download, ExternalLink, File, FileImage, FileSpreadsheet, FileText, FolderSearch } from "lucide-react";

import { agent, type FileInfo } from "../core/index.ts";
import { panel } from "./panel/store.ts";

const ART: Record<string, string> = {
  pdf: "PDF", docx: "Word", doc: "Word", xlsx: "Excel", xls: "Excel", ods: "Tabelle", odt: "Text",
  pptx: "PowerPoint", csv: "CSV", md: "Markdown", txt: "Text", json: "JSON", png: "Bild",
  jpg: "Bild", jpeg: "Bild", svg: "Bild", webp: "Bild", gif: "Bild",
};

function endung(name: string): string {
  return /\.([^.]+)$/.exec(name)?.[1]?.toLowerCase() ?? "";
}

function Symbol({ name }: { name: string }) {
  const e = endung(name);
  if (["xlsx", "xls", "ods", "csv"].includes(e)) return <FileSpreadsheet size={18} />;
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(e)) return <FileImage size={18} />;
  if (["pdf", "docx", "doc", "odt", "md", "txt", "pptx"].includes(e)) return <FileText size={18} />;
  return <File size={18} />;
}

function groesse(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`;
  return `${Math.round(bytes / 104857.6) / 10} MB`;
}

export function Dateikarte({ path, version }: { path: string; version: string }) {
  const [info, setInfo] = useState<FileInfo | null>(null);
  const [fehlt, setFehlt] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);

  useEffect(() => {
    let aktuell = true;
    agent
      .fileInfo(path)
      .then((i) => aktuell && (setInfo(i), setFehlt(false)))
      .catch(() => aktuell && setFehlt(true));
    return () => {
      aktuell = false;
    };
  }, [path, version]);

  async function tun(aktion: () => Promise<unknown>, erfolg?: string) {
    setMeldung(null);
    try {
      const r = await aktion();
      if (erfolg && r !== false) {
        setMeldung(erfolg);
        setTimeout(() => setMeldung(null), 2200);
      }
    } catch (ursache) {
      setMeldung(ursache instanceof Error ? ursache.message : String(ursache));
    }
  }

  if (fehlt) return <div className="dateikarte weg">{path} ist nicht mehr da.</div>;
  if (!info) return null;
  const art = ART[endung(info.name)] ?? endung(info.name).toUpperCase();

  return (
    <div className="dateikarte">
      <button
        type="button"
        className="dateikarte-haupt"
        onClick={() => panel.datei(path)}
        title={`${info.path} in der Seitenleiste ansehen`}
      >
        <span className={`dateikarte-symbol art-${endung(info.name)}`}>
          <Symbol name={info.name} />
        </span>
        <span className="dateikarte-text">
          <strong>{info.name}</strong>
          <span>
            {art} · {groesse(info.size)}
            {meldung && <em> · {meldung}</em>}
          </span>
        </span>
      </button>
      <div className="dateikarte-aktionen">
        {info.openable && (
          <button type="button" onClick={() => void tun(() => agent.openFile(path))} title="Mit dem Standardprogramm öffnen" aria-label="Extern öffnen">
            <ExternalLink size={15} />
          </button>
        )}
        <button type="button" onClick={() => void tun(() => agent.revealFile(path))} title="Im Ordner zeigen" aria-label="Im Ordner zeigen">
          <FolderSearch size={15} />
        </button>
        <button
          type="button"
          onClick={() => void tun(() => agent.saveFileAs(path, info.name), "gespeichert")}
          title="Kopie speichern unter …"
          aria-label="Kopie speichern unter"
        >
          <Download size={15} />
        </button>
      </div>
    </div>
  );
}
