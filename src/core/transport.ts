/**
 * Der Transport — die einzige Stelle, die Tauri kennt.
 *
 * Alles darüber arbeitet gegen das `Transport`-Interface. Das ist nicht
 * Architektur um ihrer selbst willen: so lässt sich der gesamte Protokollteil
 * gegen einen erfundenen Agenten prüfen, ohne Fenster, ohne Kindprozess und
 * ohne installiertes jichi.
 */

import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openUrl as openExternal } from "@tauri-apps/plugin-opener";

import type { DokuStatus, DokuTreffer } from "./doku.ts";

/** Was ein Unterbefehl von jichi ausgab. */
export interface JichiAusgabe {
  exit: number | null;
  stdout: string;
  stderr: string;
}
import { t } from "./i18n.ts";

/**
 * Eine Umgebungsvariable für den Agenten.
 *
 * Für Geheimnisse ist `secret` gedacht: der Name eines Eintrags in der
 * geschützten Ablage der Anwendung. Der Wert wird ausschließlich auf der
 * Rust-Seite gelesen, im Moment des Starts — es gibt keinen Befehl, der ihn
 * hierher zurückgibt. `file` und `value` bleiben für Sonderfälle.
 */
export interface EnvSpec {
  name: string;
  secret?: string;
  value?: string;
  file?: string;
}

/** Ein Modell aus der Konfiguration des Agenten. */
export interface ModelInfo {
  name: string;
  model: string;
  apiBase: string | null;
  apiKeyEnv: string | null;
  roles: string[];
}

export interface ConfigReport {
  path: string;
  exists: boolean;
  /** Gesetzt, wenn die Datei da ist, aber unlesbar. */
  problem: string | null;
  models: ModelInfo[];
}

/** Die eine Frage des ersten Starts: kann losgelegt werden? */
export interface Readiness {
  /** Voller Pfad zum Agenten, oder `null`, wenn er nicht gefunden wurde. */
  agent: string | null;
  version: string | null;
  config: ConfigReport;
  keyStored: boolean;
  /** Name der Umgebungsvariablen, aus der der Agent seinen Schlüssel liest. */
  keyEnv: string;
  needsSetup: boolean;
}

/** Eine einzelne Prüfung aus `jichi doctor --output json`. */
export interface DoctorCheck {
  status: "ok" | "warn" | "fail";
  label: string;
  detail: string;
}

export interface DoctorReport {
  ok: number;
  warn: number;
  fail: number;
  exit: number;
  checks: DoctorCheck[];
}

export interface SpawnSpec {
  program: string;
  args: string[];
  cwd?: string | null;
  env?: EnvSpec[];
}

/** Was die Plattform vorschlägt, bevor der Benutzer etwas eingestellt hat. */
export interface LaunchSuggestion {
  program: string;
  args: string[];
  /** Voller Pfad, falls auffindbar — sonst `null`, und die Oberfläche fragt. */
  resolved: string | null;
  cwd: string;
  env: EnvSpec[];
  hint: string;
}

/** Eine gespeicherte Sitzung des Agenten (`~/.jichi.d/sessions/<id>.json`). */
export interface StoredSession {
  id: string;
  title: string;
  /** Angeheftet (Anwendung, nicht jichi). */
  pinned?: boolean;
  /** Der Titel, den jichi vergeben hat — wenn der Benutzer umbenannt hat. */
  originalTitle?: string;
  workspace: string | null;
  mode: string | null;
  /** Sekunden seit Epoche. Formatierung ist Sache der Oberfläche. */
  modified: number;
  turns: number;
}

export interface TransportEvents {
  line(generation: number, line: string): void;
  stderr(generation: number, line: string): void;
  exit(generation: number, code: number | null): void;
  /** Ein Terminal des Agenten hat geschrieben (ACP `terminal/*`). */
  termOutput(terminalId: string, chunk: string): void;
  termExit(terminalId: string, exit: TermExit): void;
}

/** Ein Modell, das der Schlüssel am Gateway erreicht. Nur `jlu/…`. */
export interface GatewayModel {
  id: string;
  kind: "chat" | "embed" | "rerank" | "transcribe" | "speech" | "image";
}

