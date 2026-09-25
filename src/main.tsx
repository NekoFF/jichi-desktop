import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import {
  AppShellLayout, Badge, Button, Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle, Input, Label, NavItem,
  Textarea, ThemeProvider, ThemeToggle,
} from "@ki4jlu/design-system";
import { ArrowRight, ChevronRight, FileCode2, FolderOpen, PanelRightClose,
  Plus, Send, Settings2, Square, Terminal, X } from "lucide-react";
import {
  agent, formatArgs, parseArgs, permissionTone, relativeTime, roleLabel,
  shortPath, statusLabel, statusTone, toolKindLabel, toolStatusLabel,
  toolStatusTone, type LaunchConfig, type Snapshot, type ToolItem,
  type TranscriptItem, type Tone,
} from "./core/index.ts";
import "./styles.css";

const KEY_VAR = "JICHI_API_KEY";
const startup = agent.init();

function useAgent(): Snapshot {
  return useSyncExternalStore(agent.subscribe, agent.getSnapshot);
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function badgeTone(tone: Tone): "neutral" | "primary" | "success" | "warning" | "error" {
  return tone === "accent" ? "primary" : tone === "danger" ? "error" : tone;
}

type Panel = "changes" | "files" | "terminal";

function SettingsForm({ snapshot, onSaved, onClose, firstRun = false }: {
  snapshot: Snapshot;
  onSaved: () => void;
  onClose: () => void;
  firstRun?: boolean;
}) {
  const config = agent.config;
  const [program, setProgram] = useState(config?.program ?? "");
  const [args, setArgs] = useState(formatArgs(config?.args ?? []));
  const [cwd, setCwd] = useState(config?.cwd ?? "");
  const [keyFile, setKeyFile] = useState(config?.env.find(e => e.name === KEY_VAR)?.file ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const previous = agent.config;
    const next: LaunchConfig = {
      program: program.trim(), args: parseArgs(args), cwd: cwd.trim(),
      env: [
        ...(previous?.env.filter(e => e.name !== KEY_VAR) ?? []),
        ...(keyFile.trim() ? [{ name: KEY_VAR, file: keyFile.trim() }] : []),
      ],
    };
    try {
      await agent.setConfig(next);
      onSaved();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setSaving(false);
    }
  }

  return <form className="settings-form" onSubmit={save}>
    <div className="field">
      <Label htmlFor="cfg-program">Programm</Label>
      <Input id="cfg-program" value={program} onChange={e => setProgram(e.target.value)} spellCheck={false} placeholder="jichi" />
    </div>
    <div className="field">
      <Label htmlFor="cfg-args">Argumente</Label>
      <Input id="cfg-args" value={args} onChange={e => setArgs(e.target.value)} spellCheck={false} placeholder="--acp" />
    </div>
    <div className="field">
      <Label htmlFor="cfg-cwd">Arbeitsverzeichnis</Label>
      <Input id="cfg-cwd" value={cwd} onChange={e => setCwd(e.target.value)} spellCheck={false} placeholder="/Pfad/zum/Projekt" />
    </div>
    <div className="field">
      <Label htmlFor="cfg-key">Pfad zur API-Schlüsseldatei</Label>
      <Input id="cfg-key" value={keyFile} onChange={e => setKeyFile(e.target.value)} spellCheck={false} placeholder="/Pfad/zur/Schlüsseldatei" />
      <p className="field-help">Der Dateiinhalt wird erst beim Start des Agenten gelesen.</p>
    </div>
    {snapshot.agentVersion && <p className="field-help">Gefunden: {snapshot.agentVersion}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {snapshot.diagnostics.length > 0 && <details className="diagnostics">
      <summary>Diagnose des Agenten</summary>
      <pre>{snapshot.diagnostics.join("\n")}</pre>
    </details>}
    <DialogFooter className="settings-actions">
      <Button type="button" variant="ghost" onClick={onClose}>{firstRun ? "Später" : "Schließen"}</Button>
      <Button type="submit" disabled={saving}>{saving ? "Speichert …" : firstRun ? "Weiter" : "Speichern"}</Button>
    </DialogFooter>
  </form>;
}

function ToolRow({ item, openPanel }: { item: ToolItem; openPanel: (panel: Panel) => void }) {
  const output = [item.output, item.truncated ? "… Ausgabe gekürzt" : ""].filter(Boolean).join("\n");
  return <div className="tool-row">
    <details>
      <summary>
        <span className="tool-symbol" aria-hidden="true">{item.status === "completed" ? "✓" : item.status === "failed" ? "!" : "·"}</span>
        <span className="tool-title">{item.title}</span>
        <Badge appearance="text" tone={badgeTone(toolStatusTone(item.status))}>{toolStatusLabel(item.status)}</Badge>
      </summary>
      <div className="tool-details">
        <p>{toolKindLabel(item.toolKind)}</p>
        {output && <pre>{output}</pre>}
        {item.diffs.length > 0 && <Button variant="ghost" size="sm" type="button" onClick={() => openPanel("changes")}>Änderungen ansehen <ArrowRight size={14} /></Button>}
        {item.toolKind === "execute" && <Button variant="ghost" size="sm" type="button" onClick={() => openPanel("terminal")}>Ausgabe ansehen <ArrowRight size={14} /></Button>}
      </div>
    </details>
  </div>;
}

function TranscriptEntry({ item, openPanel }: { item: TranscriptItem; openPanel: (panel: Panel) => void }) {
  if (item.kind === "tool") return <ToolRow item={item} openPanel={openPanel} />;
  if (item.kind === "notice") return <div className={`notice notice-${item.level}`} role={item.level === "error" ? "alert" : "status"}>{item.text}</div>;
  if (item.role === "thought") return <details className="thought"><summary>Überlegung</summary><p>{item.text}</p></details>;
  return <article className={`message message-${item.role}`} aria-label={roleLabel(item.role)}>
    <div className="message-role">{roleLabel(item.role)}</div>
    <div className="message-body">{item.text}{item.streaming && <span className="stream-cursor" aria-label="Antwort wird geschrieben" />}</div>
  </article>;
}

function PermissionBar({ snapshot, report }: { snapshot: Snapshot; report: (error: string) => void }) {
  const focusRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (snapshot.permission) focusRef.current?.focus(); }, [snapshot.permission?.requestId]);
  if (!snapshot.permission) return null;
  const permission = snapshot.permission;
  return <section className="permission" ref={focusRef} tabIndex={-1} aria-labelledby="permission-title">
    <div className="permission-head">
      <div><span className="eyebrow">BERECHTIGUNG</span><h2 id="permission-title">jichi bittet um Erlaubnis</h2></div>
      <Badge appearance="text" tone="warning">Wartet auf deine Entscheidung</Badge>
    </div>
    <code className="permission-command">{permission.title}</code>
    <div className="permission-actions">
      {permission.options.map(option => <Button
        key={option.optionId} type="button" size="sm"
        variant={permissionTone(option) === "danger" ? "ghost-destructive" : permissionTone(option) === "warning" ? "outline" : "default"}
        onClick={() => { try { agent.answerPermission(option.optionId); } catch (cause) { report(messageOf(cause)); } }}
      >{option.name}</Button>)}
      <Button type="button" variant="ghost" size="sm" onClick={() => { try { agent.answerPermission(null); } catch (cause) { report(messageOf(cause)); } }}>Zug abbrechen</Button>
    </div>
  </section>;
}

