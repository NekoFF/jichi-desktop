/**
 * Selbstprüfung des Kerns gegen einen erfundenen Agenten.
 *
 * Läuft ohne Fenster, ohne Tauri, ohne installiertes jichi und ohne Modell:
 *
 *     node src/core/selftest.ts
 *
 * Geprüft wird der Ablauf, den man sonst nur von Hand und mit Glück auslöst —
 * ein abgebrochener Zug, eine Berechtigungsfrage, eine Zeile eines toten
 * Prozesses, eine Anfrage, die diese Anwendung nicht anbietet. Genau diese Wege
 * sind die, an denen eine Oberfläche stehen bleibt, und genau sie sieht man beim
 * Klicken nicht.
 */

import { Agent } from "./agent.ts";
import type {
  ConfigReport,
  DoctorReport,
  EnvSpec,
  Readiness,
  SpawnSpec,
  StoredSession,
  Transport,
  TransportEvents,
} from "./transport.ts";

// ── Der erfundene Agent ──────────────────────────────────────────────────────

class FakeAgent implements Transport {
  readonly sent: string[] = [];
  generation = 0;
  #events: TransportEvents | null = null;
  #alive = false;
  spawns: SpawnSpec[] = [];

  // Zustand des Rechners, den der Test stellt.
  readonly schluesselbund = new Map<string, string>();
  konfiguriert = true;
  ordner: string | null = "/tmp/projekt";
  readonly doctorAufrufe: Array<{ program: string; env: EnvSpec[] }> = [];

  async defaultLaunch() {
    return {
      program: "jichi",
      args: ["--acp"],
      resolved: "/usr/local/bin/jichi",
      cwd: "/tmp/werkstatt",
      env: [{ name: "JICHI_API_KEY", file: "~/.config/jlu/apikey.txt" }],
      hint: "",
    };
  }

  async probe() {
    return "jichi 0.10.0";
  }

  async sessions(): Promise<StoredSession[]> {
    return [
      { id: "S0", title: "früheres Gespräch", workspace: "/tmp/alt", mode: "chat", modified: 1, turns: 4 },
    ];
  }

  async start(spec: SpawnSpec) {
    this.spawns.push(spec);
    this.generation += 1;
    this.#alive = true;
    return this.generation;
  }

  async send(line: string) {
    if (!this.#alive) throw new Error("der Agent läuft nicht");
    this.sent.push(line);
  }

  async stop() {
    this.#alive = false;
  }

  async running() {
    return this.#alive;
  }

  #config(): ConfigReport {
    return {
      path: "/heim/.jichi",
      exists: this.konfiguriert,
      problem: null,
      models: this.konfiguriert
        ? [
            {
              name: "coder",
              model: "jlu/qwen3-coder-next",
              apiBase: "https://api.hrz.uni-giessen.de/v1",
              apiKeyEnv: "JICHI_API_KEY",
              roles: [],
            },
          ]
        : [],
    };
  }

  async readiness(): Promise<Readiness> {
    const keyStored = this.schluesselbund.has("JICHI_API_KEY");
    return {
      agent: "/usr/local/bin/jichi",
      version: "jichi 0.10.0",
      config: this.#config(),
      keyStored,
      keyEnv: "JICHI_API_KEY",
      needsSetup: !this.konfiguriert || !keyStored,
    };
  }

  async doctor(program: string, env: EnvSpec[]): Promise<DoctorReport> {
    this.doctorAufrufe.push({ program, env });
    return {
      ok: 34,
      warn: 2,
      fail: 0,
      exit: 0,
      checks: [
        { status: "ok", label: "API key present for the active model", detail: "" },
        { status: "ok", label: "model server reachable", detail: "coder: https://…" },
        { status: "warn", label: "no pricing for the active model", detail: "" },
      ],
    };
  }

  async writeConfig(preset: string): Promise<ConfigReport> {
    if (preset !== "jlu") throw new Error(`unbekannte Vorlage ${preset}`);
    if (this.konfiguriert) throw new Error("gibt es bereits");
    this.konfiguriert = true;
    return this.#config();
  }

  async secretStore(account: string, value: string) {
    this.schluesselbund.set(account, value);
  }

  async secretPresent(account: string) {
    return this.schluesselbund.has(account);
  }

  async secretForget(account: string) {
    this.schluesselbund.delete(account);
  }

  async pickDirectory() {
    return this.ordner;
  }

  async listen(events: TransportEvents) {
    this.#events = events;
    return () => {
      this.#events = null;
    };
  }

