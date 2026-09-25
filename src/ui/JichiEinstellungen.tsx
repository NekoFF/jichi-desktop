/**
 * jichis eigene Einstellungen in der Anwendung: dauerhafte Erlaubnisse und
 * MCP-Server. Beides steht in `~/.jichi`; geschrieben wird mit Sicherung, und
 * jichi startet danach neu (der offene Chat bleibt).
 */

import { useEffect, useState } from "react";
import { Plug, Plus, Stethoscope, Trash2, X } from "lucide-react";

import { agent, type McpServerEntry, type Permissions } from "../core/index.ts";
import { nachricht } from "./util.ts";

function Liste({ titel, text, werte, setWerte, ton }: {
  titel: string;
  text: string;
  werte: string[];
  setWerte: (w: string[]) => void;
  ton: "gut" | "schlecht";
}) {
  const [neu, setNeu] = useState("");
  const hinzu = () => {
    const n = neu.trim();
    if (n && !werte.includes(n)) setWerte([...werte, n]);
    setNeu("");
  };
  return (
    <div className="erlaubnis-liste">
      <div className="erlaubnis-kopf"><strong>{titel}</strong><span>{text}</span></div>
      <div className="erlaubnis-chips">
        {werte.map((w) => (
          <span key={w} className={`chip ${ton}`}>
            <code>{w}</code>
            <button type="button" aria-label={`${w} entfernen`} onClick={() => setWerte(werte.filter((x) => x !== w))}><X size={10} /></button>
          </span>
        ))}
        <input value={neu} onChange={(e) => setNeu(e.target.value)} placeholder="Werkzeug, z. B. edit_file"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); hinzu(); } }} onBlur={hinzu} spellCheck={false} />
      </div>
    </div>
  );
}

