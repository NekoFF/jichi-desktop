/**
 * Der Transport — die einzige Stelle, die Tauri kennt.
 *
 * Alles darüber arbeitet gegen das `Transport`-Interface. Das ist nicht
 * Architektur um ihrer selbst willen: so lässt sich der gesamte Protokollteil
 * gegen einen erfundenen Agenten prüfen, ohne Fenster, ohne Kindprozess und
 * ohne installiertes jichi.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openUrl as openExternal } from "@tauri-apps/plugin-opener";

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
  writeConfig(preset: string): Promise<ConfigReport>;
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

  // ── Erzeugte Dateien ───────────────────────────────────────────────────────
  fileInfo(cwd: string, path: string): Promise<FileInfo>;
  openFile(cwd: string, path: string): Promise<void>;
  revealFile(cwd: string, path: string): Promise<void>;
  /** Speichern-Dialog des Systems. `null`, wenn abgebrochen wurde. */
  pickSaveLocation(defaultName: string): Promise<string | null>;
  saveFileCopy(cwd: string, path: string, dest: string): Promise<void>;
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

  writeConfig: (preset) => invoke<ConfigReport>("write_config", { preset }).catch(fail),

  secretStore: (account, value) =>
    invoke<void>("secret_store", { account, value }).catch(fail),

  secretPresent: (account) => invoke<boolean>("secret_present", { account }).catch(fail),

  secretForget: (account) => invoke<void>("secret_forget", { account }).catch(fail),

  async pickDirectory(title) {
    const picked = await open({ directory: true, multiple: false, title }).catch(fail);
    return typeof picked === "string" ? picked : null;
  },

  gatewayModels: () => invoke<GatewayReport>("gateway_models").catch(fail),

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
  fileInfo: (cwd, path) => invoke<FileInfo>("file_info", { cwd, path }).catch(fail),
  openFile: (cwd, path) => invoke<void>("open_file", { cwd, path }).catch(fail),
  revealFile: (cwd, path) => invoke<void>("reveal_file", { cwd, path }).catch(fail),
  saveFileCopy: (cwd, path, dest) => invoke<void>("save_file_copy", { cwd, path, dest }).catch(fail),
  async pickSaveLocation(defaultName) {
    const picked = await save({ defaultPath: defaultName, title: "Kopie speichern" }).catch(fail);
    return typeof picked === "string" ? picked : null;
  },
  documentsSet: (enable) => invoke<DocumentsStatus>("documents_set", { enable }).catch(fail),

  async openUrl(url) {
    if (!/^https?:\/\//i.test(url)) throw new Error("Nur http- und https-Verweise werden geöffnet.");
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
