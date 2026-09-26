/**
 * Das Ansichtsmodell und die reinen Übergänge darauf.
 *
 * Hier wird aus Protokolldaten das, was eine Oberfläche zeichnen kann — und nur
 * das. Keine DOM-Berührung, kein Framework, keine Nebenwirkung: jede Funktion
 * nimmt einen Zustand und liefert einen neuen. Das hat zwei Folgen, die beide
 * gewollt sind: React (oder was sonst) kann `getSnapshot` flach vergleichen, und
 * der ganze Ablauf eines Gesprächs ist ohne Fenster prüfbar.
 */

import type {
  AgentCapabilities,
  ContentBlock,
  PermissionOption,
  ToolCallContent,
  ToolCallProgressUpdate,
  ToolCallUpdate,
  ToolKind,
  ToolStatus,
} from "./protocol.ts";
import type {
  DocumentsStatus,
  DoctorReport,
  GatewayModel,
  Readiness,
  StoredSession,
  TermExit,
} from "./transport.ts";
import { t } from "./i18n.ts";

/**
 * Obergrenze für die gespeicherte Ausgabe eines Werkzeugs.
 *
 * Ein `run_terminal_command` auf ein großes Projekt liefert Megabytes. Ungekappt
 * wandert das in den Zustand, von dort in den DOM und die Anwendung friert bei
 * genau der Gelegenheit ein, bei der man sie herzeigt. Gekappt wird am Anfang
 * behalten: dort steht, was das Werkzeug getan hat.
 */
export const MAX_TOOL_OUTPUT = 64 * 1024;

/** Obergrenze für den stderr-Ringpuffer. */
export const MAX_DIAGNOSTICS = 200;

export type Status = "offline" | "starting" | "ready" | "busy" | "cancelling" | "error";

export type MessageRole = "user" | "agent" | "thought";

export interface MessageItem {
  kind: "message";
  id: string;
  role: MessageRole;
  text: string;
  /** Solange `true`, kann Text nachwachsen — die Oberfläche darf einen Cursor zeigen. */
  streaming: boolean;
  /** Mitgeschickte Bilder als `data:`-Verweise, nur bei eigenen Nachrichten. */
  images?: string[];
  /** Namen mitgeschickter Dateien, nur bei eigenen Nachrichten. */
  files?: string[];
  /** Wann die Nachricht begann (ms). Fehlt bei Wiedergaben aus dem Speicher. */
  at?: number;
}

export interface ToolDiff {
  path: string;
  oldText: string | null;
  newText: string;
}

export interface ToolItem {
  kind: "tool";
  id: string;
  toolCallId: string;
  title: string;
  toolKind: ToolKind;
  status: ToolStatus;
  output: string;
  truncated: boolean;
  diffs: ToolDiff[];
  rawInput?: unknown;
  /** Läuft der Befehl in einem Terminal dieser Anwendung, dessen Kennung. */
  terminalId?: string;
}

/** Was ein Terminal des Agenten bisher geschrieben hat. */
export interface TerminalView {
  output: string;
  truncated: boolean;
  exit: TermExit | null;
}

/** Wie der Agent arbeitet. `auto` führt Änderungen ohne Rückfrage aus. */
export type AgentMode = "chat" | "plan" | "auto";

export interface GatewayState {
  base: string | null;
  models: GatewayModel[];
  loading: boolean;
  error: string | null;
}

export interface NoticeItem {
  kind: "notice";
  id: string;
  level: "info" | "warning" | "error";
  text: string;
}

export type TranscriptItem = MessageItem | ToolItem | NoticeItem;

export interface PendingPermission {
  /** Die JSON-RPC-Id der Anfrage. Die Antwort muss sie tragen. */
  requestId: number | string;
  toolCallId: string;
  title: string;
  toolKind: ToolKind;
  options: PermissionOption[];
}

