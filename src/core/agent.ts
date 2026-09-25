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
  clientCapabilities,
  Method,
  PROTOCOL_VERSION,
  type ContentBlock,
  type InitializeResult,
  type NewSessionResult,
  type PermissionOutcome,
  type PromptResult,
  type RequestPermissionParams,
  type SessionNotification,
  type TerminalCreateParams,
  type TerminalIdParams,
} from "./protocol.ts";
import {
  launchArgs,
  mergeConfig,
  readStored,
  resolveConfig,
  store,
  type LaunchConfig,
} from "./settings.ts";
import * as S from "./state.ts";
import {
  tauriTransport,
  type DoctorReport,
  type EnvSpec,
  type FileAttachment,
  type TermExit,
  type Transport,
} from "./transport.ts";

/** Ein Bild für den nächsten Zug. `data` ist Base64 ohne Präfix. */
export interface Attachment {
  data: string;
  mimeType: string;
}

/** Meldungen des Agenten auf stderr, die in den Verlauf gehören und nicht nur
 *  in die Diagnose: sie erklären, warum ein Zug später scheitert. */
const LOUD_STDERR = /^(warning|error|fatal)\b/i;

/** Fristen für Anfragen, die schnell sein müssen. Ein Zug hat keine. */
const HANDSHAKE_MS = 30_000;
const NEW_SESSION_MS = 30_000;
/** Das Laden spielt den ganzen Verlauf ein; ein langer Chat braucht Zeit. */
const LOAD_SESSION_MS = 120_000;

