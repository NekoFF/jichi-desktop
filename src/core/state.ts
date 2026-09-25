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
import type { DoctorReport, Readiness, StoredSession } from "./transport.ts";

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
  /**
   * Der erste Start ist nötig. Bleibt `false`, solange `readiness` aussteht —
   * sonst blitzt der Einrichtungsbildschirm bei jedem Programmstart kurz auf.
   */
  needsSetup: boolean;
  canSend: boolean;
  canCancel: boolean;
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
    needsSetup: false,
    canSend: true,
    canCancel: false,
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
  const needsSetup = state.readiness?.needsSetup ?? false;
  // Solange etwas fehlt, darf nicht gesendet werden: ein Start ohne Schlüssel
  // oder ohne Konfiguration sieht aus wie ein Defekt und ist keiner.
  const canSend = !needsSetup && (state.status === "ready" || state.status === "offline");
  const canCancel =
    state.status === "busy" || state.status === "cancelling" || state.permission !== null;
  if (
    canSend === state.canSend &&
    canCancel === state.canCancel &&
    needsSetup === state.needsSetup
  ) {
    return state;
  }
  return { ...state, canSend, canCancel, needsSetup };
}

// ── Inhalte zu Text ──────────────────────────────────────────────────────────

/** Ein Inhaltsblock als Text. Unbekannte Typen ergeben eine Marke, nie `undefined`. */
export function blockToText(block: ContentBlock | undefined | null): string {
  if (!block || typeof block !== "object") return "";
  switch (block.type) {
    case "text":
      return block.text ?? "";
    case "image":
      return `[Bild ${block.mimeType ?? "unbekannt"}]`;
    case "audio":
      return `[Audio ${block.mimeType ?? "unbekannt"}]`;
    case "resource":
      return block.resource?.text ?? `[Ressource ${block.resource?.uri ?? "?"}]`;
    case "resource_link":
      return `[Verweis ${block.name ?? block.uri}]`;
    case "terminal":
      return `[Terminal ${block.terminalId}]`;
    default:
      return `[${(block as { type?: string }).type ?? "unbekannt"}]`;
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
} {
  if (!Array.isArray(entries)) return { text: "", diffs: [] };

  const parts: string[] = [];
  const diffs: ToolDiff[] = [];

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;

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

  return { text: parts.filter(Boolean).join("\n"), diffs };
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
): readonly TranscriptItem[] {
  if (!text) return items;

  const last = items[items.length - 1];
  if (last?.kind === "message" && last.role === role && last.streaming) {
    const grown: MessageItem = { ...last, text: last.text + text };
    return [...items.slice(0, -1), grown];
  }
  const fresh: MessageItem = { kind: "message", id: newId, role, text, streaming: true };
  return [...items, fresh];
}

/** Eine abgeschlossene Nachricht anhängen (eigene Eingabe, Wiedergabe). */
export function pushMessage(
  items: readonly TranscriptItem[],
  role: MessageRole,
  text: string,
  newId: string,
): readonly TranscriptItem[] {
  return [...items, { kind: "message", id: newId, role, text, streaming: false }];
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
  const { text, diffs } = splitToolContent(update.content);
  const { output, truncated } = capped(text);
  const item: ToolItem = {
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
  const { text, diffs } = splitToolContent(update.content);

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
  };
  return [...items.slice(0, at), merged, ...items.slice(at + 1)];
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
