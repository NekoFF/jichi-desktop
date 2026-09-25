/**
 * Der Agent als ein Objekt.
 *
 * Das ist die einzige Fläche, die eine Oberfläche braucht: abonnieren, den
 * Schnappschuss lesen, eine der Methoden rufen. Prozess, JSON-RPC, ACP und die
 * Zustandsübergänge liegen dahinter.
 *
 * `subscribe`/`getSnapshot` haben absichtlich genau die Form, die React für
 * `useSyncExternalStore` verlangt, und sind als Felder gebunden — eine bei jedem
 * Rendern neu erzeugte Funktion würde dort ein Abonnement pro Rendern anlegen.
 *
 *     const snap = useSyncExternalStore(agent.subscribe, agent.getSnapshot);
 *
 * Reihenfolge beim Start: `init()` einmal beim Hochfahren der Anwendung. Es
 * bindet die Ereignisse, *bevor* ein Prozess läuft — sonst gehen die ersten
 * Zeilen des Agenten verloren, und genau in ihnen steht, was schiefging.
 */

import { JsonRpcPeer, RpcCode, RpcError } from "./jsonrpc.ts";
import {
  CLIENT_CAPABILITIES,
  Method,
  PROTOCOL_VERSION,
  type InitializeResult,
  type NewSessionResult,
  type PermissionOutcome,
  type PromptResult,
  type RequestPermissionParams,
  type SessionNotification,
} from "./protocol.ts";
import { resolveConfig, store, type LaunchConfig } from "./settings.ts";
import * as S from "./state.ts";
import { tauriTransport, type Transport } from "./transport.ts";

/** Meldungen des Agenten auf stderr, die in den Verlauf gehören und nicht nur
 *  in die Diagnose: sie erklären, warum ein Zug später scheitert. */
const LOUD_STDERR = /^(warning|error|fatal)\b/i;

export class Agent {
  readonly #transport: Transport;
  readonly #peer: JsonRpcPeer;
  readonly #listeners = new Set<() => void>();

  #snapshot: S.Snapshot = S.emptySnapshot();
  #config: LaunchConfig | null = null;

  /** Generation des aktuellen Kindes. Alles Ältere wird verworfen. */
  #generation = 0;
  /** Laufende Nummer für Verlaufseinträge. Muss über Neustarts stabil wachsen. */
  #counter = 0;
  /** Gesetzt, wenn `initialize` mit dem laufenden Kind erfolgreich war. */
  #ready = false;
  #detach: (() => void) | null = null;
  #attaching: Promise<void> | null = null;
  #permission: ((outcome: PermissionOutcome) => void) | null = null;
  /** Bereits gezeigte stderr-Meldungen — ein Agent wiederholt seine Warnung. */
  readonly #seen = new Set<string>();

