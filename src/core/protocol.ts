/**
 * Agent Client Protocol — die Typen, die jichi tatsächlich spricht.
 *
 * Quelle ist `docs/ACP.md` des Agenten, nicht eine allgemeine ACP-Beschreibung:
 * er implementiert eine Teilmenge, und nur die ist hier abgebildet. Wo das
 * Protokoll mehr erlaubt, als der Agent schickt, steht es als optionales Feld —
 * damit eine künftige Version nichts bricht.
 *
 * Diese Datei ist rein deklarativ: keine Laufzeit, keine Abhängigkeiten.
 */

/** Der Agent spricht Protokollversion 1. */
export const PROTOCOL_VERSION = 1;

// ── Inhalte ──────────────────────────────────────────────────────────────────

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ImageBlock {
  type: "image";
  data: string; // base64
  mimeType: string;
}

export interface AudioBlock {
  type: "audio";
  data: string; // base64
  mimeType: string;
}

export interface ResourceBlock {
  type: "resource";
  resource: { uri: string; text?: string; mimeType?: string };
}

export interface ResourceLinkBlock {
  type: "resource_link";
  uri: string;
  name?: string;
}

/**
 * Ein laufendes Terminal des Klienten. Der Agent schickt das nur, wenn der
 * Klient die Terminal-Fähigkeit angemeldet hat — diese Anwendung tut das nicht
 * (siehe `CLIENT_CAPABILITIES`). Der Typ steht hier, damit ein späterer Ausbau
 * nichts umbenennen muss.
 */
export interface TerminalBlock {
  type: "terminal";
  terminalId: string;
}

export type ContentBlock =
  | TextBlock
  | ImageBlock
  | AudioBlock
  | ResourceBlock
  | ResourceLinkBlock
  | TerminalBlock;

// ── Werkzeuge ────────────────────────────────────────────────────────────────

/** Die Einteilung, die der Agent selbst vornimmt (`jc_acp_proto` Klassifizierer). */
export type ToolKind =
  | "read"
  | "edit"
  | "delete"
  | "move"
  | "search"
  | "execute"
  | "think"
  | "fetch"
  | "other";

export type ToolStatus = "pending" | "in_progress" | "completed" | "failed";

// ── initialize ───────────────────────────────────────────────────────────────

export interface ClientCapabilities {
  fs?: { readTextFile?: boolean; writeTextFile?: boolean };
  terminal?: boolean;
}

/**
 * Was diese Anwendung anmeldet — und warum sie fast nichts anmeldet.
 *
 * Meldet ein Klient `fs.readTextFile`/`writeTextFile` an, leitet der Agent
 * *alle* Dateizugriffe seiner Werkzeuge über den Klienten um. Das ist für einen
 * Editor richtig: dort soll der Agent den ungespeicherten Puffer sehen. Diese
 * Anwendung hat keine Puffer — sie würde nur die Platte lesen und schreiben, die
 * der Agent ohnehin selbst erreicht, mit einer Netzrunde mehr und einer
 * Fehlerquelle mehr. Gleiches gilt für `terminal`: ohne Terminalfläche gäbe es
 * nichts anzuzeigen, was der Agent nicht selbst ausführen kann.
 *
 * Beide Fähigkeiten sind im Agenten fähigkeitsgesteuert und fallen auf den
 * direkten Weg zurück, wenn der Klient sie nicht anmeldet. Nichts anzumelden ist
 * daher kein Verzicht, sondern der unveränderte Normalbetrieb.
 */
export const CLIENT_CAPABILITIES: ClientCapabilities = {
  fs: { readTextFile: false, writeTextFile: false },
  terminal: false,
};

export interface InitializeParams {
  protocolVersion: number;
  clientCapabilities: ClientCapabilities;
}

export interface PromptCapabilities {
  image?: boolean;
  audio?: boolean;
  embeddedContext?: boolean;
}

export interface AgentCapabilities {
  loadSession?: boolean;
  promptCapabilities?: PromptCapabilities;
}

export interface InitializeResult {
  protocolVersion: number;
  agentCapabilities?: AgentCapabilities;
  authMethods?: Array<{ id: string; name?: string; description?: string }>;
}

// ── Sitzungen ────────────────────────────────────────────────────────────────

/**
 * `cwd` muss ein absoluter Pfad sein. `mcpServers` bleibt leer: der Agent
 * bringt seine eigenen MCP-Server aus seiner Konfiguration mit, genau wie im
 * Terminal.
 */
export interface NewSessionParams {
  cwd: string;
  mcpServers: never[];
}

export interface NewSessionResult {
  sessionId: string;
}

export interface LoadSessionParams {
  sessionId: string;
  cwd: string;
  mcpServers: never[];
}

export interface PromptParams {
  sessionId: string;
  prompt: ContentBlock[];
}

/**
 * Warum der Zug endete. `end_turn` ist der Normalfall, `cancelled` die Antwort
 * auf `session/cancel`. Die übrigen Werte kommen aus dem Protokoll; der
 * Vollständigkeit wegen, damit ein Vergleich nie ins Leere greift.
 */
export type StopReason =
  | "end_turn"
  | "cancelled"
  | "max_tokens"
  | "max_turn_requests"
  | "refusal";

export interface PromptResult {
  stopReason: StopReason | string;
}

export interface CancelParams {
  sessionId: string;
}

// ── session/update (Agent → Klient, Benachrichtigung) ────────────────────────

export interface MessageChunkUpdate {
  sessionUpdate: "agent_message_chunk" | "user_message_chunk" | "agent_thought_chunk";
  content: ContentBlock;
}

export interface ToolCallUpdate {
  sessionUpdate: "tool_call";
  toolCallId: string;
  title?: string;
  kind?: ToolKind;
  status?: ToolStatus;
  rawInput?: unknown;
  content?: ToolCallContent[];
}

export interface ToolCallProgressUpdate {
  sessionUpdate: "tool_call_update";
  toolCallId: string;
  title?: string;
  kind?: ToolKind;
  status?: ToolStatus;
  content?: ToolCallContent[];
  rawOutput?: unknown;
}

/** Die Ausgabe eines Werkzeugs. Der Agent verpackt sie als Inhaltsblock. */
export interface ToolCallContent {
  type?: "content" | "diff" | string;
  content?: ContentBlock;
  path?: string;
  oldText?: string | null;
  newText?: string;
}

export type SessionUpdate =
  | MessageChunkUpdate
  | ToolCallUpdate
  | ToolCallProgressUpdate;

export interface SessionNotification {
  sessionId: string;
  update: SessionUpdate;
}

// ── session/request_permission (Agent → Klient, Anfrage) ─────────────────────

export type PermissionOptionKind =
  | "allow_once"
  | "allow_always"
  | "reject_once"
  | "reject_always";

export interface PermissionOption {
  optionId: string;
  name: string;
  kind?: PermissionOptionKind;
}

export interface RequestPermissionParams {
  sessionId: string;
  toolCall: { toolCallId: string; title?: string; kind?: ToolKind };
  options: PermissionOption[];
}

export type PermissionOutcome =
  | { outcome: "selected"; optionId: string }
  | { outcome: "cancelled" };

export interface RequestPermissionResult {
  outcome: PermissionOutcome;
}

// ── Methodennamen an einer Stelle ────────────────────────────────────────────

export const Method = {
  initialize: "initialize",
  authenticate: "authenticate",
  newSession: "session/new",
  loadSession: "session/load",
  prompt: "session/prompt",
  cancel: "session/cancel",
  // Agent → Klient
  update: "session/update",
  requestPermission: "session/request_permission",
} as const;
