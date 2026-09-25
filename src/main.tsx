import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import {
  AppShell, Badge, Button, Dialog, DialogContent, DialogDescription,
  DialogHeader, DialogTitle, Input, InputGroupAddon, Label, NavItem,
  PromptInput, PromptInputAdaptiveTextarea, PromptInputSubmit,
  SidebarAction, SidebarPanel, ThemeProvider, useTheme,
} from "@ki4jlu/design-system";
import { ArrowUp, ChevronRight, Clock3, FileCode2, FileText,
  FolderOpen, Moon, PanelRightClose, Plus, Search,
  Settings2, Square, Sun, Terminal, X } from "lucide-react";
import {
  agent, formatArgs, parseArgs, permissionTone, readPreferences,
  relativeTime, roleLabel, shortPath, statusLabel,
  toolKindLabel, toolStatusLabel, toolStatusTone, writePreferences,
  type Appearance, type DoctorReport, type LaunchConfig, type Preferences,
  type Snapshot, type ToolItem, type TranscriptItem, type Tone,
} from "./core/index.ts";
import "./styles.css";

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

function Brand({ compact = false }: { compact?: boolean }) {
  return <span className={`brand ${compact ? "brand-compact" : ""}`}>
    <span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 44 44" focusable="false"><path d="M10 10h25v25H18v-7h10V17H10z" /><path d="M10 22h7v13h-7z" /></svg></span>
    {!compact && <span className="brand-text"><strong>JICHI</strong><small>AI Coding Assistant</small></span>}
  </span>;
}

function HealthSummary({ report }: { report: DoctorReport | null }) {
  if (!report) return null;
  return <div className="health-summary" role="status">
    <strong>{report.fail ? "Verbindung braucht Aufmerksamkeit" : "Verbindung geprüft"}</strong>
    <span>{report.ok} erfolgreich{report.warn ? ` · ${report.warn} Hinweise` : ""}{report.fail ? ` · ${report.fail} Fehler` : ""}</span>
    {(report.fail > 0 || report.warn > 0) && <details><summary>Prüfungen anzeigen</summary><ul>{report.checks.map((check, index) =>
      <li key={index}><strong>{check.label}</strong> — {check.detail}</li>)}</ul></details>}
  </div>;
}

function Onboarding() {
  const [name, setName] = useState(() => readPreferences().name);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState<DoctorReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !key.trim()) return;
    setBusy(true);
    setError(null);
    writePreferences({ ...readPreferences(), name: name.trim() });
    const secret = key;
    setKey("");
    try {
      const result = await agent.setup(secret);
      setHealth(result);
      if (result.fail) setError("Die Verbindung konnte noch nicht vollständig eingerichtet werden. Sieh dir die Prüfungen unten an.");
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  return <main className="onboarding-screen">
    <div className="onboarding-card">
      <Brand />
      <h1>Willkommen bei jichi</h1>
      <p>Richte deine Verbindung ein. Danach kannst du direkt loslegen.</p>
      <form onSubmit={submit} className="setup-form">
        <div className="field"><Label htmlFor="setup-name">Wie soll jichi dich nennen?</Label>
          <Input id="setup-name" value={name} onChange={event => setName(event.target.value)} autoComplete="given-name" autoFocus required /></div>
        <div className="field"><Label htmlFor="setup-key">API-Schlüssel</Label>
          <Input id="setup-key" type="password" value={key} onChange={event => setKey(event.target.value)} autoComplete="off" required />
          <small>Der Schlüssel wird im Schlüsselbund dieses Geräts gespeichert.</small></div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <Button type="submit" disabled={busy || !name.trim() || !key.trim()}>{busy ? "Verbindung wird geprüft …" : "Verbinden"}</Button>
      </form>
      <HealthSummary report={health} />
    </div>
  </main>;
}