const BUSY = "Bitte warte, bis die Antwort beendet ist.";

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
  /** Ein laufender Start. Zwei gleichzeitige Aufrufe teilen sich diesen einen. */
  #spawning: Promise<void> | null = null;
  /**
   * Womit das laufende Kind gestartet wurde. jichi nimmt das Arbeitsverzeichnis
   * aus seinem Startverzeichnis, **nicht** aus `session/new` — ein anderer Ordner
   * braucht also einen anderen Prozess.
   */
  #spawned: { cwd: string; launch: string } | null = null;
  /** Terminals, die der Agent hier geöffnet und noch nicht freigegeben hat. */
  readonly #terms = new Set<string>();
  /** Während `session/load` den Verlauf einspielt: Nachrichten ohne Uhrzeit. */
  #replaying = false;
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
        const suggestion = await this.#transport.defaultLaunch();
        this.#config = mergeConfig(suggestion, readStored());
        this.#set({
          cwd: this.#config.cwd,
          home: suggestion.cwd,
          model: this.#config.model ?? null,
          mode: this.#config.mode ?? "chat",
        });
      } catch (cause) {
        this.#set({ status: "error", error: describe(cause) });
      }
    }
    void this.refreshSessions();
    void this.#probeVersion();
    await this.refreshReadiness();
    if (this.#snapshot.readiness?.keyStored && !this.#snapshot.needsSetup) void this.refreshGateway();
  }

  // ── Was der Schlüssel erreicht ─────────────────────────────────────────────

  /**
   * Die freien Modelle am Gateway abfragen. Bei einem Fehler bleibt die alte
   * Liste stehen: ein kurzer Netzausfall soll die Auswahl nicht leeren.
   */
  async refreshGateway(): Promise<void> {
    const prev = this.#snapshot.gateway;
    this.#set({
      gateway: { base: prev?.base ?? null, models: prev?.models ?? [], loading: true, error: null },
    });
    try {
      const report = await this.#transport.gatewayModels();
      this.#set({ gateway: { base: report.base, models: report.models, loading: false, error: null } });
    } catch (cause) {
      this.#set({
        gateway: {
          base: prev?.base ?? null,
          models: prev?.models ?? [],
          loading: false,
          error: describe(cause),
        },
      });
    }
  }

  // ── Modell und Modus ───────────────────────────────────────────────────────

  /**
   * Ein anderes Modell. Der offene Chat bleibt: der Agent startet mit
   * `--model` neu und lädt ihn wieder — jichi speichert das Modell nicht in der
   * Sitzung, also gilt danach das neue.
   */
  async setModel(model: string | null): Promise<void> {
    if (this.#busy()) throw new Error(BUSY);
    this.#config ??= await resolveConfig(this.#transport);
    const next = model?.trim() || null;
    if ((this.#config.model ?? null) === next) return;
    this.#config = { ...this.#config, model: next };
    store(this.#config);
    this.#set({ model: next });
    await this.#relaunchKeepingChat();
  }

  /**
   * Chat, Plan oder Auto. Anders als das Modell speichert jichi den Modus **in
   * der Sitzung** und stellt ihn beim Laden wieder her — ein Wechsel im offenen
   * Chat würde also beim Neuladen verpuffen. Darum beginnt ein Wechsel einen
   * neuen Chat, sobald der alte Inhalt hat, und sagt das.
   */
  async setMode(mode: S.AgentMode): Promise<void> {
    if (this.#busy()) throw new Error(BUSY);
    this.#config ??= await resolveConfig(this.#transport);
    if ((this.#config.mode ?? "chat") === mode) return;
    this.#config = { ...this.#config, mode };
    store(this.#config);
    this.#set({ mode });
    if (!this.#ready) return;
    await this.#restart();
    await this.newSession();
    if (this.#ready) this.#note("info", `Neuer Chat im Modus „${MODE_LABEL[mode]}“.`);
  }

  async #relaunchKeepingChat(): Promise<void> {
    if (!this.#ready) return;
    const keep = this.#snapshot.transcript.length > 0 ? this.#snapshot.sessionId : null;
    await this.#restart();
    if (keep) await this.loadSession(keep);
    else await this.newSession();
  }

  // ── Vorschau und Verweise ──────────────────────────────────────────────────

  /** Heutiger Inhalt einer Datei im offenen Projekt, für die Vorschau einer Änderung. */
  async readProjectFile(path: string): Promise<string | null> {
    const cwd = this.#snapshot.cwd ?? this.#config?.cwd;
    if (!cwd) throw new Error("Kein Projekt geöffnet.");
    return this.#transport.readWorkspaceFile(cwd, path);
  }

  /** Eine Textdatei für den nächsten Zug wählen. `null`, wenn abgebrochen wurde. */
  async pickAttachment(): Promise<FileAttachment | null> {
    const path = await this.#transport.pickFile("Datei anhängen");
    return path ? this.#transport.readAttachment(path) : null;
  }

  /** Einen Verweis aus einer Antwort im Browser öffnen. */
  openLink(url: string): Promise<void> {
    return this.#transport.openUrl(url);
  }

  // ── Erster Start ───────────────────────────────────────────────────────────

  /** Fragt den Rechner ab: Agent da? Konfiguration da? Schlüssel hinterlegt? */
  async refreshReadiness(): Promise<void> {
    try {
      const readiness = await this.#transport.readiness(this.#config?.program);
      this.#set({ readiness, agentVersion: readiness.version ?? this.#snapshot.agentVersion });
      // Liegt der Schlüssel in der Ablage, wird er auch von dort genommen.
      if (readiness.keyStored && this.#config) {
        const env = keychainEnv(this.#config.env, readiness.keyEnv);
        if (env) {
          this.#config = { ...this.#config, env };
          store(this.#config);
        }
      }
    } catch (cause) {
      this.#diagnose(`Bereitschaft nicht feststellbar: ${describe(cause)}`);
    }
  }

  /**
   * Den ersten Start abschließen: Schlüssel hinterlegen, bei Bedarf die
   * Konfiguration des Agenten anlegen, und ihn sich selbst prüfen lassen.
   *
   * Der Schlüssel geht in die geschützte Ablage der Anwendung und wird von dort
   * **nie wieder ausgelesen** — außer von der Rust-Seite im Moment des Starts.
   * Er steht in keiner Einstellung, in keinem Protokoll und in keinem Zustand
   * dieser Anwendung.
   *
   * Geprüft wird nicht von uns, sondern von `jichi doctor`: derselbe Weg, den
   * auch ein echter Zug nimmt. Eine zweite, hier nachgebaute Prüfung könnte
   * grün melden, wo der echte Weg rot ist.
   */
  async setup(apiKey: string): Promise<DoctorReport> {
    const key = apiKey.trim();
    if (!key) throw new Error("Bitte den API-Schlüssel eintragen.");

    const readiness = await this.#transport.readiness(this.#config?.program);
    this.#set({ readiness });
    if (!readiness.agent) {
      throw new Error("jichi wurde auf diesem Rechner nicht gefunden. Bitte das Programm auswählen.");
    }

    await this.#transport.secretStore(readiness.keyEnv, key);

    if (!readiness.config.exists) {
      await this.#transport.writeConfig("jlu");
    } else if (readiness.config.problem) {
      throw new Error(`${readiness.config.path}: ${readiness.config.problem}`);
    }

    // Ab jetzt kommt der Schlüssel aus der Ablage.
    this.#config ??= await resolveConfig(this.#transport);
    const env = keychainEnv(this.#config.env, readiness.keyEnv) ?? this.#config.env;
    this.#config = { ...this.#config, program: readiness.agent, env };
    store(this.#config);

    const health = await this.#transport.doctor(this.#config.program, env);
    // Meldet der Agent Fehler, bleibt die Einrichtung offen: sonst führte sie
    // in eine Anwendung, deren erster Zug am selben Fehler scheitert.
    this.#set({ health, setupHold: health.fail > 0 });
    await this.refreshReadiness();
    if (!health.fail) void this.refreshGateway();
    return health;
  }

  /**
   * Die Einrichtung trotz gemeldeter Fehler verlassen — etwa, weil nur das Netz
   * gerade fehlt. Der Bericht bleibt in den Einstellungen einsehbar.
   */
  finishSetup(): void {
    this.#set({ setupHold: false });
  }

  /**
   * Das Programm des Agenten festlegen — für den Fall, dass die Suche ihn nicht
   * findet. Danach wird die Bereitschaft mit genau diesem Programm neu geprüft.
   */
  async setProgram(program: string): Promise<void> {
    const trimmed = program.trim();
    if (!trimmed) return;
    this.#config ??= await resolveConfig(this.#transport);
    this.#config = { ...this.#config, program: trimmed };
    store(this.#config);
    await this.refreshReadiness();
    void this.#probeVersion();
  }

  /** Dateiauswahl für das Programm. Liefert den Pfad, oder `null`. */
  async pickProgram(): Promise<string | null> {
    const picked = await this.#transport.pickFile("jichi auswählen");
    if (picked) await this.setProgram(picked);
    return picked;
  }

  /** Nur prüfen, nichts ändern — für die Diagnose in den Einstellungen. */
  async checkHealth(): Promise<DoctorReport> {
    const config = this.#config ?? (await resolveConfig(this.#transport));
    const health = await this.#transport.doctor(config.program, config.env);
    this.#set({ health });
    return health;
  }

  /** Den Schlüssel aus der Ablage entfernen. */
  async forgetKey(): Promise<void> {
    const account = this.#snapshot.readiness?.keyEnv ?? "JICHI_API_KEY";
    await this.#transport.secretForget(account);
    await this.disconnect();
    await this.refreshReadiness();
    if (this.#snapshot.readiness?.keyStored !== false) {
      throw new Error("Der API-Schlüssel ist weiterhin verfügbar.");
    }
  }

  // ── Arbeitsverzeichnis ─────────────────────────────────────────────────────

  /**
   * Ein Projekt öffnen. Das Arbeitsverzeichnis ist keine Einstellung, sondern
   * das, was gerade offen ist — der Agent sieht genau diesen Ordner.
   */
  async openWorkspace(path: string): Promise<void> {
    const cwd = path.trim();
    if (!cwd) return;
    if (!this.#snapshot.canSwitch && !this.#snapshot.needsSetup) throw new Error(BUSY);
    this.#config ??= await resolveConfig(this.#transport);
    this.#config = { ...this.#config, cwd };
    store(this.#config);
    this.#set({ cwd });
    await this.newSession();
  }

  /** Ordnerauswahl des Betriebssystems. Liefert den gewählten Pfad, oder `null`. */
  async pickWorkspace(): Promise<string | null> {
    const picked = await this.#transport.pickDirectory("Projektordner wählen");
    if (picked) await this.openWorkspace(picked);
    return picked;
  }

  /**
   * Einstellungen ändern und speichern.
   *
   * Neu gestartet wird nur, wenn sich am Start des Agenten etwas geändert hat
   * — Programm, Argumente, Umgebung oder Ordner. Ein unverändertes „Speichern“
   * darf den offenen Chat nicht anfassen.
   */
  async setConfig(next: LaunchConfig): Promise<void> {
    const before = this.#config;
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
    if (before && launchKey(before) === launchKey(next) && before.cwd === next.cwd) return;

    void this.#probeVersion();
    if (before?.program !== next.program) void this.refreshReadiness();
    if (this.#ready) {
      if (!this.#snapshot.canSwitch) throw new Error(BUSY);
      await this.#restart();
      await this.newSession();
    }
  }

  /** Prozess starten, `initialize` sprechen, neue Sitzung öffnen. */
  async connect(): Promise<void> {
    await this.#spawn();
    if (this.#ready) await this.newSession();
  }

  async disconnect(): Promise<void> {
    this.#ready = false;
    this.#generation = 0;
    this.#spawned = null;
    this.#releasePermission();
    this.#releaseTerminals();
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
    if (this.#busy()) throw new Error(BUSY);
    const cwd = this.#config?.cwd ?? this.#snapshot.cwd ?? "/";
    await this.#spawnIn(cwd);
    if (!this.#ready) return;
    try {
      const result = await this.#peer.request<NewSessionResult>(
        Method.newSession,
        { cwd, mcpServers: [] },
        NEW_SESSION_MS,
      );
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
    if (this.#busy()) throw new Error(BUSY);
    const known = this.#snapshot.sessions.find((s) => s.id === sessionId);
    const cwd = known?.workspace ?? this.#config?.cwd ?? this.#snapshot.cwd ?? "/";

    // Ein Chat gehört zu seinem Projekt: wer ihn öffnet, öffnet auch dieses.
    if (this.#config && cwd !== this.#config.cwd) {
      this.#config = { ...this.#config, cwd };
      store(this.#config);
    }
    await this.#spawnIn(cwd);
    if (!this.#ready) return;

    this.#seen.clear();
    this.#set({ sessionId, transcript: [], status: "busy", error: null, cwd });
    this.#replaying = true;
    try {
      await this.#peer.request(
        Method.loadSession,
        { sessionId, cwd, mcpServers: [] },
        LOAD_SESSION_MS,
      );
      this.#replaying = false;
      this.#set({
        status: "ready",
        transcript: S.finalizeStreaming(this.#snapshot.transcript),
      });
    } catch (cause) {
      this.#replaying = false;
      this.#fail(cause);
    }
  }

  /** Einen Zug senden. Baut die Verbindung bei Bedarf selbst auf. */
  async send(
    text: string,
    images: readonly Attachment[] = [],
    files: readonly FileAttachment[] = [],
  ): Promise<void> {
    const prompt = text.trim();
    if (!prompt && images.length === 0 && files.length === 0) return;

    // Nach einem Fehler weiter im selben Chat, solange der Agent noch läuft —
    // ein fehlgeschlagener Zug ist kein Grund, das Gespräch zu verwerfen.
    if (this.#snapshot.status === "error" && this.#ready && this.#snapshot.sessionId) {
      this.#set({ status: "ready", error: null });
    }
    if (this.#snapshot.status === "offline" || this.#snapshot.status === "error") {
      await this.connect();
    }
    const sessionId = this.#snapshot.sessionId;
    if (this.#snapshot.status !== "ready" || !sessionId) {
      throw new Error(
        this.#snapshot.error ?? "Der Agent ist nicht bereit — bitte Einstellungen prüfen.",
      );
    }

    // Bilder nur, wenn das Modell sie liest — jichi verwirft sie sonst stumm,
    // und der Benutzer hielte die Antwort für eine Antwort auf das Bild.
    if (images.length && !this.#snapshot.canAttachImages) {
      throw new Error("Das aktive Modell kann keine Bilder lesen.");
    }
    // Dateien als eingebettete Ressource: jichi liest deren Text in den Zug ein.
    const blocks: ContentBlock[] = [
      ...images.map((i): ContentBlock => ({ type: "image", data: i.data, mimeType: i.mimeType })),
      ...files.map(
        (f): ContentBlock => ({
          type: "resource",
          resource: { uri: fileUri(f.path), text: f.text, mimeType: "text/plain" },
        }),
      ),
      ...(prompt ? [{ type: "text", text: prompt } as ContentBlock] : []),
    ];
    const shown = S.pushMessage(this.#snapshot.transcript, "user", prompt, this.#id(), Date.now());
    const last = shown[shown.length - 1] as S.MessageItem;
    if (images.length) last.images = images.map((i) => `data:${i.mimeType};base64,${i.data}`);
    if (files.length) last.files = files.map((f) => f.name);

    this.#set({ status: "busy", error: null, transcript: shown });

    try {
      const result = await this.#peer.request<PromptResult>(Method.prompt, {
        sessionId,
        prompt: blocks,
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

  /** Eine gespeicherte Sitzung nach Bestätigung durch die Oberfläche löschen. */
  async deleteSession(sessionId: string): Promise<void> {
    if (!this.#snapshot.sessions.some((session) => session.id === sessionId)) {
      throw new Error("Dieser Chat ist nicht mehr vorhanden.");
    }
    if (this.#snapshot.sessionId === sessionId) {
      if (this.#snapshot.status === "busy" || this.#snapshot.status === "cancelling") {
        throw new Error("Bitte warte, bis die Antwort beendet ist.");
      }
      await this.newSession();
      if (this.#snapshot.sessionId === sessionId || this.#snapshot.status !== "ready") {
        throw new Error("Der aktive Chat konnte nicht geschlossen werden.");
      }
    }
    await this.#transport.deleteSession(sessionId);
    await this.refreshSessions();
  }

  // ── Innenleben ─────────────────────────────────────────────────────────────

  #busy(): boolean {
    const { status, permission } = this.#snapshot;
    return status === "busy" || status === "cancelling" || permission !== null;
  }

  /** Den Agenten in diesem Ordner laufen lassen — neu starten, falls er woanders steht. */
  async #spawnIn(cwd: string): Promise<void> {
    if (this.#ready && this.#spawned && this.#spawned.cwd !== cwd) await this.#restart();
    await this.#spawn();
  }

  async #restart(): Promise<void> {
    this.#ready = false;
    this.#spawned = null;
    this.#releasePermission();
    this.#releaseTerminals();
    this.#generation = 0; // Nachhall des alten Kindes gilt ab jetzt als fremd
    await this.#transport.stop();
    this.#peer.rejectAll("der Agent wird neu gestartet");
  }

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

  /** Ein toter oder neu gestarteter Agent gibt seine Terminals nie mehr frei. */
  #releaseTerminals(): void {
    for (const id of this.#terms) void this.#transport.termRelease(id).catch(() => {});
    this.#terms.clear();
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
        termOutput: (terminalId, chunk) => {
          if (!this.#terms.has(terminalId)) return;
          this.#set({ terminals: S.appendTerminal(this.#snapshot.terminals, terminalId, chunk) });
        },
        termExit: (terminalId, exit) => {
          if (!this.#terms.has(terminalId)) return;
          this.#set({ terminals: S.finishTerminal(this.#snapshot.terminals, terminalId, exit) });
        },
      });
    })();
    await this.#attaching;
  }

  /** Prozess starten und `initialize` sprechen. Mehrfach aufrufbar. */
  async #spawn(): Promise<void> {
    if (this.#ready) return;
    // Zwei gleichzeitige Aufrufe (Klick auf „Neuer Chat“ während eines Starts)
    // dürfen nicht zwei Prozesse starten.
    this.#spawning ??= this.#spawnOnce().finally(() => {
      this.#spawning = null;
    });
    await this.#spawning;
  }

  async #spawnOnce(): Promise<void> {
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
        args: launchArgs(config),
        cwd: config.cwd,
        env: config.env,
      });

      this.#spawned = { cwd: config.cwd, launch: launchKey(config) };

      const result = await this.#peer.request<InitializeResult>(
        Method.initialize,
        { protocolVersion: PROTOCOL_VERSION, clientCapabilities: clientCapabilities(this.#transport.terminals) },
        HANDSHAKE_MS,
      );

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
    this.#spawned = null;
    this.#releaseTerminals();
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
      transcript: S.appendChunk(
        this.#snapshot.transcript,
        role,
        S.blockToText(content),
        this.#id(),
        this.#replaying ? undefined : Date.now(),
      ),
    });
  }

  async #onRequest(method: string, params: unknown, id: number | string): Promise<unknown> {
    if (method === Method.requestPermission) {
      return { outcome: await this.#ask(params as RequestPermissionParams, id) };
    }
    if (method.startsWith("terminal/") && this.#transport.terminals) {
      return this.#terminal(method, params);
    }
    // Alles andere hat diese Anwendung nicht angemeldet (siehe clientCapabilities).
    // Eine klare Fehlermeldung statt Schweigen: der Agent wartet sonst ewig.
    throw new RpcError(
      RpcCode.methodNotFound,
      `${method} wird von dieser Anwendung nicht angeboten`,
    );
  }

  /**
   * `terminal/*` für den Agenten. Er hat die Erlaubnis für den Befehl schon
   * eingeholt; hier wird nur ausgeführt und berichtet.
   */
  async #terminal(method: string, params: unknown): Promise<unknown> {
    const exitStatus = (e: TermExit | null) =>
      e && { exitCode: e.exitCode, signal: e.signal === null ? null : String(e.signal) };

    if (method === Method.terminalCreate) {
      const p = params as TerminalCreateParams;
      if (typeof p?.command !== "string" || !p.command) {
        throw new RpcError(RpcCode.invalidParams, "terminal/create ohne command");
      }
      const terminalId = await this.#transport.termCreate({
        command: p.command,
        args: Array.isArray(p.args) ? p.args.filter((a) => typeof a === "string") : [],
        cwd: p.cwd ?? this.#snapshot.cwd,
        outputByteLimit: typeof p.outputByteLimit === "number" ? p.outputByteLimit : null,
      });
      this.#terms.add(terminalId);
      this.#set({
        terminals: { ...this.#snapshot.terminals, [terminalId]: { output: "", truncated: false, exit: null } },
      });
      return { terminalId };
    }

    const terminalId = (params as TerminalIdParams)?.terminalId;
    if (typeof terminalId !== "string" || !this.#terms.has(terminalId)) {
      throw new RpcError(RpcCode.invalidParams, `unbekanntes Terminal ${String(terminalId)}`);
    }
    switch (method) {
      case Method.terminalOutput: {
        const out = await this.#transport.termOutput(terminalId);
        return { output: out.output, truncated: out.truncated, exitStatus: exitStatus(out.exitStatus) };
      }
      case Method.terminalWait: {
        // Beide Formen: ACP legt die Felder oben ab, jichi liest `exitStatus`.
        const e = exitStatus(await this.#transport.termWait(terminalId));
        return { ...e, exitStatus: e };
      }
      case Method.terminalKill:
        await this.#transport.termKill(terminalId);
        return {};
      case Method.terminalRelease:
        this.#terms.delete(terminalId);
        await this.#transport.termRelease(terminalId);
        return {};
      default:
        throw new RpcError(RpcCode.methodNotFound, `${method} wird von dieser Anwendung nicht angeboten`);
    }
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

/**
 * Die Schlüsselvariable auf die geschützte Ablage umstellen (nicht der
 * Schlüsselbund des Systems — siehe „Geheimnisse“ in `lib.rs`).
 *
 * Liefert `null`, wenn schon alles stimmt — dann wird nichts gespeichert und
 * niemand benachrichtigt.
 */
function keychainEnv(env: EnvSpec[], keyEnv: string): EnvSpec[] | null {
  const current = env.find((e) => e.name === keyEnv);
  if (current?.secret === keyEnv && !current.file && !current.value) return null;
  return [...env.filter((e) => e.name !== keyEnv), { name: keyEnv, secret: keyEnv }];
}

/** Ein Pfad als `file://`-Verweis, mit maskierten Sonderzeichen. */
function fileUri(path: string): string {
  const norm = path.replace(/\\/g, "/");
  return `file://${norm.startsWith("/") ? "" : "/"}${encodeURI(norm).replace(/[?#]/g, encodeURIComponent)}`;
}

/** Was am Start des Agenten zählt — ohne den Ordner, der eigens verglichen wird. */
function launchKey(config: LaunchConfig): string {
  return JSON.stringify([config.program, launchArgs(config), config.env]);
}

const MODE_LABEL: Record<S.AgentMode, string> = { chat: "Chat", plan: "Plan", auto: "Auto" };

function describe(cause: unknown): string {
  if (cause instanceof RpcError) return cause.message;
  if (cause instanceof Error) return cause.message;
  return String(cause);
}

/** Eine Instanz für die ganze Anwendung. */
export const agent = new Agent();
