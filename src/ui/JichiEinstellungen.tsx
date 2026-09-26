/**
 * jichis eigene Einstellungen in der Anwendung: dauerhafte Erlaubnisse und
 * MCP-Server. Beides steht in `~/.jichi`; geschrieben wird mit Sicherung, und
 * jichi startet danach neu (der offene Chat bleibt).
 */

import { useEffect, useState } from "react";
import { Plug, Plus, Stethoscope, Trash2, X } from "lucide-react";

import { agent, t, type McpServerEntry, type Permissions } from "../core/index.ts";
import { nachricht, useSprache } from "./util.ts";

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
            <button type="button" aria-label={t("{name} entfernen", { name: w })} onClick={() => setWerte(werte.filter((x) => x !== w))}><X size={10} /></button>
          </span>
        ))}
        <input value={neu} onChange={(e) => setNeu(e.target.value)} placeholder={t("Werkzeug, z. B. edit_file")}
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
  useSprache();

  useEffect(() => {
    void agent.permissions().then((x) => { setP(x); setAllow(x.allow); setDeny(x.deny); }, (e: Error) => setFehler(e.message));
  }, []);

  const geaendert = p && (JSON.stringify(allow) !== JSON.stringify(p.allow) || JSON.stringify(deny) !== JSON.stringify(p.deny));

  async function speichern() {
    setFehler(null);
    try {
      const x = await agent.setPermissions(allow, deny);
      setP(x);
      setMeldung(t("gespeichert — gilt ab sofort"));
      setTimeout(() => setMeldung(null), 2200);
    } catch (e) {
      setFehler(nachricht(e));
    }
  }

  return (
    <div className="abschnitt">
      <div className="abschnitt-kopf"><h3>{t("Erlaubnisse")}</h3>{meldung && <span className="panel-meldung">{meldung}</span>}</div>
      <p className="abschnitt-text">
        {t("Was jichi dauerhaft ohne Rückfrage darf — und was nie. „Nie“ gewinnt immer. „Immer erlauben“ in einer Rückfrage trägt ein Werkzeug hier ein.")}{" "}
        {t("MCP-Werkzeuge heißen")} <code>server__werkzeug</code>.
      </p>
      {p?.allowAll && <p className="zugang-fehler">{t("In der Konfiguration ist „alles erlauben“")} (<code>*</code>) {t("gesetzt — jichi fragt dann nie.")}</p>}
      {fehler && <p className="zugang-fehler" role="alert">{fehler}</p>}
      {p && (
        <>
          <Liste titel={t("Immer erlauben")} text={t("ohne Rückfrage")} werte={allow} setWerte={setAllow} ton="gut" />
          <Liste titel={t("Nie erlauben")} text={t("wird dem Modell gar nicht angeboten")} werte={deny} setWerte={setDeny} ton="schlecht" />
          {geaendert && (
            <div className="knopfreihe">
              <button type="button" className="knopf" onClick={() => { setAllow(p.allow); setDeny(p.deny); }}>{t("Verwerfen")}</button>
              <button type="button" className="knopf haupt" onClick={() => void speichern()}>{t("Speichern")}</button>
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
  useSprache();

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
        <h3>{t("MCP-Server")}</h3>
        <button type="button" className="knopf-klein" disabled={prueft} onClick={() => void pruefen()}>
          <Stethoscope size={13} /> {prueft ? t("Verbindet …") : t("Verbindung prüfen")}
        </button>
      </div>
      <p className="abschnitt-text">{t("Programme, die jichi zusätzliche Werkzeuge geben — eine Datenbank, ein Ticketsystem. Ausgeschaltete bleiben eingetragen.")}</p>
      {fehler && <p className="zugang-fehler" role="alert">{fehler}</p>}
      {liste && liste.length === 0 && <p className="abschnitt-text">{t("Noch keine Server eingetragen.")}</p>}
      {liste && liste.length > 0 && (
        <ul className="mcp-liste">
          {liste.map((m) => (
            <li key={m.name} className={m.disabled ? "aus" : ""}>
              <Plug size={14} />
              <div className="mcp-text">
                <strong>{m.name}{m.builtin && <span className="mcp-eigen">{t("eingebaut: Dokumente")}</span>}</strong>
                <code>{m.url ?? [m.command, ...m.args].filter(Boolean).join(" ")}</code>
              </div>
              <label className="schalter" title={m.disabled ? t("Einschalten") : t("Ausschalten")}>
                <input type="checkbox" checked={!m.disabled} onChange={(e) => void tun(() => agent.mcpToggle(m.name, e.target.checked))} />
                <span />
              </label>
              {!m.builtin && (
                <button type="button" className="knopf-klein knopf-symbol" aria-label={t("{name} entfernen", { name: m.name })} title={t("Entfernen")} onClick={() => void tun(() => agent.mcpRemove(m.name))}>
                  <Trash2 size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {neu ? (
        <div className="mcp-neu">
          <input placeholder={t("Name, z. B. datenbank")} value={neu.name} onChange={(e) => setNeu({ ...neu, name: e.target.value })} spellCheck={false} />
          <input placeholder={t("Programm, z. B. npx oder python3")} value={neu.command} onChange={(e) => setNeu({ ...neu, command: e.target.value })} spellCheck={false} />
          <input placeholder={t("Argumente, z. B. -y @modelcontextprotocol/server-filesystem .")} value={neu.args} onChange={(e) => setNeu({ ...neu, args: e.target.value })} spellCheck={false} />
          <div className="knopfreihe">
            <button type="button" className="knopf" onClick={() => setNeu(null)}>{t("Abbrechen")}</button>
            <button type="button" className="knopf haupt" disabled={!neu.name.trim() || !neu.command.trim()}
              onClick={() => { const n = neu; setNeu(null); void tun(() => agent.mcpAdd(n.name, n.command, n.args.match(/"[^"]*"|\S+/g)?.map((a) => a.replace(/^"|"$/g, "")) ?? [])); }}>
              {t("Hinzufügen")}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="knopf-klein" onClick={() => setNeu({ name: "", command: "", args: "" })}><Plus size={13} /> {t("Server hinzufügen")}</button>
      )}
      {test && <pre className="diagnose mcp-test">{test}</pre>}
    </div>
  );
}