function Settings({ snapshot, preferences, setPreferences, close }: {
  snapshot: Snapshot;
  preferences: Preferences;
  setPreferences: (next: Preferences) => void;
  close: () => void;
}) {
  const config = agent.config;
  const [name, setName] = useState(preferences.name);
  const [program, setProgram] = useState(config?.program ?? "");
  const [args, setArgs] = useState(formatArgs(config?.args ?? []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function saveName(value: string) {
    const next = { ...preferences, name: value.trim() };
    setPreferences(next);
    writePreferences(next);
  }

  function saveAppearance(appearance: Appearance) {
    const next = { ...preferences, appearance };
    setPreferences(next);
    writePreferences(next);
  }

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try { await action(); }
    catch (cause) { setError(messageOf(cause)); }
    finally { setBusy(false); }
  }

  async function saveAdvanced(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const previous = agent.config;
    const next: LaunchConfig = {
      program: program.trim(), args: parseArgs(args),
      cwd: previous?.cwd ?? snapshot.cwd ?? "",
      env: previous?.env ?? [],
    };
    await run(() => agent.setConfig(next));
  }

  const readiness = snapshot.readiness;
  const status = readiness?.keyStored
    ? `Schlüssel gespeichert · ${readiness.config.models.length} Modell${readiness.config.models.length === 1 ? "" : "e"} · ${readiness.version ?? "jichi"}`
    : readiness && !readiness.needsSetup
      ? "Schlüsseldatei vorhanden · bereit"
    : "Einrichtung erforderlich";

  return <div className="settings-sections">
    <section><h3>Allgemein</h3>
      <div className="field"><Label htmlFor="settings-name">Name</Label><Input id="settings-name" value={name} onChange={event => setName(event.target.value)} onBlur={() => saveName(name)} /></div>
      <div className="field"><Label htmlFor="settings-appearance">Erscheinungsbild</Label>
        <select id="settings-appearance" value={preferences.appearance} onChange={event => saveAppearance(event.target.value as Appearance)}>
          <option value="system">System</option><option value="light">Hell</option><option value="dark">Dunkel</option>
        </select></div>
    </section>
    <section><h3>KI-Verbindung</h3>
      <div className="connection-status"><Badge appearance="text" tone="neutral">{status}</Badge></div>
      <div className="settings-buttons">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void run(() => agent.checkHealth())}>Verbindung prüfen</Button>
        <Button type="button" variant="ghost-destructive" size="sm" disabled={busy || !readiness?.keyStored} onClick={() => void run(() => agent.forgetKey())}>Schlüssel entfernen</Button>
      </div>
      <HealthSummary report={snapshot.health} />
    </section>
    <details className="advanced-settings"><summary>Erweitert</summary>
      <form onSubmit={event => void saveAdvanced(event)} className="advanced-form">
        <div className="field"><Label htmlFor="settings-program">Programm</Label><Input id="settings-program" value={program} onChange={event => setProgram(event.target.value)} spellCheck={false} /></div>
        <div className="field"><Label htmlFor="settings-args">Argumente</Label><Input id="settings-args" value={args} onChange={event => setArgs(event.target.value)} spellCheck={false} /></div>
        <Button type="submit" variant="outline" size="sm" disabled={busy}>Agent-Einstellungen speichern</Button>
      </form>
      <p className="advanced-hint">Projektordner: {snapshot.cwd ? shortPath(snapshot.cwd, 52) : "kein Projekt gewählt"}</p>
      {snapshot.diagnostics.length > 0 && <details className="diagnostics"><summary>Diagnose anzeigen</summary><pre>{snapshot.diagnostics.join("\n")}</pre></details>}
    </details>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="settings-end"><Button type="button" variant="ghost" onClick={() => { saveName(name); close(); }}>Schließen</Button></div>
  </div>;
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
        {item.diffs.length > 0 && <Button variant="ghost" size="sm" type="button" onClick={() => openPanel("changes")}>Änderungen ansehen <ChevronRight size={14} /></Button>}
        {item.toolKind === "execute" && <Button variant="ghost" size="sm" type="button" onClick={() => openPanel("terminal")}>Ausgabe ansehen <ChevronRight size={14} /></Button>}
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

function App({ preferences, setPreferences }: { preferences: Preferences; setPreferences: (next: Preferences) => void }) {
  const snapshot = useAgent();
  const { resolvedTheme, setTheme } = useTheme();
  const [initialized, setInitialized] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [leftOpen, setLeftOpen] = useState(true);
  const [mobileTab, setMobileTab] = useState("chat");
  const [panel, setPanel] = useState<Panel | null>(null);
  const [draft, setDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [uiError, setUiError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);

  useEffect(() => { void startup.catch(cause => setUiError(messageOf(cause))).finally(() => setInitialized(true)); }, []);
  useEffect(() => { if (nearBottom.current) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [snapshot.transcript, snapshot.permission]);
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (agent.getSnapshot().needsSetup) return;
      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        setLeftOpen(true);
        setMobileTab("navigation");
        requestAnimationFrame(() => searchRef.current?.focus());
      }
      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        void agent.newSession().catch(cause => setUiError(messageOf(cause)));
        setPanel(null);
        setDraft("");
        setMobileTab("chat");
      }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  const tools = snapshot.transcript.filter((item): item is ToolItem => item.kind === "tool");
  const changes = tools.flatMap(item => item.diffs);
  const hasFiles = tools.some(item => ["read", "edit", "delete", "move", "search"].includes(item.toolKind));
  const hasTerminal = tools.some(item => item.toolKind === "execute");
  const empty = snapshot.transcript.length === 0;

  async function send(text: string) {
    const prompt = text.trim();
    if (!prompt || !snapshot.canSend) return;
    setDraft("");
    setUiError(null);
    try { await agent.send(prompt); }
    catch (cause) { setDraft(prompt); setUiError(messageOf(cause)); }
  }

  async function openProject() {
    try {
      const picked = await agent.pickWorkspace();
      if (picked) {
        setPanel(null);
        setMobileTab("chat");
      }
    }
    catch (cause) { setUiError(messageOf(cause)); }
  }

  if (!initialized) return <main className="loading-screen"><Brand /><span>jichi wird vorbereitet …</span></main>;
  if (snapshot.needsSetup) return <Onboarding />;

  const matchingSessions = snapshot.sessions.filter(session => session.title.toLocaleLowerCase().includes(searchQuery.toLocaleLowerCase()));
  const nav = <SidebarPanel className="jichi-nav-panel" head={<div className="sidebar-controls">
    <label className="sidebar-search"><Search size={17} aria-hidden="true" /><input ref={searchRef} type="search" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="Search chats" aria-label="Search chats" /><kbd>⌘K</kbd></label>
    <SidebarAction className="new-chat-nav" icon={<Plus size={17} />} onClick={() => { void agent.newSession().catch(cause => setUiError(messageOf(cause))); setPanel(null); setDraft(""); setMobileTab("chat"); }}><span>New chat</span><kbd>⌘N</kbd></SidebarAction>
    <div className="sidebar-group"><span className="sidebar-label">PROJECT</span>
      <button type="button" className="sidebar-project" onClick={() => void openProject()} title={snapshot.cwd ?? "Open a project"}><FolderOpen size={17} /><span className="truncate">{snapshot.cwd ? shortPath(snapshot.cwd, 24) : "No project selected"}</span><ChevronRight size={15} /></button>
    </div>
  </div>}>
    <div className="sessions-list"><span className="sidebar-label">CHATS</span>
      {snapshot.sessions.length === 0 ? <div className="sidebar-empty"><Clock3 size={19} /><span><strong>No chats yet</strong><small>Your conversations will appear here</small></span></div> : matchingSessions.length === 0 ? <p className="sidebar-no-results">No matching chats</p> : matchingSessions.map(session =>
        <NavItem key={session.id} level="sub" active={session.id === snapshot.sessionId} title={`${session.title}\n${session.workspace ?? ""}\n${relativeTime(session.modified)}`} onClick={() => { void agent.loadSession(session.id).catch(cause => setUiError(messageOf(cause))); setPanel(null); setMobileTab("chat"); }}>
          <span className="truncate">{session.title}</span>
        </NavItem>)}
    </div>
  </SidebarPanel>;
  const footer = <div className="sidebar-footer"><button type="button" onClick={() => setSettingsOpen(true)}><Settings2 size={18} /> Settings</button></div>;

  const composer = <PromptInput className="composer" shape="pill" onSubmit={({ text }) => void send(text)}>
    <PromptInputAdaptiveTextarea aria-label="Message Jichi" placeholder="Ask Jichi anything..." rows={1} value={draft} onChange={event => setDraft(event.target.value)} readOnly={!snapshot.canSend} inlineLeft={20} inlineRight={64} laneHeight={48} maxHeight={220} />
    <InputGroupAddon align="inline-end" className="composer-send-wrap">
      <PromptInputSubmit className="composer-send" aria-label="Send message" disabled={!snapshot.canSend || !draft.trim()} idle={!draft.trim()}><ArrowUp size={19} /></PromptInputSubmit>
    </InputGroupAddon>
  </PromptInput>;

  return <>
    <AppShell className="jichi-shell" mainLabel="Gespräch" left={{
      header: <Brand />, content: nav, footer, label: "Jichi Navigation", isOpen: leftOpen,
      onOpenChange: setLeftOpen, width: 256, expandLabel: "Navigation öffnen", collapseLabel: "Navigation schließen",
      collapsedPreview: <div className="collapsed-brand"><Brand compact /></div>,
    }} mobileTabs={[{ id: "chat", label: "Chat", icon: <Plus size={18} />, pane: "main" }, { id: "navigation", label: "Navigation", icon: <FolderOpen size={18} />, pane: "left" }]}
      activeMobileTab={mobileTab} onMobileTabChange={setMobileTab} mobileTabBarLabel="Bereiche">
      <div className={`workspace ${panel ? "with-panel" : ""}`}>
        {empty && <div className="top-actions"><button type="button" className="theme-button" aria-label={resolvedTheme === "light" ? "Switch to dark mode" : "Switch to light mode"} onClick={() => setTheme(resolvedTheme === "light" ? "dark" : "light")}>{resolvedTheme === "light" ? <Sun size={19} /> : <Moon size={19} />}</button></div>}
        <section className={`chat ${empty ? "empty-chat" : ""}`} aria-label="Gespräch">
          {!empty && <header className="chat-toolbar">
            <span className="chat-project" title={snapshot.cwd ?? undefined}>{snapshot.cwd ? shortPath(snapshot.cwd, 42) : statusLabel(snapshot.status)}</span>
            <div className="toolbar-actions">
              {changes.length > 0 && <Button variant="ghost" size="sm" onClick={() => setPanel("changes")}><FileCode2 size={16} /> Änderungen</Button>}
              {hasFiles && <Button variant="ghost" size="icon" aria-label="Dateiaktivität" onClick={() => setPanel("files")}><FolderOpen size={17} /></Button>}
              {hasTerminal && <Button variant="ghost" size="icon" aria-label="Terminalausgabe" onClick={() => setPanel("terminal")}><Terminal size={17} /></Button>}
              {snapshot.canCancel && <Button variant="ghost" size="sm" onClick={() => void agent.cancel().catch(cause => setUiError(messageOf(cause)))}><Square size={14} /> Abbrechen</Button>}
            </div>
          </header>}
          {empty ? <div className="empty-layout">
            <div className="empty-content">
              <div className="empty-state"><Brand compact /><h1>JICHI</h1><p>Your AI coding assistant</p></div>
              <div className="empty-composer">{composer}</div>
              <div className="empty-actions">
                {snapshot.cwd ? <>
                  <button type="button" className="empty-action" disabled={!snapshot.canSend} onClick={() => void send("Explain this project and its key components.")}><span className="empty-action-icon"><FileText size={18} /></span><span><strong>Explain this project</strong><small>Understand the structure and key components</small></span><ChevronRight size={16} /></button>
                  <button type="button" className="empty-action" disabled={!snapshot.canSend} onClick={() => void send("Run the tests for this project and summarize the results.")}><span className="empty-action-icon"><Terminal size={18} /></span><span><strong>Run the tests</strong><small>Build and run tests for your project</small></span><ChevronRight size={16} /></button>
                </> : <button type="button" className="empty-action" onClick={() => void openProject()}><span className="empty-action-icon"><FolderOpen size={18} /></span><span><strong>Open a project</strong><small>Connect a local folder to get started</small></span><ChevronRight size={16} /></button>}
              </div>
              {(snapshot.error || uiError) && <div className="inline-error" role="alert">{uiError || snapshot.error}<Button variant="ghost" size="icon" aria-label="Meldung schließen" onClick={() => setUiError(null)}><X size={15} /></Button></div>}
            </div>
          </div> : <>
            <div className="conversation-scroll" ref={scrollRef} onScroll={event => { const element = event.currentTarget; nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 120; }}>
              <div className="conversation">{snapshot.transcript.map(item => <TranscriptEntry key={item.id} item={item} openPanel={setPanel} />)}</div>
            </div>
            <div className="bottom-area"><PermissionBar snapshot={snapshot} report={setUiError} />
              {(snapshot.error || uiError) && <div className="inline-error" role="alert">{uiError || snapshot.error}<Button variant="ghost" size="icon" aria-label="Meldung schließen" onClick={() => setUiError(null)}><X size={15} /></Button></div>}
              {composer}
            </div>
          </>}
        </section>
        {panel && <ContextPanel panel={panel} tools={tools} close={() => setPanel(null)} />}
      </div>
    </AppShell>
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}><DialogContent className="settings-dialog">
      <DialogHeader><DialogTitle>Einstellungen</DialogTitle><DialogDescription>Dein Profil und die Verbindung zu jichi.</DialogDescription></DialogHeader>
      <Settings snapshot={snapshot} preferences={preferences} setPreferences={setPreferences} close={() => setSettingsOpen(false)} />
    </DialogContent></Dialog>
  </>;
}

function Root() {
  const [preferences, setPreferences] = useState(() => readPreferences());
  return <ThemeProvider theme={preferences.appearance} onThemeChange={appearance => {
    const next = { ...preferences, appearance };
    setPreferences(next);
    writePreferences(next);
  }}><App preferences={preferences} setPreferences={setPreferences} /></ThemeProvider>;
}

createRoot(document.getElementById("root")!).render(<Root />);