export interface Snapshot {
  status: Status;
  /** Gesetzt, solange `status === "error"`. Fertiger Text, keine Kennung. */
  error: string | null;
  sessionId: string | null;
  cwd: string | null;
  /** Erste Zeile von `jichi --version`, falls geprüft. */
  agentVersion: string | null;
  capabilities: AgentCapabilities | null;
  transcript: readonly TranscriptItem[];
  /** Eine offene Berechtigungsfrage. Der Agent *blockiert*, bis sie beantwortet ist. */
  permission: PendingPermission | null;
  /** Gespeicherte Sitzungen für die Seitenleiste, neueste zuerst. */
  sessions: readonly StoredSession[];
  /** stderr des Agenten, jüngste zuletzt. Diagnose, nicht Protokoll. */
  diagnostics: readonly string[];
  /** Bereitschaft des Rechners. `null`, solange die Antwort aussteht. */
  readiness: Readiness | null;
  /** Der letzte Selbstbericht des Agenten (`doctor`), oder `null`. */
  health: DoctorReport | null;
  /** Ausgabe der Terminals, nach Kennung. Getrennt vom Verlauf, weil sie je Zeile wächst. */
  terminals: Readonly<Record<string, TerminalView>>;
  /** Gewähltes Modell (`--model`), `null` für das der Konfiguration. */
  model: string | null;
  mode: AgentMode;
  /** Was der Schlüssel am Gateway erreicht, `null` solange nicht gefragt. */
  gateway: GatewayState | null;
  /** Das aktive Modell liest Bilder — nur dann dürfen welche mit. */
  canAttachImages: boolean;
  /** PDF, Word, Excel für den Agenten. `null`, solange nicht gefragt. */
  documents: DocumentsStatus | null;
  /**
   * Der erste Start ist nötig. Bleibt `false`, solange `readiness` aussteht —
   * sonst blitzt der Einrichtungsbildschirm bei jedem Programmstart kurz auf.
   */
  needsSetup: boolean;
  /**
   * Die Einrichtung hat einen Schlüssel abgelegt, aber `doctor` meldet Fehler.
   * Dann bleibt der Einrichtungsbildschirm offen, statt mit einem Zugang in die
   * Anwendung zu führen, der beim ersten Zug scheitert.
   */
  setupHold: boolean;
  /** Das Heimatverzeichnis — dort steht der Agent, solange kein Projekt offen ist. */
  home: string | null;
  /** Ein Projektordner ist gewählt (nicht bloss das Heimatverzeichnis). */
  hasProject: boolean;
  canSend: boolean;
  canCancel: boolean;
  /**
   * Chat wechseln, neuen beginnen, Projekt öffnen. Nicht während eines Zuges:
   * jichi liest in dieser Zeit keine anderen Anfragen, und eine neue Sitzung
   * würde nie beantwortet.
   */
  canSwitch: boolean;
}

export function emptySnapshot(): Snapshot {
  return {
    status: "offline",
    error: null,
    sessionId: null,
    cwd: null,
    agentVersion: null,
    capabilities: null,
    transcript: [],
    permission: null,
    sessions: [],
    diagnostics: [],
    readiness: null,
    health: null,
    terminals: {},
    model: null,
    mode: "chat",
    gateway: null,
    canAttachImages: false,
    documents: null,
    needsSetup: false,
    setupHold: false,
    home: null,
    hasProject: false,
    // Erst wenn die Bereitschaft bekannt ist (siehe `withDerived`).
    canSend: false,
    canCancel: false,
    canSwitch: true,
  };
}

/**
 * Die abgeleiteten Schalter an einer Stelle, damit keine Oberfläche sie neu
 * erfindet und dabei einen Fall vergisst.
 *
 * `canSend` gilt auch offline: Senden baut die Verbindung selbst auf, das ist
 * für den Benutzer ein Schritt weniger. `canCancel` gilt auch bei offener
 * Berechtigungsfrage, denn genau dort wartet der Agent am längsten.
 */
export function withDerived(state: Snapshot): Snapshot {
  // Solange die Bereitschaft aussteht, ist nichts bekannt — also auch nicht,
  // dass gesendet werden darf.
  const known = state.readiness !== null;
  const needsSetup = (state.readiness?.needsSetup ?? false) || state.setupHold;
  // Solange etwas fehlt, darf nicht gesendet werden: ein Start ohne Schlüssel
  // oder ohne Konfiguration sieht aus wie ein Defekt und ist keiner. Nach
  // einem Fehler darf es erneut versucht werden.
  const canSend =
    known &&
    !needsSetup &&
    state.permission === null &&
    (state.status === "ready" || state.status === "offline" || state.status === "error");
  const canCancel =
    state.status === "busy" || state.status === "cancelling" || state.permission !== null;
  const canSwitch =
    !needsSetup &&
    state.permission === null &&
    state.status !== "busy" &&
    state.status !== "cancelling" &&
    state.status !== "starting";
  const hasProject = !!state.cwd && state.cwd !== state.home;
  const canAttachImages = state.capabilities?.promptCapabilities?.image === true;
  if (
    canAttachImages === state.canAttachImages &&
    canSend === state.canSend &&
    canCancel === state.canCancel &&
    canSwitch === state.canSwitch &&
    hasProject === state.hasProject &&
    needsSetup === state.needsSetup
  ) {
    return state;
  }
  return { ...state, canSend, canCancel, canSwitch, hasProject, needsSetup, canAttachImages };
}

// ── Inhalte zu Text ──────────────────────────────────────────────────────────