  constructor(transport: Transport = tauriTransport) {
    this.#transport = transport;
    this.#peer = new JsonRpcPeer({
      send: (line) => this.#transport.send(line),
      onNotification: (method, params) => this.#onNotification(method, params),
      onRequest: (method, params, id) => this.#onRequest(method, params, id),
      onMalformed: (line, reason) => this.#diagnose(`${reason}: ${line.slice(0, 400)}`),
    });
  }

  // ── Fläche für die Oberfläche ──────────────────────────────────────────────

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): S.Snapshot => this.#snapshot;

  get config(): LaunchConfig | null {
    return this.#config;
  }

  /**
   * Einmal beim Start der Anwendung. Bindet die Ereignisse, lädt die
   * Einstellungen und liest die gespeicherten Sitzungen. Startet keinen Prozess.
   */
  async init(): Promise<void> {
    await this.#attach();
    if (!this.#config) {
      try {
        this.#config = await resolveConfig(this.#transport);
        this.#set({ cwd: this.#config.cwd });
      } catch (cause) {
        this.#set({ status: "error", error: describe(cause) });
      }
    }
    void this.refreshSessions();
    void this.#probeVersion();
  }

  /** Einstellungen ändern, speichern und — falls verbunden — neu verbinden. */
  async setConfig(next: LaunchConfig): Promise<void> {
    const { dropped } = store(next);
    this.#config = next;
    this.#set({ cwd: next.cwd });
    if (dropped.length) {
      this.#note(
        "warning",
        `Nicht gespeichert, weil der Name nach einem Geheimnis aussieht: ${dropped.join(", ")}. ` +
          `Statt eines Wertes bitte eine Datei angeben — sie wird erst beim Start gelesen.`,
      );
    }
    void this.#probeVersion();
    if (this.#generation > 0) await this.connect();
  }

  /** Prozess starten, `initialize` sprechen, neue Sitzung öffnen. */
  async connect(): Promise<void> {
    await this.#spawn();
    if (this.#ready) await this.newSession();
  }

  async disconnect(): Promise<void> {
    this.#ready = false;
    this.#generation = 0;
    this.#releasePermission();
    await this.#transport.stop();
    this.#peer.rejectAll("die Verbindung wurde getrennt");
    this.#set({
      status: "offline",
      sessionId: null,
      capabilities: null,
      transcript: S.failRunningTools(S.finalizeStreaming(this.#snapshot.transcript)),
    });
  }

  async newSession(): Promise<void> {
    await this.#spawn();
    if (!this.#ready) return;
    const cwd = this.#config?.cwd ?? this.#snapshot.cwd ?? "/";
    try {
      const result = await this.#peer.request<NewSessionResult>(Method.newSession, {
        cwd,
        mcpServers: [],
      });
      this.#seen.clear();
      this.#set({
        sessionId: result.sessionId,
        transcript: [],
        status: "ready",
        error: null,
        cwd,
      });
    } catch (cause) {
      this.#fail(cause);
    }
  }

  /**
   * Eine gespeicherte Sitzung öffnen.
   *
   * Der Agent spielt dabei den ganzen Verlauf als Benachrichtigungen ein, *bevor*
   * er antwortet. Deshalb muss die Sitzungs-Id gesetzt sein, ehe die Anfrage
   * hinausgeht — sonst filtert der Empfang die Wiedergabe als fremd weg.
   */
  async loadSession(sessionId: string): Promise<void> {
    await this.#spawn();
    if (!this.#ready) return;

    const known = this.#snapshot.sessions.find((s) => s.id === sessionId);
    const cwd = known?.workspace ?? this.#config?.cwd ?? this.#snapshot.cwd ?? "/";

    this.#seen.clear();
    this.#set({ sessionId, transcript: [], status: "busy", error: null, cwd });
    try {
      await this.#peer.request(Method.loadSession, { sessionId, cwd, mcpServers: [] });
      this.#set({
        status: "ready",
        transcript: S.finalizeStreaming(this.#snapshot.transcript),
      });
    } catch (cause) {
      this.#fail(cause);
    }
  }

  /** Einen Zug senden. Baut die Verbindung bei Bedarf selbst auf. */
  async send(text: string): Promise<void> {
    const prompt = text.trim();
    if (!prompt) return;

    if (this.#snapshot.status === "offline" || this.#snapshot.status === "error") {
      await this.connect();
    }
    const sessionId = this.#snapshot.sessionId;
    if (this.#snapshot.status !== "ready" || !sessionId) {
      throw new Error(
        this.#snapshot.error ?? "Der Agent ist nicht bereit — bitte Einstellungen prüfen.",
      );
    }

    this.#set({
      status: "busy",
      error: null,
      transcript: S.pushMessage(this.#snapshot.transcript, "user", prompt, this.#id()),
    });

    try {
      const result = await this.#peer.request<PromptResult>(Method.prompt, {
        sessionId,
        prompt: [{ type: "text", text: prompt }],
      });
      this.#endTurn(result.stopReason);
    } catch (cause) {
      // Ein Abgang des Prozesses hat den Zustand schon gesetzt; dann ist der
      // abgebrochene Aufruf die Folge, nicht die Ursache. Gelesen wird über
      // `getSnapshot`, weil `#snapshot` sich seit der Prüfung oben geändert hat.
      if (this.getSnapshot().status === "offline") {
        this.#set({ transcript: S.failRunningTools(this.#snapshot.transcript) });
      } else {
        this.#fail(cause);
      }
    }
    void this.refreshSessions();
  }

  /**
   * Den laufenden Zug abbrechen.
   *
   * Wartet der Agent gerade auf eine Berechtigung, wird zuerst diese Anfrage mit
   * `cancelled` beantwortet — sonst bliebe er in seinem blockierenden Warten
   * stehen und die Abbruchmeldung würde nie gelesen.
   */
  async cancel(): Promise<void> {
    const sessionId = this.#snapshot.sessionId;
    if (!sessionId) return;
    this.#releasePermission();
    this.#set({ status: this.#snapshot.status === "busy" ? "cancelling" : this.#snapshot.status });
    try {
      await this.#peer.notify(Method.cancel, { sessionId });
    } catch (cause) {
      this.#diagnose(`Abbruch konnte nicht gesendet werden: ${describe(cause)}`);
    }
  }

  /**
   * Eine Berechtigungsfrage beantworten. `null` bedeutet Abbruch des Zuges —
   * so ist es im Protokoll definiert, nicht als Ablehnung des Werkzeugs.
   */
  answerPermission(optionId: string | null): void {
    const resolve = this.#permission;
    if (!resolve) return;
    this.#permission = null;
    this.#set({ permission: null });
    resolve(optionId ? { outcome: "selected", optionId } : { outcome: "cancelled" });
  }

  async refreshSessions(): Promise<void> {
    try {
      this.#set({ sessions: await this.#transport.sessions() });
    } catch (cause) {
      this.#diagnose(`Sitzungen konnten nicht gelesen werden: ${describe(cause)}`);
    }
  }

  // ── Innenleben ─────────────────────────────────────────────────────────────

  #id(): string {
    return `i${++this.#counter}`;
  }

  #set(patch: Partial<S.Snapshot>): void {
    this.#snapshot = S.withDerived({ ...this.#snapshot, ...patch });
    for (const listener of this.#listeners) listener();
  }

  #note(level: S.NoticeItem["level"], text: string): void {
    this.#set({ transcript: S.pushNotice(this.#snapshot.transcript, level, text, this.#id()) });
  }

  #diagnose(text: string): void {
    this.#set({ diagnostics: S.pushDiagnostic(this.#snapshot.diagnostics, text) });
  }

  #fail(cause: unknown): void {
    const error = describe(cause);
    this.#set({
      status: "error",
      error,
      transcript: S.failRunningTools(S.finalizeStreaming(this.#snapshot.transcript)),
    });
  }

  /** Eine offene Berechtigungsfrage als abgebrochen beantworten. */
  #releasePermission(): void {
    if (this.#permission) this.answerPermission(null);
  }

  async #attach(): Promise<void> {
    if (this.#detach) return;
    this.#attaching ??= (async () => {
      this.#detach = await this.#transport.listen({
        line: (generation, line) => {
          if (generation !== this.#generation) return; // Nachhall eines toten Kindes
          this.#peer.receive(line);
        },
        stderr: (generation, line) => {
          if (generation !== this.#generation) return;
          this.#onStderr(line);
        },
        exit: (generation, code) => {
          if (generation !== this.#generation) return;
          this.#onExit(code);
        },
      });
    })();
    await this.#attaching;
  }

  /** Prozess starten und `initialize` sprechen. Mehrfach aufrufbar. */
  async #spawn(): Promise<void> {
    if (this.#ready) return;
    await this.#attach();

    this.#config ??= await resolveConfig(this.#transport).catch((cause) => {
      this.#fail(cause);
      return null;
    });
    const config = this.#config;
    if (!config) return;

    this.#set({ status: "starting", error: null, cwd: config.cwd });
    try {
      this.#generation = await this.#transport.start({
        program: config.program,
        args: config.args,
        cwd: config.cwd,
        env: config.env,
      });

      const result = await this.#peer.request<InitializeResult>(Method.initialize, {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: CLIENT_CAPABILITIES,
      });

      if (result.protocolVersion !== PROTOCOL_VERSION) {
        this.#note(
          "warning",
          `Der Agent spricht Protokollversion ${result.protocolVersion}, diese Anwendung ${PROTOCOL_VERSION}.`,
        );
      }
      this.#ready = true;
      this.#set({ capabilities: result.agentCapabilities ?? null, status: "ready" });
    } catch (cause) {
      this.#ready = false;
      this.#fail(cause);
    }
  }

  async #probeVersion(): Promise<void> {
    const program = this.#config?.program;
    if (!program) return;
    try {
      this.#set({ agentVersion: (await this.#transport.probe(program)) || null });
    } catch {
      this.#set({ agentVersion: null });
    }
  }

  #endTurn(stopReason: string): void {
    const transcript = S.finalizeStreaming(this.#snapshot.transcript);
    // Nach einem Abgang des Prozesses gilt `offline`; nicht überschreiben.
    const status: S.Status = this.#snapshot.status === "offline" ? "offline" : "ready";
    this.#set({ status, transcript });

    if (stopReason === "cancelled") {
      this.#note("info", "Abgebrochen.");
      this.#set({ transcript: S.failRunningTools(this.#snapshot.transcript) });
    } else if (stopReason !== "end_turn") {
      this.#note("warning", `Der Zug endete mit „${stopReason}“.`);
    }
  }

  #onExit(code: number | null): void {
    this.#ready = false;
    this.#releasePermission();
    this.#set({
      status: "offline",
      sessionId: this.#snapshot.sessionId,
      capabilities: null,
      transcript: S.failRunningTools(S.finalizeStreaming(this.#snapshot.transcript)),
    });
    this.#peer.rejectAll("der Agent wurde beendet");
    this.#note(
      code === 0 || code === null ? "info" : "error",
      code === 0 || code === null
        ? "Der Agent wurde beendet."
        : `Der Agent wurde mit Code ${code} beendet. Die letzten Meldungen stehen in der Diagnose.`,
    );
  }

  #onStderr(line: string): void {
    this.#diagnose(line);
    const text = line.trim();
    // Genau einmal pro Wortlaut: ein Agent wiederholt dieselbe Warnung je Zug.
    if (!text || !LOUD_STDERR.test(text) || this.#seen.has(text)) return;
    this.#seen.add(text);
    this.#note(/^(error|fatal)/i.test(text) ? "error" : "warning", text);
  }

  #onNotification(method: string, params: unknown): void {
    if (method !== Method.update) {
      this.#diagnose(`unbekannte Benachrichtigung ${method}`);
      return;
    }
    const note = params as SessionNotification | undefined;
    const update = note?.update;
    if (!update) {
      this.#diagnose("session/update ohne update");
      return;
    }
    // Eine Nachricht zu einer anderen Sitzung gehört nicht in diesen Verlauf.
    if (note.sessionId && this.#snapshot.sessionId && note.sessionId !== this.#snapshot.sessionId) {
      return;
    }

    switch (update.sessionUpdate) {
      case "agent_message_chunk":
        this.#chunk("agent", update.content);
        return;
      case "user_message_chunk":
        this.#chunk("user", update.content);
        return;
      case "agent_thought_chunk":
        this.#chunk("thought", update.content);
        return;
      case "tool_call":
        this.#set({
          transcript: S.applyToolCall(this.#snapshot.transcript, update, this.#id()),
        });
        return;
      case "tool_call_update":
        this.#set({
          transcript: S.applyToolUpdate(this.#snapshot.transcript, update, this.#id()),
        });
        return;
      default:
        this.#diagnose(
          `unbekanntes session/update: ${(update as { sessionUpdate?: string }).sessionUpdate}`,
        );
    }
  }

  #chunk(role: S.MessageRole, content: Parameters<typeof S.blockToText>[0]): void {
    this.#set({
      transcript: S.appendChunk(this.#snapshot.transcript, role, S.blockToText(content), this.#id()),
    });
  }

  async #onRequest(method: string, params: unknown, id: number | string): Promise<unknown> {
    if (method === Method.requestPermission) {
      return { outcome: await this.#ask(params as RequestPermissionParams, id) };
    }
    // Alles andere hat diese Anwendung nicht angemeldet (siehe CLIENT_CAPABILITIES).
    // Eine klare Fehlermeldung statt Schweigen: der Agent wartet sonst ewig.
    throw new RpcError(
      RpcCode.methodNotFound,
      `${method} wird von dieser Anwendung nicht angeboten`,
    );
  }

  #ask(params: RequestPermissionParams, id: number | string): Promise<PermissionOutcome> {
    // Der Agent ist einfädig und blockiert, kann also nur eine Frage offen haben.
    // Käme dennoch eine zweite, wäre die erste verwaist: sie wird abgebrochen.
    this.#releasePermission();

    const call = params?.toolCall;
    const pending: S.PendingPermission = {
      requestId: id,
      toolCallId: call?.toolCallId ?? "",
      title: call?.title?.trim() || "Werkzeug ausführen",
      toolKind: call?.kind ?? "other",
      options: Array.isArray(params?.options) ? params.options : [],
    };
    this.#set({ permission: pending });

    return new Promise<PermissionOutcome>((resolve) => {
      this.#permission = resolve;
    });
  }
}

function describe(cause: unknown): string {
  if (cause instanceof RpcError) return cause.message;
  if (cause instanceof Error) return cause.message;
  return String(cause);
}

/** Eine Instanz für die ganze Anwendung. */
export const agent = new Agent();