  // ── Fläche für den Test ────────────────────────────────────────────────────

  line(payload: object, generation = this.generation) {
    this.#events?.line(generation, JSON.stringify(payload));
  }

  raw(line: string) {
    this.#events?.line(this.generation, line);
  }

  stderr(line: string) {
    this.#events?.stderr(this.generation, line);
  }

  exit(code: number | null) {
    this.#alive = false;
    this.#events?.exit(this.generation, code);
  }

  /** Die Id der jüngsten eigenen Anfrage mit dieser Methode. */
  idOf(method: string): number {
    for (let i = this.sent.length - 1; i >= 0; i -= 1) {
      const msg = JSON.parse(this.sent[i]) as { method?: string; id?: number };
      if (msg.method === method && msg.id !== undefined) return msg.id;
    }
    throw new Error(`keine offene Anfrage ${method}`);
  }

  reply(method: string, result: unknown) {
    this.line({ jsonrpc: "2.0", id: this.idOf(method), result });
  }

  update(update: object, sessionId = "S1") {
    this.line({ jsonrpc: "2.0", method: "session/update", params: { sessionId, update } });
  }

  /** Die jüngste Nachricht, die kein eigener Aufruf war — also eine Antwort. */
  answers(): Array<{ id?: number; result?: unknown; error?: { code: number } }> {
    return this.sent
      .map((l) => JSON.parse(l) as { id?: number; method?: string; result?: unknown; error?: { code: number } })
      .filter((m) => m.method === undefined);
  }
}

// ── Prüfgerüst ───────────────────────────────────────────────────────────────

const settle = () => new Promise((r) => setTimeout(r, 0));

let passed = 0;
const failures: string[] = [];

function check(what: string, ok: boolean, detail = ""): void {
  if (ok) {
    passed += 1;
    console.log(`ok   ${what}`);
  } else {
    failures.push(what);
    console.log(`NICHT OK  ${what}${detail ? ` — ${detail}` : ""}`);
  }
}

// ── Der Ablauf ───────────────────────────────────────────────────────────────

// ── Erster Start ─────────────────────────────────────────────────────────────

const frisch = new FakeAgent();
frisch.konfiguriert = false; // frischer Rechner: keine Konfiguration, kein Schlüssel
const neuling = new Agent(frisch);

await neuling.init();
check("frischer Rechner verlangt den ersten Start", neuling.getSnapshot().needsSetup);
check("vor der Einrichtung darf nicht gesendet werden", !neuling.getSnapshot().canSend);

const bericht = await neuling.setup("sk-test-geheim-12345");
check("der Agent prüft sich selbst", bericht.ok === 34 && bericht.fail === 0);
check("der Schlüssel liegt im Schlüsselbund", frisch.schluesselbund.get("JICHI_API_KEY") === "sk-test-geheim-12345");
check("die Konfiguration des Agenten wurde angelegt", frisch.konfiguriert);
check("nach der Einrichtung ist alles bereit", !neuling.getSnapshot().needsSetup && neuling.getSnapshot().canSend);

const uebergeben = frisch.doctorAufrufe[frisch.doctorAufrufe.length - 1]?.env ?? [];
check(
  "der Schlüssel wird als Schlüsselbund-Konto übergeben, nie als Wert",
  uebergeben.some((e) => e.name === "JICHI_API_KEY" && e.secret === "JICHI_API_KEY") &&
    uebergeben.every((e) => e.value === undefined),
  JSON.stringify(uebergeben),
);
check(
  "der Schlüssel taucht nirgends im Zustand auf",
  !JSON.stringify(neuling.getSnapshot()).includes("sk-test-geheim"),
);

// Ein Projekt öffnen heißt: Verzeichnis wechseln *und* dort eine neue Sitzung
// beginnen. Der Handschlag wird hier von Hand beantwortet.
const geoeffnet = neuling.pickWorkspace();
await settle();
frisch.reply("initialize", { protocolVersion: 1, agentCapabilities: {} });
await settle();
frisch.reply("session/new", { sessionId: "S-neu" });
await geoeffnet;
check("ein gewählter Ordner wird zum Arbeitsverzeichnis", neuling.getSnapshot().cwd === "/tmp/projekt");
check(
  "und der Agent arbeitet dort in einer neuen Sitzung",
  neuling.getSnapshot().sessionId === "S-neu" &&
    frisch.spawns[frisch.spawns.length - 1]?.cwd === "/tmp/projekt",
);