/** Ein Inhaltsblock als Text. Unbekannte Typen ergeben eine Marke, nie `undefined`. */
export function blockToText(block: ContentBlock | undefined | null): string {
  if (!block || typeof block !== "object") return "";
  switch (block.type) {
    case "text":
      return block.text ?? "";
    case "image":
      return t("[Bild {typ}]", { typ: block.mimeType ?? t("unbekannt") });
    case "audio":
      return t("[Audio {typ}]", { typ: block.mimeType ?? t("unbekannt") });
    case "resource":
      return block.resource?.text ?? t("[Ressource {uri}]", { uri: block.resource?.uri ?? "?" });
    case "resource_link":
      return t("[Verweis {name}]", { name: block.name ?? block.uri });
    case "terminal":
      return `[Terminal ${block.terminalId}]`;
    default:
      return `[${(block as { type?: string }).type ?? t("unbekannt")}]`;
  }
}

/**
 * Die Ausgabe eines Werkzeugs auftrennen: Text in den Block, Diffs in die Liste.
 *
 * Toleranz mit Absicht — der Agent verpackt Ausgaben als `{type:"content",
 * content:<block>}`, das Protokoll erlaubt aber auch den Block selbst. Beide
 * Formen werden gelesen, damit eine Version des Agenten nicht die Anzeige leert.
 */
export function splitToolContent(entries: ToolCallContent[] | undefined): {
  text: string;
  diffs: ToolDiff[];
  terminalId?: string;
} {
  if (!Array.isArray(entries)) return { text: "", diffs: [] };

  const parts: string[] = [];
  const diffs: ToolDiff[] = [];
  let terminalId: string | undefined;

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;

    // Ein Terminal ist kein Text: seine Ausgabe kommt eigens (siehe `terminals`).
    const block = (entry.content ?? entry) as { type?: string; terminalId?: unknown };
    if (block.type === "terminal" && typeof block.terminalId === "string") {
      terminalId = block.terminalId;
      continue;
    }

    if (entry.type === "diff" && typeof entry.path === "string") {
      diffs.push({
        path: entry.path,
        oldText: entry.oldText ?? null,
        newText: entry.newText ?? "",
      });
      continue;
    }
    if (entry.content) {
      parts.push(blockToText(entry.content));
      continue;
    }
    // Der Block kam ohne Hülle.
    const bare = entry as unknown as ContentBlock;
    if (typeof (bare as { type?: unknown }).type === "string") {
      parts.push(blockToText(bare));
    }
  }

  return { text: parts.filter(Boolean).join("\n"), diffs, terminalId };
}

function capped(text: string): { output: string; truncated: boolean } {
  if (text.length <= MAX_TOOL_OUTPUT) return { output: text, truncated: false };
  return { output: text.slice(0, MAX_TOOL_OUTPUT), truncated: true };
}

// ── Übergänge auf dem Verlauf ────────────────────────────────────────────────

/**
 * Einen Textschnipsel anhängen. Gehört er zur selben, noch laufenden Rolle,
 * wächst die vorhandene Nachricht — sonst beginnt eine neue.
 *
 * Ohne dieses Zusammenfassen bekäme die Oberfläche pro Modell-Token einen
 * eigenen Eintrag: tausende Knoten für eine Antwort.
 */
export function appendChunk(
  items: readonly TranscriptItem[],
  role: MessageRole,
  text: string,
  newId: string,
  at?: number,
): readonly TranscriptItem[] {
  if (!text) return items;

  const last = items[items.length - 1];
  if (last?.kind === "message" && last.role === role && last.streaming) {
    const grown: MessageItem = { ...last, text: last.text + text };
    return [...items.slice(0, -1), grown];
  }
  const fresh: MessageItem = { kind: "message", id: newId, role, text, streaming: true, at };
  return [...items, fresh];
}

/** Eine abgeschlossene Nachricht anhängen (eigene Eingabe, Wiedergabe). */
export function pushMessage(
  items: readonly TranscriptItem[],
  role: MessageRole,
  text: string,
  newId: string,
  at?: number,
): readonly TranscriptItem[] {
  return [...items, { kind: "message", id: newId, role, text, streaming: false, at }];
}

export function pushNotice(
  items: readonly TranscriptItem[],
  level: NoticeItem["level"],
  text: string,
  newId: string,
): readonly TranscriptItem[] {
  return [...items, { kind: "notice", id: newId, level, text }];
}

/** Kein Text wächst mehr nach: das Ende eines Zuges. */
export function finalizeStreaming(
  items: readonly TranscriptItem[],
): readonly TranscriptItem[] {
  let touched = false;
  const next = items.map((item) => {
    if (item.kind === "message" && item.streaming) {
      touched = true;
      return { ...item, streaming: false };
    }
    return item;
  });
  return touched ? next : items;
}