export function Erlaubnisse() {
  const [p, setP] = useState<Permissions | null>(null);
  const [allow, setAllow] = useState<string[]>([]);
  const [deny, setDeny] = useState<string[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);

  useEffect(() => {
    void agent.permissions().then((x) => { setP(x); setAllow(x.allow); setDeny(x.deny); }, (e: Error) => setFehler(e.message));
  }, []);

  const geaendert = p && (JSON.stringify(allow) !== JSON.stringify(p.allow) || JSON.stringify(deny) !== JSON.stringify(p.deny));

  async function speichern() {
    setFehler(null);
    try {
      const x = await agent.setPermissions(allow, deny);
      setP(x);
      setMeldung("gespeichert — gilt ab sofort");
      setTimeout(() => setMeldung(null), 2200);
    } catch (e) {
      setFehler(nachricht(e));
    }
  }

  return (
    <div className="abschnitt">
      <div className="abschnitt-kopf"><h3>Erlaubnisse</h3>{meldung && <span className="panel-meldung">{meldung}</span>}</div>
      <p className="abschnitt-text">
        Was jichi dauerhaft ohne Rückfrage darf — und was nie. „Nie“ gewinnt immer. „Immer erlauben“ in einer
        Rückfrage trägt ein Werkzeug hier ein. MCP-Werkzeuge heißen <code>server__werkzeug</code>.
      </p>
      {p?.allowAll && <p className="zugang-fehler">In der Konfiguration ist „alles erlauben“ (<code>*</code>) gesetzt — jichi fragt dann nie.</p>}
      {fehler && <p className="zugang-fehler" role="alert">{fehler}</p>}
      {p && (
        <>
          <Liste titel="Immer erlauben" text="ohne Rückfrage" werte={allow} setWerte={setAllow} ton="gut" />
          <Liste titel="Nie erlauben" text="wird dem Modell gar nicht angeboten" werte={deny} setWerte={setDeny} ton="schlecht" />
          {geaendert && (
            <div className="knopfreihe">
              <button type="button" className="knopf" onClick={() => { setAllow(p.allow); setDeny(p.deny); }}>Verwerfen</button>
              <button type="button" className="knopf haupt" onClick={() => void speichern()}>Speichern</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function McpServer() {
  const [liste, setListe] = useState<McpServerEntry[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [test, setTest] = useState<string | null>(null);
  const [prueft, setPrueft] = useState(false);
  const [neu, setNeu] = useState<{ name: string; command: string; args: string } | null>(null);

  useEffect(() => {
    void agent.mcpServers().then(setListe, (e: Error) => setFehler(e.message));
  }, []);

  async function tun(f: () => Promise<McpServerEntry[]>) {
    setFehler(null);
    try {
      setListe(await f());
    } catch (e) {
      setFehler(nachricht(e));
    }
  }

  async function pruefen() {
    setPrueft(true);
    setTest(null);
    try {
      setTest(await agent.mcpTest());
    } catch (e) {
      setTest(nachricht(e));
    } finally {
      setPrueft(false);
    }
  }

  return (
    <div className="abschnitt">
      <div className="abschnitt-kopf">
        <h3>MCP-Server</h3>
        <button type="button" className="knopf-klein" disabled={prueft} onClick={() => void pruefen()}>
          <Stethoscope size={13} /> {prueft ? "Verbindet …" : "Verbindung prüfen"}
        </button>
      </div>
      <p className="abschnitt-text">Programme, die jichi zusätzliche Werkzeuge geben — eine Datenbank, ein Ticketsystem. Ausgeschaltete bleiben eingetragen.</p>
      {fehler && <p className="zugang-fehler" role="alert">{fehler}</p>}
      {liste && liste.length === 0 && <p className="abschnitt-text">Noch keine Server eingetragen.</p>}
      {liste && liste.length > 0 && (
        <ul className="mcp-liste">
          {liste.map((m) => (
            <li key={m.name} className={m.disabled ? "aus" : ""}>
              <Plug size={14} />
              <div className="mcp-text">
                <strong>{m.name}{m.builtin && <span className="mcp-eigen">eingebaut: Dokumente</span>}</strong>
                <code>{m.url ?? [m.command, ...m.args].filter(Boolean).join(" ")}</code>
              </div>
              <label className="schalter" title={m.disabled ? "Einschalten" : "Ausschalten"}>
                <input type="checkbox" checked={!m.disabled} onChange={(e) => void tun(() => agent.mcpToggle(m.name, e.target.checked))} />
                <span />
              </label>
              {!m.builtin && (
                <button type="button" className="knopf-klein knopf-symbol" aria-label={`${m.name} entfernen`} title="Entfernen" onClick={() => void tun(() => agent.mcpRemove(m.name))}>
                  <Trash2 size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {neu ? (
        <div className="mcp-neu">
          <input placeholder="Name, z. B. datenbank" value={neu.name} onChange={(e) => setNeu({ ...neu, name: e.target.value })} spellCheck={false} />
          <input placeholder="Programm, z. B. npx oder python3" value={neu.command} onChange={(e) => setNeu({ ...neu, command: e.target.value })} spellCheck={false} />
          <input placeholder="Argumente, z. B. -y @modelcontextprotocol/server-filesystem ." value={neu.args} onChange={(e) => setNeu({ ...neu, args: e.target.value })} spellCheck={false} />
          <div className="knopfreihe">
            <button type="button" className="knopf" onClick={() => setNeu(null)}>Abbrechen</button>
            <button type="button" className="knopf haupt" disabled={!neu.name.trim() || !neu.command.trim()}
              onClick={() => { const n = neu; setNeu(null); void tun(() => agent.mcpAdd(n.name, n.command, n.args.match(/"[^"]*"|\S+/g)?.map((a) => a.replace(/^"|"$/g, "")) ?? [])); }}>
              Hinzufügen
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="knopf-klein" onClick={() => setNeu({ name: "", command: "", args: "" })}><Plus size={13} /> Server hinzufügen</button>
      )}
      {test && <pre className="diagnose mcp-test">{test}</pre>}
    </div>
  );
}
