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
import { open } from "@tauri-apps/plugin-dialog";

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
}

export interface Transport {
  defaultLaunch(): Promise<LaunchSuggestion>;
  probe(program: string): Promise<string>;
  sessions(): Promise<StoredSession[]>;
  /** Startet den Agenten und liefert die Generation dieses Kindes. */
  start(spec: SpawnSpec): Promise<number>;
  send(line: string): Promise<void>;
  stop(): Promise<void>;
  running(): Promise<boolean>;
  /** Hört auf die Ereignisse des Kindes. Der Rückgabewert löst die Bindung. */
  listen(events: TransportEvents): Promise<() => void>;

  // ── Erster Start ───────────────────────────────────────────────────────────

  readiness(): Promise<Readiness>;
  /** Der Agent prüft sich selbst: Schlüssel, Server, Modelle, Kontextfenster. */
  doctor(program: string, env: EnvSpec[]): Promise<DoctorReport>;
  /** Legt die Konfiguration des Agenten an. Scheitert, wenn es sie schon gibt. */
  writeConfig(preset: string): Promise<ConfigReport>;
  /** Legt ein Geheimnis im Schlüsselbund ab. Es kommt nie wieder hierher zurück. */
  secretStore(account: string, value: string): Promise<void>;
  secretPresent(account: string): Promise<boolean>;
  secretForget(account: string): Promise<void>;
  /** Ordnerauswahl des Betriebssystems. `null`, wenn abgebrochen wurde. */
  pickDirectory(title: string): Promise<string | null>;
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

  readiness: () => invoke<Readiness>("readiness").catch(fail),

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

  async listen(events) {
    const unlisten = await Promise.all([
      listen<LineEvent>("acp-line", (e) => events.line(e.payload.generation, e.payload.line)),
      listen<LineEvent>("acp-stderr", (e) => events.stderr(e.payload.generation, e.payload.line)),
      listen<ExitEvent>("acp-exit", (e) => events.exit(e.payload.generation, e.payload.code)),
    ]);
    return () => unlisten.forEach((off) => off());
  },
};