function ContextPanel({ panel, tools, close }: { panel: Panel; tools: ToolItem[]; close: () => void }) {
  const changed = tools.flatMap(tool => tool.diffs);
  const fileTools = tools.filter(tool => ["read", "edit", "delete", "move", "search"].includes(tool.toolKind));
  const terminalTools = tools.filter(tool => tool.toolKind === "execute");
  const title = panel === "changes" ? "Änderungen" : panel === "files" ? "Dateien" : "Terminal";
  return <aside className="context-panel" aria-label={title}>
    <header className="panel-header"><h2>{title}</h2><Button type="button" variant="ghost" size="icon" aria-label="Panel schließen" onClick={close}><PanelRightClose size={18} /></Button></header>
    <div className="panel-content">
      {panel === "changes" && (changed.length ? changed.map((diff, index) => <section className="panel-section" key={`${diff.path}-${index}`}>
        <h3>{diff.path}</h3>
        {diff.oldText !== null && <><p>Vorher</p><pre>{diff.oldText}</pre></>}
        <p>Nachher</p><pre>{diff.newText}</pre>
      </section>) : <p className="panel-empty">Noch keine Änderungen in diesem Gespräch.</p>)}
      {panel === "files" && (fileTools.length ? fileTools.map(tool => <section className="panel-section" key={tool.id}>
        <h3>{tool.title}</h3><p>{toolKindLabel(tool.toolKind)} · {toolStatusLabel(tool.status)}</p>
        {tool.output && <pre>{tool.output}</pre>}
      </section>) : <p className="panel-empty">Noch keine Dateiaktivität in diesem Gespräch.</p>)}
      {panel === "terminal" && (terminalTools.length ? terminalTools.map(tool => <section className="panel-section" key={tool.id}>
        <h3>{tool.title}</h3><p>{toolStatusLabel(tool.status)}</p><pre>{tool.output || "Noch keine Ausgabe."}</pre>
      </section>) : <p className="panel-empty">Noch keine Befehle in diesem Gespräch.</p>)}
    </div>
  </aside>;
}