export interface GatewayReport {
  base: string;
  models: GatewayModel[];
}

/** Ob jichi die Dokumenten-Werkzeuge (PDF, Word, Excel …) dieser Anwendung hat. */
export interface DocumentsStatus {
  enabled: boolean;
  /** Der Eintrag zeigt auf ein vorhandenes Programm. */
  reachable: boolean;
  /** Die Konfiguration lässt sich nicht sicher bearbeiten (z. B. Kommentare). */
  problem: string | null;
}

/** Eine Datei im Projekt, die ein Werkzeug erzeugt oder geändert hat. */
export interface FileInfo {
  path: string;
  name: string;
  size: number;
  /** Sekunden seit Epoche. */
  modified: number;
  /** „Öffnen“ ist erlaubt (Dokument, Text, Bild — nichts Ausführbares). */
  openable: boolean;
}

/** Ein Eintrag im Projektbaum. */
export interface DirEntry {
  name: string;
  /** Relativ zum Projekt, mit `/`. */
  path: string;
  dir: boolean;
  size: number;
  /** node_modules & Co.: nicht von selbst aufklappen. */
  heavy: boolean;
}

export interface DirListing {
  entries: DirEntry[];
  truncated: boolean;
}

/** Eine Textdatei zum Anzeigen und Bearbeiten. */
export interface TextFile {
  path: string;
  text: string;
  size: number;
  /** Millisekunden — beim Speichern zurückgeben, damit ein Konflikt auffällt. */
  modified: number;
  binary: boolean;
}

export interface SheetPreview {
  name: string;
  rows: string[][];
  truncated: boolean;
}

/** Was diese Anwendung zu einem Chat merkt: eigener Name, angeheftet. */
export interface ChatMeta {
  title?: string;
  pinned?: boolean;
}

export interface ChatHit {
  id: string;
  snippet: string;
  role: string;
}

export interface Permissions {
  allow: string[];
  deny: string[];
  allowAll: boolean;
  denyAll: boolean;
}

export interface McpServerEntry {
  name: string;
  command?: string | null;
  args: string[];
  url?: string | null;
  disabled: boolean;
  builtin: boolean;
}

export type ExportFormat = "md" | "docx" | "pdf";

/** Eine Datei mit Änderungen gegenüber dem letzten Commit. */
export interface GitChange {
  path: string;
  /** M geändert, A neu, D gelöscht, R umbenannt, ? nicht in git */
  status: "M" | "A" | "D" | "R" | "?";
  additions: number;
  deletions: number;
}

export interface GitState {
  repo: boolean;
  branch: string | null;
  files: GitChange[];
}

export interface GitFileDiff {
  before: string | null;
  after: string | null;
  binary: boolean;
}

export interface BrowserState {
  id: string;
  url?: string | null;
  title?: string | null;
  loading?: boolean | null;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Eine angehängte Textdatei. Der Inhalt geht als eingebettete Ressource mit. */
export interface FileAttachment {
  name: string;
  path: string;
  text: string;
}

export interface TermSpec {
  command: string;
  args?: string[];
  cwd?: string | null;
  outputByteLimit?: number | null;
}

export interface TermExit {
  exitCode: number | null;
  signal: number | null;
}

export interface TermOutput {
  output: string;
  truncated: boolean;
  exitStatus: TermExit | null;
}

export interface Transport {
  defaultLaunch(): Promise<LaunchSuggestion>;
  probe(program: string): Promise<string>;
  sessions(): Promise<StoredSession[]>;
  deleteSession(sessionId: string): Promise<void>;
  /** Startet den Agenten und liefert die Generation dieses Kindes. */
  start(spec: SpawnSpec): Promise<number>;
  send(line: string): Promise<void>;
  stop(): Promise<void>;
  running(): Promise<boolean>;
  /** Hört auf die Ereignisse des Kindes. Der Rückgabewert löst die Bindung. */
  listen(events: TransportEvents): Promise<() => void>;

  // ── Erster Start ───────────────────────────────────────────────────────────