await neuling.forgetKey();
check("ohne Schlüssel verlangt die Anwendung wieder den ersten Start", neuling.getSnapshot().needsSetup);

// ── Gespräch ─────────────────────────────────────────────────────────────────

const fake = new FakeAgent();
fake.schluesselbund.set("JICHI_API_KEY", "sk-vorhanden");
const agent = new Agent(fake);

await agent.init();
check("offline, solange nichts gestartet wurde", agent.getSnapshot().status === "offline");
check("darf senden, obwohl offline", agent.getSnapshot().canSend);
check("gespeicherte Sitzungen für die Seitenleiste", agent.getSnapshot().sessions.length === 1);
check(
  "Arbeitsverzeichnis kommt von der Plattform",
  agent.getSnapshot().cwd === "/tmp/werkstatt",
  String(agent.getSnapshot().cwd),
);

// Senden baut die Verbindung selbst auf.
const turn = agent.send("Erklär mir dieses Projekt");
await settle();
check(
  "der Schlüssel wird als Schlüsselbund-Konto übergeben, nie als Wert",
  fake.spawns[0]?.env?.some((e) => e.name === "JICHI_API_KEY" && e.secret === "JICHI_API_KEY") ===
    true && fake.spawns[0]?.env?.every((e) => e.value === undefined) === true,
  JSON.stringify(fake.spawns[0]?.env),
);
check("initialize ging hinaus", fake.sent.some((l) => l.includes('"initialize"')));
check(
  "es wird keine Datei- oder Terminalfähigkeit angemeldet",
  JSON.parse(fake.sent[0]).params.clientCapabilities.terminal === false,
);

fake.reply("initialize", {
  protocolVersion: 1,
  agentCapabilities: { loadSession: true, promptCapabilities: { image: false } },
});
await settle();
fake.reply("session/new", { sessionId: "S1" });
await settle();

check("Sitzung steht", agent.getSnapshot().sessionId === "S1");
check("Zug läuft", agent.getSnapshot().status === "busy", agent.getSnapshot().status);
check("die eigene Eingabe steht im Verlauf", agent.getSnapshot().transcript.length === 1);

// Gestreamter Text: viele Schnipsel, eine Nachricht.
for (const piece of ["Ich ", "sehe ", "mir ", "die ", "Dateien ", "an."]) {
  fake.update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: piece } });
}
const trail = agent.getSnapshot().transcript;
const streamed = trail[trail.length - 1];
check(
  "Schnipsel wachsen zu einer Nachricht zusammen",
  streamed?.kind === "message" && streamed.text === "Ich sehe mir die Dateien an." && streamed.streaming,
  JSON.stringify(streamed),
);
check("kein Eintrag pro Schnipsel", agent.getSnapshot().transcript.length === 2);

// Eine Zeile einer *fremden* Sitzung darf den Verlauf nicht anfassen.
fake.update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "FREMD" } }, "S9");
check(
  "Nachricht einer anderen Sitzung wird verworfen",
  !JSON.stringify(agent.getSnapshot().transcript).includes("FREMD"),
);

// Ein Werkzeug läuft und wird fertig.
fake.update({
  sessionUpdate: "tool_call",
  toolCallId: "t1",
  title: "read_file src/main.c",
  kind: "read",
  status: "in_progress",
});
fake.update({
  sessionUpdate: "tool_call_update",
  toolCallId: "t1",
  status: "completed",
  content: [{ type: "content", content: { type: "text", text: "int main(void) { return 0; }" } }],
});
const tool = agent.getSnapshot().transcript.find((i) => i.kind === "tool");
check(
  "aus zwei Meldungen wird eine Werkzeugkarte",
  tool?.kind === "tool" && tool.status === "completed" && tool.output.includes("int main"),
  JSON.stringify(tool),
);
check(
  "die Karte wird nicht verdoppelt",
  agent.getSnapshot().transcript.filter((i) => i.kind === "tool").length === 1,
);

// Eine Berechtigungsfrage — hier blockiert ein echter Agent.
fake.line({
  jsonrpc: "2.0",
  id: 77,
  method: "session/request_permission",
  params: {
    sessionId: "S1",
    toolCall: { toolCallId: "t2", title: "write_file notes.txt", kind: "edit" },
    options: [
      { optionId: "allow_once", name: "Erlauben", kind: "allow_once" },
      { optionId: "reject_once", name: "Ablehnen", kind: "reject_once" },
    ],
  },
});
await settle();
check(
  "die Frage liegt der Oberfläche vor",
  agent.getSnapshot().permission?.toolCallId === "t2" &&
    agent.getSnapshot().permission?.options.length === 2,
);
check("Abbrechen ist währenddessen möglich", agent.getSnapshot().canCancel);

