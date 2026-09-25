/**
 * Der Projektbaum. Ordner laden erst, wenn man sie aufklappt; die Suche
 * filtert, was schon geladen ist, und klappt dafür nichts Schweres auf.
 */

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, File, FileSpreadsheet, FileText, Folder, FolderOpen, Image, RefreshCw, Search } from "lucide-react";

import { agent, type DirEntry, type Snapshot } from "../../core/index.ts";
import { panel } from "./store.ts";

function Symbol({ e, offen }: { e: DirEntry; offen: boolean }) {
  if (e.dir) return offen ? <FolderOpen size={14} /> : <Folder size={14} />;
  const x = e.name.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(x)) return <Image size={14} />;
  if (["xlsx", "xls", "ods", "csv", "tsv"].includes(x)) return <FileSpreadsheet size={14} />;
  if (["md", "txt", "pdf", "docx", "odt", "pptx"].includes(x)) return <FileText size={14} />;
  return <File size={14} />;
}

export function Dateien({ snap }: { snap: Snapshot }) {
  const [kinder, setKinder] = useState<Record<string, DirEntry[]>>({});
  const [offen, setOffen] = useState<Set<string>>(new Set([""]));
  const [fehler, setFehler] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const laden = useCallback(async (pfad: string) => {
    try {
      const l = await agent.listDir(pfad);
      setKinder((k) => ({ ...k, [pfad]: l.entries }));
      setFehler(null);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Neues Projekt: von vorn.
  useEffect(() => {
    setKinder({});
    setOffen(new Set([""]));
    if (snap.hasProject) void laden("");
  }, [snap.cwd, snap.hasProject, laden]);

  // Nach jedem Zug (der Agent hat vielleicht Dateien angelegt) die offenen Ordner auffrischen.
  const zugEnde = snap.status === "ready";
  useEffect(() => {
    if (!zugEnde || !snap.hasProject) return;
    for (const p of offen) void laden(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zugEnde, snap.transcript.length]);

  function umschalten(e: DirEntry) {
    setOffen((o) => {
      const n = new Set(o);
      if (n.has(e.path)) n.delete(e.path);
      else {
        n.add(e.path);
        if (!kinder[e.path]) void laden(e.path);
      }
      return n;
    });
  }

  if (!snap.hasProject) {
    return (
      <div className="panel-leer">
        <p>Noch kein Projekt geöffnet.</p>
        <button type="button" className="knopf haupt" disabled={!snap.canSwitch} onClick={() => void agent.pickWorkspace().catch(() => {})}>
          Projekt öffnen
        </button>
      </div>
    );
  }

  const f = filter.trim().toLowerCase();
  const zeile = (e: DirEntry, tiefe: number): React.ReactNode => {
    const auf = offen.has(e.path);
    const passt = !f || e.name.toLowerCase().includes(f);
    const unter = e.dir && (auf || f) ? (kinder[e.path] ?? []).map((k) => zeile(k, tiefe + 1)) : [];
    const sichtbarUnter = unter.filter(Boolean);
    if (!passt && sichtbarUnter.length === 0) return null;
    return (
      <div key={e.path}>
        <button
          type="button"
          className={`baum-zeile${e.heavy ? " schwer" : ""}`}
          style={{ paddingLeft: 8 + tiefe * 14 }}
          title={e.path}
          onClick={() => (e.dir ? umschalten(e) : panel.datei(e.path))}
        >
          <span className="baum-pfeil">{e.dir ? auf ? <ChevronDown size={12} /> : <ChevronRight size={12} /> : null}</span>
          <Symbol e={e} offen={auf} />
          <span className="baum-name">{e.name}</span>
        </button>
        {sichtbarUnter}
      </div>
    );
  };

  return (
    <div className="dateien">
      <div className="dateien-kopf">
        <div className="dateien-suche">
          <Search size={13} />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Dateien filtern" aria-label="Dateien filtern" />
        </div>
        <button type="button" className="knopf-klein knopf-symbol" title="Neu laden" aria-label="Neu laden" onClick={() => { for (const p of offen) void laden(p); }}>
          <RefreshCw size={13} />
        </button>
      </div>
      {fehler && <p className="panel-fehler">{fehler}</p>}
      <div className="baum" role="tree">
        {(kinder[""] ?? []).map((e) => zeile(e, 0))}
        {kinder[""]?.length === 0 && <p className="panel-hinweis">Der Ordner ist leer.</p>}
      </div>
    </div>
  );
}