  /** `program`: das eingetragene Programm, sonst sucht die Plattform selbst. */
  readiness(program?: string | null): Promise<Readiness>;
  /** Der Agent prüft sich selbst: Schlüssel, Server, Modelle, Kontextfenster. */
  doctor(program: string, env: EnvSpec[]): Promise<DoctorReport>;
  /** Legt die Konfiguration des Agenten an. Scheitert, wenn es sie schon gibt. */
  /** Die erste Konfiguration: `jichi setup` (ohne Rückfragen) mit dem Gateway, dazu embed/rerank und der Dokumenten-Server. */
  writeConfig(preset: string, program: string): Promise<ConfigReport>;
  /** Legt ein Geheimnis in der geschützten Ablage ab. Es kommt nie wieder hierher zurück. */
  secretStore(account: string, value: string): Promise<void>;
  secretPresent(account: string): Promise<boolean>;
  secretForget(account: string): Promise<void>;
  /** Ordnerauswahl des Betriebssystems. `null`, wenn abgebrochen wurde. */
  pickDirectory(title: string): Promise<string | null>;
  /** Dateiauswahl des Betriebssystems — für das Programm des Agenten. */
  pickFile(title: string): Promise<string | null>;

  // ── Was der Schlüssel erreicht ─────────────────────────────────────────────

  /** Die freien Modelle (`jlu/…`) am Gateway. Kostet nichts, ist eine Liste. */
  gatewayModels(): Promise<GatewayReport>;

  // ── Sprache ────────────────────────────────────────────────────────────────

  /**
   * Eine Aufnahme als Text, über `/audio/transcriptions` des Gateways. Der
   * Schlüssel bleibt in Rust; Rust nimmt nur `jlu/…`-Modelle an. `language`
   * leer: das Modell erkennt die Sprache selbst.
   */
  transcribe(audio: Uint8Array, mime: string, model: string, language?: string): Promise<string>;
  /** Text als Ton (mp3), über `/audio/speech` des Gateways. */
  speak(text: string, model: string, voice?: string): Promise<ArrayBuffer>;

  // ── Vorschau ───────────────────────────────────────────────────────────────

  /** Heutiger Inhalt einer Datei im Projekt, `null` wenn es sie noch nicht gibt. */
  readWorkspaceFile(cwd: string, path: string): Promise<string | null>;

  // ── Terminals für den Agenten ──────────────────────────────────────────────

  /** `false`, wo die Befehle des Agenten nicht hier laufen können (Windows: WSL). */
  readonly terminals: boolean;
  termCreate(spec: TermSpec): Promise<string>;
  termOutput(terminalId: string): Promise<TermOutput>;
  termWait(terminalId: string): Promise<TermExit>;
  termKill(terminalId: string): Promise<void>;
  termRelease(terminalId: string): Promise<void>;

  /** Einen Verweis im Browser öffnen. Nur http(s). */
  openUrl(url: string): Promise<void>;

  /** Eine vom Benutzer gewählte Datei lesen: Text, PDF, Word, Excel … als Text. */
  readAttachment(path: string): Promise<FileAttachment>;

  /** Dokumenten-Werkzeuge für jichi: Stand abfragen, ein- oder ausschalten. */
  documentsStatus(): Promise<DocumentsStatus>;
  documentsSet(enable: boolean): Promise<DocumentsStatus>;

  // ── jichis Dokumentation ───────────────────────────────────────────────────
  // `program` ist das Programm des Agenten: neben ihm liegt die Dokumentation.

  jichiDokuStatus(program: string): Promise<DokuStatus>;
  /** Den Ort nennen (`null`: vergessen). Nur jichis `docs/` wird angenommen. */
  jichiDokuPfad(program: string, pfad: string | null): Promise<DokuStatus>;
  jichiDokuListe(program: string): Promise<string[]>;
  jichiDokuLesen(program: string, seite: string): Promise<string>;
  jichiDokuSuchen(program: string, anfrage: string): Promise<DokuTreffer[]>;
  /** jichi die Dokumentation als Quelle für `search_docs` geben oder nehmen. */
  jichiDokuFuerAgent(program: string, an: boolean): Promise<DokuStatus>;

  // ── Einrichten über jichi ──────────────────────────────────────────────────