function App() {
  const snapshot = useAgent();
  const [initialized, setInitialized] = useState(false);
  const [dismissedIntro, setDismissedIntro] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [draft, setDraft] = useState("");
  const [uiError, setUiError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);

  useEffect(() => { void startup.catch(cause => setUiError(messageOf(cause))).finally(() => setInitialized(true)); }, []);
  useEffect(() => { if (nearBottom.current) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [snapshot.transcript, snapshot.permission]);

  const tools = snapshot.transcript.filter((item): item is ToolItem => item.kind === "tool");
  const changes = tools.flatMap(item => item.diffs);
  const hasFiles = tools.some(item => ["read", "edit", "delete", "move", "search"].includes(item.toolKind));
  const hasTerminal = tools.some(item => item.toolKind === "execute");
  const empty = snapshot.transcript.length === 0;
  const intro = initialized && !dismissedIntro && snapshot.sessions.length === 0 && snapshot.transcript.length === 0 &&
    !agent.config?.env.some(item => item.name === KEY_VAR && item.file);

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !snapshot.canSend) return;
    setDraft("");
    setUiError(null);
    try { await agent.send(text); }
    catch (cause) { setDraft(text); setUiError(messageOf(cause)); }
  }

  const nav = <div className="sidebar-content">
    <NavItem className="new-chat-nav" onClick={() => { void agent.newSession().catch(cause => setUiError(messageOf(cause))); setPanel(null); setDraft(""); }}><Plus size={17} /> Neuer Chat</NavItem>
    <div className="sidebar-group"><span className="eyebrow">PROJEKT</span>
      <NavItem level="sub" onClick={() => setSettingsOpen(true)} title={snapshot.cwd ?? "Projekt wählen"}><FolderOpen size={16} /><span className="truncate">{snapshot.cwd ? shortPath(snapshot.cwd, 27) : "Kein Projekt gewählt"}</span></NavItem>
    </div>
    <div className="sidebar-group sessions-group"><span className="eyebrow">CHATS</span>
      {snapshot.sessions.length === 0 ? <p className="sidebar-empty">Noch keine Chats</p> : snapshot.sessions.map(session =>
        <NavItem key={session.id} level="sub" active={session.id === snapshot.sessionId} title={`${session.title}\n${session.workspace ?? ""}\n${relativeTime(session.modified)}`} onClick={() => { void agent.loadSession(session.id).catch(cause => setUiError(messageOf(cause))); setPanel(null); }}>
          <span className="truncate">{session.title}</span>
        </NavItem>)}
    </div>
  </div>;
  const footer = <div className="sidebar-footer"><NavItem level="sub" onClick={() => setSettingsOpen(true)}><Settings2 size={16} /> Einstellungen</NavItem><ThemeToggle /></div>;

  return <>
    <AppShellLayout className="jichi-shell" logo={<span className="brand-lockup"><span className="brand-icon" aria-hidden="true">J</span><span><span className="wordmark">JICHI</span><span className="brand-subtitle">AI Coding Assistant</span></span></span>} nav={nav} sidebarFooter={footer} navLabel="Jichi Navigation">
      <div className={`workspace ${panel ? "with-panel" : ""}`}>
        <section className={`chat ${empty ? "empty-chat" : ""}`} aria-label="Gespräch">
          <header className="chat-header">
            <div className="status-line"><Badge appearance="text" dot tone={badgeTone(statusTone(snapshot.status))}>{snapshot.status === "offline" && snapshot.agentVersion ? "Bereit zum Start" : statusLabel(snapshot.status)}</Badge>
              {snapshot.cwd && <span className="header-path" title={snapshot.cwd}>{shortPath(snapshot.cwd, 42)}</span>}</div>
            <div className="header-actions">
              {changes.length > 0 && <Button variant="ghost" size="sm" onClick={() => setPanel("changes")}><FileCode2 size={16} /> Änderungen</Button>}
              {hasFiles && <Button variant="ghost" size="icon" aria-label="Dateiaktivität" title="Dateien" onClick={() => setPanel("files")}><FolderOpen size={17} /></Button>}
              {hasTerminal && <Button variant="ghost" size="icon" aria-label="Terminalausgabe" title="Terminal" onClick={() => setPanel("terminal")}><Terminal size={17} /></Button>}
              {snapshot.canCancel && <Button variant="ghost" size="sm" onClick={() => { void agent.cancel().catch(cause => setUiError(messageOf(cause))); }}><Square size={14} /> Abbrechen</Button>}
            </div>
          </header>
          {intro ? <div className="onboarding">
            <div className="onboarding-content"><span className="eyebrow">WILLKOMMEN</span><h1>jichi einrichten</h1><p>Verbinde jichi mit der Datei, die deinen API-Schlüssel enthält. Danach kannst du direkt loslegen.</p>
              <SettingsForm snapshot={snapshot} firstRun onSaved={() => setDismissedIntro(true)} onClose={() => setDismissedIntro(true)} /></div>
          </div> : <>
            <div className="conversation-scroll" ref={scrollRef} onScroll={e => { const el = e.currentTarget; nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120; }}>
              <div className={`conversation ${snapshot.transcript.length === 0 ? "conversation-empty" : ""}`}>
                {empty ? <div className="empty-state"><span className="brand-icon empty-icon" aria-hidden="true">J</span><h1>JICHI</h1><p>Dein KI-Assistent für Code</p></div> : snapshot.transcript.map(item => <TranscriptEntry key={item.id} item={item} openPanel={setPanel} />)}
                {changes.length > 0 && <Button className="changes-summary" variant="ghost" size="sm" onClick={() => setPanel("changes")}><FileCode2 size={16} /> {new Set(changes.map(d => d.path)).size} Dateien geändert <span>Änderungen ansehen</span><ChevronRight size={15} /></Button>}
              </div>
            </div>
            <div className="bottom-area">
              <PermissionBar snapshot={snapshot} report={setUiError} />
              {(snapshot.error || uiError) && <div className="inline-error" role="alert"><span>{uiError || snapshot.error}</span><Button variant="ghost" size="icon" aria-label="Meldung schließen" onClick={() => setUiError(null)}><X size={15} /></Button></div>}
              <form className="composer" onSubmit={send}>
                <Textarea variant="inline" aria-label="Nachricht an jichi" placeholder="Frag jichi …" rows={2} value={draft} readOnly={!snapshot.canSend} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
                <Button type="submit" size="icon" aria-label="Nachricht senden" disabled={!snapshot.canSend || !draft.trim()}><Send size={17} /></Button>
              </form>
              {!empty && <div className="composer-meta"><span>{!snapshot.canSend ? "Bitte warten, bis jichi wieder bereit ist." : "Enter senden · Umschalt+Enter neue Zeile"}</span></div>}
              {empty && <div className="empty-actions">
                {!snapshot.cwd ? <Button type="button" variant="ghost" className="empty-action" onClick={() => setSettingsOpen(true)}><span className="empty-action-icon"><FolderOpen size={19} /></span><span className="empty-action-copy"><strong>Projekt öffnen</strong><small>Arbeitsordner für jichi festlegen</small></span><ChevronRight size={17} /></Button> : <>
                  <Button type="button" variant="ghost" className="empty-action" onClick={() => setDraft("Erkläre mir dieses Projekt.")}><span className="empty-action-icon"><FileCode2 size={19} /></span><span className="empty-action-copy"><strong>Projekt erklären</strong><small>Struktur und wichtige Komponenten verstehen</small></span><ChevronRight size={17} /></Button>
                  <Button type="button" variant="ghost" className="empty-action" onClick={() => setDraft("Führe die Tests für dieses Projekt aus.")}><span className="empty-action-icon"><Terminal size={19} /></span><span className="empty-action-copy"><strong>Tests ausführen</strong><small>Das Projekt prüfen lassen</small></span><ChevronRight size={17} /></Button>
                </>}
              </div>}
            </div>
          </>}
        </section>
        {panel && <ContextPanel panel={panel} tools={tools} close={() => setPanel(null)} />}
      </div>
    </AppShellLayout>
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
      <DialogContent className="settings-dialog"><DialogHeader><DialogTitle>Einstellungen</DialogTitle><DialogDescription>Programm, Projekt und Schlüsseldatei für jichi.</DialogDescription></DialogHeader>
        <SettingsForm key={settingsOpen ? "open" : "closed"} snapshot={snapshot} onSaved={() => { setSettingsOpen(false); setDismissedIntro(true); }} onClose={() => setSettingsOpen(false)} />
      </DialogContent>
    </Dialog>
  </>;
}

createRoot(document.getElementById("root")!).render(<ThemeProvider><App /></ThemeProvider>);