agent.answerPermission("allow_once");
await settle();
const granted = fake.answers().find((a) => a.id === 77);
check(
  "die Antwort trägt die Id der Anfrage",
  JSON.stringify(granted?.result) === JSON.stringify({ outcome: { outcome: "selected", optionId: "allow_once" } }),
  JSON.stringify(granted),
);
check("die Frage ist weg", agent.getSnapshot().permission === null);

// Eine Anfrage, die diese Anwendung nicht anbietet: beantworten, nicht schweigen.
fake.line({ jsonrpc: "2.0", id: 78, method: "fs/read_text_file", params: { path: "/etc/passwd" } });
await settle();
const refused = fake.answers().find((a) => a.id === 78);
check(
  "unangebotene Methode wird mit -32601 beantwortet",
  refused?.error?.code === -32601,
  JSON.stringify(refused),
);

// stderr: in die Diagnose, und Warnungen zusätzlich in den Verlauf — genau einmal.
fake.stderr("warning: no API key found: $JICHI_API_KEY is not set in the environment.");
fake.stderr("warning: no API key found: $JICHI_API_KEY is not set in the environment.");
fake.stderr("debug: irgendetwas");
check("stderr landet in der Diagnose", agent.getSnapshot().diagnostics.length === 3);
check(
  "die Warnung erscheint genau einmal im Verlauf",
  agent.getSnapshot().transcript.filter((i) => i.kind === "notice" && i.text.includes("API key")).length === 1,
);

// Müll auf stdout darf nichts umbringen.
fake.raw("das ist kein JSON");
check("kaputte Zeile bricht nichts ab", agent.getSnapshot().status === "busy");

fake.reply("session/prompt", { stopReason: "end_turn" });
await turn;
check("nach dem Zug wieder bereit", agent.getSnapshot().status === "ready");
check(
  "kein Text wächst mehr nach",
  agent.getSnapshot().transcript.every((i) => i.kind !== "message" || !i.streaming),
);

// ── Abbruch ──────────────────────────────────────────────────────────────────

const second = agent.send("mach das lange Ding");
await settle();
fake.update({ sessionUpdate: "tool_call", toolCallId: "t3", title: "run_tests", kind: "execute" });
await agent.cancel();
check("Abbruch wurde als Benachrichtigung gesendet", fake.sent.some((l) => l.includes("session/cancel")));
check("Zustand zeigt den Abbruch", agent.getSnapshot().status === "cancelling");

fake.reply("session/prompt", { stopReason: "cancelled" });
await second;
const hung = agent.getSnapshot().transcript.find((i) => i.kind === "tool" && i.toolCallId === "t3");
check(
  "ein hängendes Werkzeug bleibt nicht für immer am Laufen",
  hung?.kind === "tool" && hung.status === "failed",
  JSON.stringify(hung),
);

// ── Der Agent stirbt ─────────────────────────────────────────────────────────

const third = agent.send("und noch was");
await settle();
const deadGeneration = fake.generation;
fake.exit(9);
await third;
check("Abgang wird zu offline", agent.getSnapshot().status === "offline");
check(
  "der Abgang steht als Fehler im Verlauf",
  agent.getSnapshot().transcript.some((i) => i.kind === "notice" && i.level === "error"),
);

// Nachhall des toten Kindes: eine Zeile mit alter Generation nach dem Neustart.
const lengthBefore = agent.getSnapshot().transcript.length;
fake.line(
  { jsonrpc: "2.0", method: "session/update", params: { sessionId: "S1", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "GEIST" } } } },
  deadGeneration - 1,
);
check(
  "Zeilen eines toten Kindes werden verworfen",
  agent.getSnapshot().transcript.length === lengthBefore,
);

// ── Ergebnis ─────────────────────────────────────────────────────────────────

console.log(`\n${passed} Prüfungen bestanden, ${failures.length} fehlgeschlagen`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  // Werfen statt `process.exitCode`: so ist der Rückgabewert ungleich null, ohne
  // dass dieser Kern Node-Typen braucht. Geprüft wird am Rückgabewert.
  throw new Error(`${failures.length} Prüfungen fehlgeschlagen`);
}