  /** `jichi init --list`, roh. */
  jichiInitListe(program: string): Promise<JichiAusgabe>;
  /** `jichi init <packs…>` im Projekt; `probe`: nur `--dry-run`. Nur Packnamen gehen hinaus. */
  jichiInit(program: string, cwd: string, packs: string[], probe: boolean): Promise<JichiAusgabe>;

  // ── Erzeugte Dateien ───────────────────────────────────────────────────────
  fileInfo(cwd: string, path: string): Promise<FileInfo>;
  openFile(cwd: string, path: string): Promise<void>;
  revealFile(cwd: string, path: string): Promise<void>;
  /** Speichern-Dialog des Systems. `null`, wenn abgebrochen wurde. */
  pickSaveLocation(defaultName: string): Promise<string | null>;
  saveFileCopy(cwd: string, path: string, dest: string): Promise<void>;

  // ── Seitenleiste: der Projektordner ────────────────────────────────────────
  listDir(cwd: string, path: string): Promise<DirListing>;
  readText(cwd: string, path: string): Promise<TextFile>;
  /** Liefert die neue Änderungszeit. Scheitert, wenn die Datei inzwischen geändert wurde. */
  writeText(cwd: string, path: string, text: string, expectedModified: number | null): Promise<number>;
  readSheets(cwd: string, path: string): Promise<SheetPreview[]>;
  readDocumentPreview(cwd: string, path: string): Promise<string>;
  /** Den Projektordner für Bilder/PDF/HTML in der Vorschau freigeben (nur lesend). */
  allowProjectAssets(cwd: string): Promise<void>;
  /** Adresse, unter der die Vorschau eine Projektdatei laden kann. */
  assetUrl(absolutePath: string): string;

  // ── Änderungen (git) ───────────────────────────────────────────────────────
  gitChanges(cwd: string): Promise<GitState>;
  gitFileDiff(cwd: string, path: string): Promise<GitFileDiff>;

  // ── Terminal (PTY) ─────────────────────────────────────────────────────────
  ptyOpen(cwd: string, cols: number, rows: number): Promise<number>;
  ptyWrite(id: number, data: string): Promise<void>;
  ptyResize(id: number, cols: number, rows: number): Promise<void>;
  ptyClose(id: number): Promise<void>;
  onPty(output: (id: number, data: string) => void, exit: (id: number) => void): Promise<() => void>;

  // ── Browser ────────────────────────────────────────────────────────────────
  browserOpen(id: string, url: string, r: Rect): Promise<string>;
  browserBounds(id: string, r: Rect, visible: boolean): Promise<void>;
  browserNavigate(id: string, url: string): Promise<string>;
  browserGo(id: string, wohin: "back" | "forward" | "reload"): Promise<void>;
  browserClose(id: string): Promise<void>;
  onBrowser(f: (s: BrowserState) => void): Promise<() => void>;

  // ── Chats ──────────────────────────────────────────────────────────────────
  chatsMeta(): Promise<Record<string, ChatMeta>>;
  /** `rename`: ob `title` gilt — `null` entfernt den eigenen Namen. */
  chatMetaSet(id: string, rename: boolean, title: string | null, pinned: boolean | null): Promise<Record<string, ChatMeta>>;
  searchChats(query: string): Promise<ChatHit[]>;
  /** Speichern-Dialog mit Vorschlag und Endung. */
  pickExportLocation(defaultName: string, ext: ExportFormat): Promise<string | null>;
  exportChat(dest: string, format: ExportFormat, title: string, markdown: string): Promise<void>;

  // ── Ziehen und Ablegen, Mitteilungen ───────────────────────────────────────
  /** Dateien, die über dem Fenster losgelassen werden (echte Pfade). */
  onFileDrop(f: (e: { kind: "over" | "drop" | "leave"; paths: string[] }) => void): Promise<() => void>;
  readImage(path: string): Promise<{ mimeType: string; data: string }>;
  notify(title: string, body: string): Promise<void>;