/** Ein Werkzeug beginnt. */
export function applyToolCall(
  items: readonly TranscriptItem[],
  update: ToolCallUpdate,
  newId: string,
): readonly TranscriptItem[] {
  const { text, diffs, terminalId } = splitToolContent(update.content);
  const { output, truncated } = capped(text);
  const item: ToolItem = {
    terminalId,
    kind: "tool",
    id: newId,
    toolCallId: update.toolCallId,
    title: update.title?.trim() || update.toolCallId,
    toolKind: update.kind ?? "other",
    status: update.status ?? "in_progress",
    output,
    truncated,
    diffs,
    rawInput: update.rawInput,
  };

  // Derselbe Aufruf zweimal: ersetzen, nicht verdoppeln.
  const at = items.findIndex(
    (i) => i.kind === "tool" && i.toolCallId === update.toolCallId,
  );
  if (at >= 0) {
    const existing = items[at] as ToolItem;
    const merged: ToolItem = { ...item, id: existing.id };
    return [...items.slice(0, at), merged, ...items.slice(at + 1)];
  }
  return [...items, item];
}

/**
 * Ein Werkzeug meldet Fortschritt oder Ende.
 *
 * Kommt die Meldung zu einem unbekannten Aufruf, wird der Eintrag erzeugt: eine
 * verlorene `tool_call`-Benachrichtigung soll die Ausgabe nicht verschlucken.
 */
export function applyToolUpdate(
  items: readonly TranscriptItem[],
  update: ToolCallProgressUpdate,
  newId: string,
): readonly TranscriptItem[] {
  const at = items.findIndex(
    (i) => i.kind === "tool" && i.toolCallId === update.toolCallId,
  );
  const { text, diffs, terminalId } = splitToolContent(update.content);

  if (at < 0) {
    return applyToolCall(
      items,
      {
        sessionUpdate: "tool_call",
        toolCallId: update.toolCallId,
        title: update.title,
        kind: update.kind,
        status: update.status ?? "completed",
        content: update.content,
      },
      newId,
    );
  }

  const existing = items[at] as ToolItem;
  const joined = [existing.output, text].filter(Boolean).join("\n");
  const { output, truncated } = capped(joined);

  const merged: ToolItem = {
    ...existing,
    title: update.title?.trim() || existing.title,
    toolKind: update.kind ?? existing.toolKind,
    status: update.status ?? existing.status,
    output,
    truncated: existing.truncated || truncated,
    diffs: diffs.length ? [...existing.diffs, ...diffs] : existing.diffs,
    terminalId: terminalId ?? existing.terminalId,
  };
  return [...items.slice(0, at), merged, ...items.slice(at + 1)];
}

/**
 * Ausgabe eines Terminals anhängen. Gekappt wird hier am **Anfang**, anders als
 * bei Werkzeugausgaben: bei einem laufenden Befehl zählt, was er zuletzt schrieb.
 */
export function appendTerminal(
  terminals: Readonly<Record<string, TerminalView>>,
  terminalId: string,
  chunk: string,
): Readonly<Record<string, TerminalView>> {
  const prev = terminals[terminalId] ?? { output: "", truncated: false, exit: null };
  let output = prev.output + chunk;
  let truncated = prev.truncated;
  if (output.length > MAX_TOOL_OUTPUT) {
    output = output.slice(output.length - MAX_TOOL_OUTPUT);
    truncated = true;
  }
  return { ...terminals, [terminalId]: { ...prev, output, truncated } };
}

export function finishTerminal(
  terminals: Readonly<Record<string, TerminalView>>,
  terminalId: string,
  exit: TermExit,
): Readonly<Record<string, TerminalView>> {
  const prev = terminals[terminalId] ?? { output: "", truncated: false, exit: null };
  return { ...terminals, [terminalId]: { ...prev, exit } };
}

/** Ein noch laufendes Werkzeug kann nach einem Abbruch nicht mehr fertig werden. */
export function failRunningTools(
  items: readonly TranscriptItem[],
): readonly TranscriptItem[] {
  let touched = false;
  const next = items.map((item) => {
    if (item.kind === "tool" && (item.status === "in_progress" || item.status === "pending")) {
      touched = true;
      return { ...item, status: "failed" as ToolStatus };
    }
    return item;
  });
  return touched ? next : items;
}

export function pushDiagnostic(
  lines: readonly string[],
  line: string,
): readonly string[] {
  const next = [...lines, line];
  return next.length > MAX_DIAGNOSTICS ? next.slice(next.length - MAX_DIAGNOSTICS) : next;
}
