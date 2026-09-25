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

/** Eine Umgebungsvariable für den Agenten. `file` ist der Weg für Geheimnisse:
 *  diese Anwendung speichert nur den Pfad, gelesen wird erst beim Start. */
export interface EnvSpec {
  name: string;
  value?: string;
  file?: string;
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
  env: Array<{ name: string; file: string }>;
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

  async listen(events) {
    const unlisten = await Promise.all([
      listen<LineEvent>("acp-line", (e) => events.line(e.payload.generation, e.payload.line)),
      listen<LineEvent>("acp-stderr", (e) => events.stderr(e.payload.generation, e.payload.line)),
      listen<ExitEvent>("acp-exit", (e) => events.exit(e.payload.generation, e.payload.code)),
    ]);
    return () => unlisten.forEach((off) => off());
  },
};