  // ── jichis Einstellungen ───────────────────────────────────────────────────
  permissionsGet(): Promise<Permissions>;
  permissionsSet(allow: string[], deny: string[]): Promise<Permissions>;
  mcpList(): Promise<McpServerEntry[]>;
  mcpToggle(name: string, enable: boolean): Promise<McpServerEntry[]>;
  mcpAdd(name: string, command: string, args: string[]): Promise<McpServerEntry[]>;
  mcpRemove(name: string): Promise<McpServerEntry[]>;
  mcpTest(program: string, env: EnvSpec[]): Promise<string>;

  // ── Artefakte ──────────────────────────────────────────────────────────────
  artifactPut(id: string, lang: string, title: string, code: string): Promise<void>;
  /** Adresse eines abgelegten Artefakts für das iframe. */
  artifactUrl(id: string): string;
}

interface LineEvent {
  generation: number;
  line: string;
}

interface ExitEvent {
  generation: number;
  code: number | null;
}

function fail(cause: unknown): never {
  throw cause instanceof Error ? cause : new Error(String(cause));
}

export const tauriTransport: Transport = {
  defaultLaunch: () => invoke<LaunchSuggestion>("default_launch").catch(fail),

  probe: (program) => invoke<string>("probe", { program }).catch(fail),

  sessions: () => invoke<StoredSession[]>("sessions").catch(fail),
  deleteSession: (sessionId) => invoke<void>("delete_session", { sessionId }).catch(fail),

  start: ({ program, args, cwd, env }) =>
    invoke<number>("acp_start", {
      program,
      args,
      cwd: cwd ?? null,
      env: env ?? [],
    }).catch(fail),

  send: (line) => invoke<void>("acp_send", { line }).catch(fail),

  stop: () => invoke<void>("acp_stop").catch(fail),

  running: () => invoke<boolean>("acp_running").catch(fail),

  readiness: (program) => invoke<Readiness>("readiness", { program: program ?? null }).catch(fail),

  doctor: (program, env) => invoke<DoctorReport>("doctor", { program, env }).catch(fail),

  writeConfig: (preset, program) => invoke<ConfigReport>("write_config", { preset, program }).catch(fail),

  secretStore: (account, value) =>
    invoke<void>("secret_store", { account, value }).catch(fail),

  secretPresent: (account) => invoke<boolean>("secret_present", { account }).catch(fail),

  secretForget: (account) => invoke<void>("secret_forget", { account }).catch(fail),

  async pickDirectory(title) {
    const picked = await open({ directory: true, multiple: false, title }).catch(fail);
    return typeof picked === "string" ? picked : null;
  },

  gatewayModels: () => invoke<GatewayReport>("gateway_models").catch(fail),

  // Die Aufnahme geht als rohe Bytes, nicht als JSON-Zahlenliste: eine Minute
  // Sprache sind rund ein Megabyte.
  transcribe: (audio, mime, model, language) =>
    invoke<string>("speech_transcribe", audio, {
      headers: { "x-mime": mime, "x-model": model, "x-language": language ?? "" },
    }).catch(fail),

  speak: (text, model, voice) =>
    invoke<ArrayBuffer>("speech_speak", { text, model, voice: voice ?? null }).catch(fail),

  readWorkspaceFile: (cwd, path) =>
    invoke<string | null>("read_workspace_file", { cwd, path }).catch(fail),

  // Unter Windows läuft jichi in WSL: ein Befehl gehört dort hinein, nicht in
  // die Windows-Shell dieser Anwendung.
  terminals: !/Windows/i.test(typeof navigator === "undefined" ? "" : navigator.userAgent),
  termCreate: ({ command, args, cwd, outputByteLimit }) =>
    invoke<string>("term_create", {
      command,
      args: args ?? [],
      cwd: cwd ?? null,
      outputByteLimit: outputByteLimit ?? null,
    }).catch(fail),
  termOutput: (terminalId) => invoke<TermOutput>("term_output", { terminalId }).catch(fail),
  termWait: (terminalId) => invoke<TermExit>("term_wait", { terminalId }).catch(fail),
  termKill: (terminalId) => invoke<void>("term_kill", { terminalId }).catch(fail),
  termRelease: (terminalId) => invoke<void>("term_release", { terminalId }).catch(fail),

  readAttachment: (path) => invoke<FileAttachment>("read_attachment", { path }).catch(fail),
  documentsStatus: () => invoke<DocumentsStatus>("documents_status").catch(fail),

  jichiDokuStatus: (program) => invoke<DokuStatus>("jichi_doku_status", { program }).catch(fail),
  jichiDokuPfad: (program, pfad) => invoke<DokuStatus>("jichi_doku_pfad", { program, pfad }).catch(fail),
  jichiDokuListe: (program) => invoke<string[]>("jichi_doku_liste", { program }).catch(fail),
  jichiDokuLesen: (program, seite) => invoke<string>("jichi_doku_lesen", { program, seite }).catch(fail),
  jichiDokuSuchen: (program, anfrage) => invoke<DokuTreffer[]>("jichi_doku_suchen", { program, anfrage }).catch(fail),
  jichiDokuFuerAgent: (program, an) => invoke<DokuStatus>("jichi_doku_fuer_agent", { program, an }).catch(fail),
  jichiInitListe: (program) => invoke<JichiAusgabe>("jichi_init_liste", { program }).catch(fail),
  jichiInit: (program, cwd, packs, probe) => invoke<JichiAusgabe>("jichi_init", { program, cwd, packs, probe }).catch(fail),
  fileInfo: (cwd, path) => invoke<FileInfo>("file_info", { cwd, path }).catch(fail),
  listDir: (cwd, path) => invoke<DirListing>("list_dir", { cwd, path }).catch(fail),
  readText: (cwd, path) => invoke<TextFile>("read_text", { cwd, path }).catch(fail),
  writeText: (cwd, path, text, expectedModified) =>
    invoke<number>("write_text", { cwd, path, text, expectedModified }).catch(fail),
  readSheets: (cwd, path) => invoke<SheetPreview[]>("read_sheets", { cwd, path }).catch(fail),
  readDocumentPreview: (cwd, path) => invoke<string>("read_document_preview", { cwd, path }).catch(fail),
  allowProjectAssets: (cwd) => invoke<void>("allow_project_assets", { cwd }).catch(fail),
  assetUrl: (p) => convertFileSrc(p),

  gitChanges: (cwd) => invoke<GitState>("git_changes", { cwd }).catch(fail),
  gitFileDiff: (cwd, path) => invoke<GitFileDiff>("git_file_diff", { cwd, path }).catch(fail),

  ptyOpen: (cwd, cols, rows) => invoke<number>("pty_open", { cwd, cols, rows }).catch(fail),
  ptyWrite: (id, data) => invoke<void>("pty_write", { id, data }).catch(fail),
  ptyResize: (id, cols, rows) => invoke<void>("pty_resize", { id, cols, rows }).catch(fail),
  ptyClose: (id) => invoke<void>("pty_close", { id }).catch(fail),
  async onPty(output, exit) {
    const offs = await Promise.all([
      listen<{ id: number; data: string }>("pty-output", (e) => output(e.payload.id, e.payload.data)),
      listen<{ id: number }>("pty-exit", (e) => exit(e.payload.id)),
    ]);
    return () => offs.forEach((o) => o());
  },

  browserOpen: (id, url, r) => invoke<string>("browser_open", { id, url, ...r }).catch(fail),
  browserBounds: (id, r, visible) => invoke<void>("browser_bounds", { id, ...r, visible }).catch(fail),
  browserNavigate: (id, url) => invoke<string>("browser_navigate", { id, url }).catch(fail),
  browserGo: (id, wohin) => invoke<void>("browser_go", { id, wohin }).catch(fail),
  browserClose: (id) => invoke<void>("browser_close", { id }).catch(fail),
  async onBrowser(f) {
    return listen<BrowserState>("browser-stand", (e) => f(e.payload));
  },

  chatsMeta: () => invoke<Record<string, ChatMeta>>("chats_meta").catch(fail),
  chatMetaSet: (id, rename, title, pinned) =>
    invoke<Record<string, ChatMeta>>("chat_meta_set", { id, rename, title, pinned }).catch(fail),
  searchChats: (query) => invoke<ChatHit[]>("search_chats", { query }).catch(fail),
  async pickExportLocation(defaultName, ext) {
    const names: Record<ExportFormat, string> = { md: "Markdown", docx: "Word", pdf: "PDF" };
    const picked = await save({ defaultPath: defaultName, title: t("Chat exportieren"), filters: [{ name: names[ext], extensions: [ext] }] }).catch(fail);
    return typeof picked === "string" ? picked : null;
  },
  exportChat: (dest, format, title, markdown) => invoke<void>("export_chat", { dest, format, title, markdown }).catch(fail),

  async onFileDrop(f) {
    const { getCurrentWebview } = await import("@tauri-apps/api/webview");
    return getCurrentWebview().onDragDropEvent((e) => {
      const p = e.payload;
      if (p.type === "over" || p.type === "enter") f({ kind: "over", paths: "paths" in p ? p.paths : [] });
      else if (p.type === "drop") f({ kind: "drop", paths: p.paths });
      else f({ kind: "leave", paths: [] });
    });
  },
  readImage: (path) => invoke<{ mimeType: string; data: string }>("read_image", { path }).catch(fail),
  async notify(title, body) {
    const n = await import("@tauri-apps/plugin-notification");
    let ok = await n.isPermissionGranted();
    if (!ok) ok = (await n.requestPermission()) === "granted";
    if (ok) n.sendNotification({ title, body });
  },

  permissionsGet: () => invoke<Permissions>("permissions_get").catch(fail),
  permissionsSet: (allow, deny) => invoke<Permissions>("permissions_set", { allow, deny }).catch(fail),
  mcpList: () => invoke<McpServerEntry[]>("mcp_list").catch(fail),
  mcpToggle: (name, enable) => invoke<McpServerEntry[]>("mcp_toggle", { name, enable }).catch(fail),
  mcpAdd: (name, command, args) => invoke<McpServerEntry[]>("mcp_add", { name, command, args }).catch(fail),
  mcpRemove: (name) => invoke<McpServerEntry[]>("mcp_remove", { name }).catch(fail),
  mcpTest: (program, env) => invoke<string>("mcp_test", { program, env }).catch(fail),

  artifactPut: (id, lang, title, code) => invoke<void>("artifact_put", { id, lang, title, code }).catch(fail),
  // Unter Windows heisst ein eigenes Schema http://<name>.localhost.
  artifactUrl: (id) =>
    /Windows/i.test(typeof navigator === "undefined" ? "" : navigator.userAgent)
      ? `http://artefakt.localhost/${id}`
      : `artefakt://localhost/${id}`,
  openFile: (cwd, path) => invoke<void>("open_file", { cwd, path }).catch(fail),
  revealFile: (cwd, path) => invoke<void>("reveal_file", { cwd, path }).catch(fail),
  saveFileCopy: (cwd, path, dest) => invoke<void>("save_file_copy", { cwd, path, dest }).catch(fail),
  async pickSaveLocation(defaultName) {
    const picked = await save({ defaultPath: defaultName, title: t("Kopie speichern") }).catch(fail);
    return typeof picked === "string" ? picked : null;
  },
  documentsSet: (enable) => invoke<DocumentsStatus>("documents_set", { enable }).catch(fail),

  async openUrl(url) {
    if (!/^https?:\/\//i.test(url)) throw new Error(t("Nur http- und https-Verweise werden geöffnet."));
    await openExternal(url).catch(fail);
  },

  async pickFile(title) {
    const picked = await open({ directory: false, multiple: false, title }).catch(fail);
    return typeof picked === "string" ? picked : null;
  },

  async listen(events) {
    const unlisten = await Promise.all([
      listen<LineEvent>("acp-line", (e) => events.line(e.payload.generation, e.payload.line)),
      listen<LineEvent>("acp-stderr", (e) => events.stderr(e.payload.generation, e.payload.line)),
      listen<ExitEvent>("acp-exit", (e) => events.exit(e.payload.generation, e.payload.code)),
      listen<{ terminalId: string; chunk: string }>("term-output", (e) =>
        events.termOutput(e.payload.terminalId, e.payload.chunk),
      ),
      listen<{ terminalId: string; exitStatus: TermExit }>("term-exit", (e) =>
        events.termExit(e.payload.terminalId, e.payload.exitStatus),
      ),
    ]);
    return () => unlisten.forEach((off) => off());
  },
};
