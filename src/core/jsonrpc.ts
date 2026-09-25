/**
 * JSON-RPC 2.0 über zeilengetrennte Nachrichten.
 *
 * Bewusst ohne ACP-Wissen: hier geht es nur um Rahmen, Zuordnung von Antworten
 * zu Anfragen und darum, dass auf *jede* eingehende Anfrage eine Antwort folgt.
 *
 * Der letzte Punkt ist kein Stilthema. Der Agent ist einfädig und blockiert,
 * während er auf die Antwort zu `session/request_permission` (oder einer
 * delegierten Datei-/Terminaloperation) wartet. Eine unbeantwortete Anfrage ist
 * damit kein übersehenes Detail, sondern ein stehender Agent. Deshalb wird
 * selbst eine unbekannte Methode beantwortet — mit `-32601`, nicht mit Schweigen.
 */

export const RpcCode = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
} as const;

export class RpcError extends Error {
  readonly code: number;
  readonly data: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = "RpcError";
    this.code = code;
    this.data = data;
  }
}

type Id = number | string;

interface Envelope {
  jsonrpc?: string;
  id?: Id;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
}

export interface PeerHooks {
  /** Eine Zeile zum Gegenüber. Der Zeilenumbruch wird vom Transport angehängt. */
  send(line: string): Promise<void>;
  /** Eine Benachrichtigung ohne Antwortpflicht. */
  onNotification(method: string, params: unknown): void;
  /**
   * Eine Anfrage mit Antwortpflicht. Ein Wurf wird zum JSON-RPC-Fehler.
   * Die `id` wird mitgegeben, weil eine Anfrage, deren Antwort erst später vom
   * Benutzer kommt, in der Oberfläche identifizierbar sein muss.
   */
  onRequest(method: string, params: unknown, id: number | string): Promise<unknown>;
  /** Eine Zeile, die kein gültiges JSON-RPC war. Nur zur Diagnose. */
  onMalformed(line: string, reason: string): void;
}

export class JsonRpcPeer {
  #nextId = 1;
  #pending = new Map<
    Id,
    { resolve: (value: unknown) => void; reject: (reason: Error) => void; method: string }
  >();

  readonly #hooks: PeerHooks;

  constructor(hooks: PeerHooks) {
    this.#hooks = hooks;
  }

  /** Anzahl offener eigener Anfragen — für Anzeige und Tests. */
  get pendingCount(): number {
    return this.#pending.size;
  }

  /**
   * Eine Anfrage. `timeoutMs` nur für Anfragen, die schnell sein *müssen* —
   * ein Zug darf dauern, ein Handschlag nicht. Ohne Frist wartet eine
   * verschluckte Anfrage für immer, und die Oberfläche mit ihr.
   */
  async request<T>(method: string, params?: unknown, timeoutMs?: number): Promise<T> {
    const id = this.#nextId++;
    const line = JSON.stringify({ jsonrpc: "2.0", id, method, params });

    const answer = new Promise<T>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const done = () => timer !== undefined && clearTimeout(timer);
      this.#pending.set(id, {
        resolve: (value) => {
          done();
          (resolve as (value: unknown) => void)(value);
        },
        reject: (reason) => {
          done();
          reject(reason);
        },
        method,
      });
      if (timeoutMs !== undefined) {
        timer = setTimeout(() => {
          if (!this.#pending.delete(id)) return;
          reject(new Error(`${method}: keine Antwort nach ${Math.round(timeoutMs / 1000)} Sekunden`));
        }, timeoutMs);
      }
    });

    try {
      await this.#hooks.send(line);
    } catch (cause) {
      this.#pending.delete(id);
      throw cause instanceof Error ? cause : new Error(String(cause));
    }

    return answer;
  }

  async notify(method: string, params?: unknown): Promise<void> {
    await this.#hooks.send(JSON.stringify({ jsonrpc: "2.0", method, params }));
  }

  /** Eine empfangene Zeile einspeisen. Wirft nie — Fehler gehen an `onMalformed`. */
  receive(line: string): void {
    let msg: Envelope;
    try {
      msg = JSON.parse(line) as Envelope;
    } catch {
      this.#hooks.onMalformed(line, "kein gültiges JSON");
      return;
    }
    if (typeof msg !== "object" || msg === null) {
      this.#hooks.onMalformed(line, "kein JSON-Objekt");
      return;
    }

    const hasId = msg.id !== undefined && msg.id !== null;

    if (typeof msg.method === "string") {
      if (hasId) {
        void this.#answer(msg.id as Id, msg.method, msg.params);
      } else {
        this.#hooks.onNotification(msg.method, msg.params);
      }
      return;
    }

    if (hasId) {
      this.#settle(msg);
      return;
    }

    this.#hooks.onMalformed(line, "weder Anfrage, Benachrichtigung noch Antwort");
  }

  /** Alle offenen Anfragen abbrechen — der Agent kann nicht mehr antworten. */
  rejectAll(reason: string): void {
    const open = [...this.#pending.values()];
    this.#pending.clear();
    for (const entry of open) {
      entry.reject(new RpcError(RpcCode.internalError, `${entry.method}: ${reason}`));
    }
  }

  #settle(msg: Envelope): void {
    const entry = this.#pending.get(msg.id as Id);
    if (!entry) {
      // Antwort auf eine Anfrage, die es nicht gibt: nach einem Neustart
      // möglich, sonst ein Protokollfehler. Nicht werfen, nur melden.
      this.#hooks.onMalformed(
        JSON.stringify(msg),
        `Antwort auf unbekannte Anfrage ${String(msg.id)}`,
      );
      return;
    }
    this.#pending.delete(msg.id as Id);

    if (msg.error) {
      entry.reject(
        new RpcError(
          msg.error.code ?? RpcCode.internalError,
          msg.error.message ?? "Fehler ohne Meldung",
          msg.error.data,
        ),
      );
    } else {
      entry.resolve(msg.result);
    }
  }

  async #answer(id: Id, method: string, params: unknown): Promise<void> {
    let payload: object;
    try {
      payload = {
        jsonrpc: "2.0",
        id,
        result: await this.#hooks.onRequest(method, params, id),
      };
    } catch (cause) {
      const error =
        cause instanceof RpcError
          ? { code: cause.code, message: cause.message, data: cause.data }
          : { code: RpcCode.internalError, message: String(cause) };
      payload = { jsonrpc: "2.0", id, error };
    }
    try {
      await this.#hooks.send(JSON.stringify(payload));
    } catch {
      // Der Agent ist weg. Nichts zu retten, und der Abgang wird ohnehin
      // über das Exit-Ereignis gemeldet.
    }
  }
}
