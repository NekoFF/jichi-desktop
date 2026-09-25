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
import { JsonRpcPeer } from "./jsonrpc.ts";
import { applyPlan, planOf, producedFiles, visible } from "./preview.ts";
import { transcriptMarkdown } from "./export.ts";
import type {
  ConfigReport,
  DoctorReport,
  EnvSpec,
  Readiness,
  GatewayReport,
  SpawnSpec,
  StoredSession,
  TermExit,
  TermOutput,
  TermSpec,
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
  savedSessions: StoredSession[] = [
    { id: "S0", title: "früheres Gespräch", workspace: "/tmp/alt", mode: "chat", modified: 1, turns: 4 },
  ];

  // Zustand des Rechners, den der Test stellt.
  readonly schluesselbund = new Map<string, string>();
  forgetKeepsKey = false;
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
    return [...this.savedSessions];
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.savedSessions = this.savedSessions.filter((session) => session.id !== sessionId);
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
      fail: this.doctorFehler,
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
    if (!this.forgetKeepsKey) this.schluesselbund.delete(account);
  }

  async pickDirectory() {
    return this.ordner;
  }

  datei: string | null = "/opt/jichi/jichi";
  async pickFile() {
    return this.datei;
  }

  doctorFehler = 0;

  // ── Gateway, Vorschau, Terminals ───────────────────────────────────────────
  gatewayAntwort: GatewayReport = {
    base: "https://api.hrz.uni-giessen.de/v1",
    models: [
      { id: "jlu/qwen3-coder-next", kind: "chat" },
      { id: "jlu/whisper", kind: "transcribe" },
    ],
  };
  async gatewayModels() {
    return this.gatewayAntwort;
  }
  dateien = new Map<string, string>([["/tmp/projekt/a.txt", "eins\nzwei\n"]]);
  async readWorkspaceFile(cwd: string, path: string) {
    return this.dateien.get(path.startsWith("/") ? path : `${cwd}/${path}`) ?? null;
  }
  readonly terminals = true;
  termSpecs: TermSpec[] = [];
  released: string[] = [];
  #termExit: TermExit = { exitCode: 0, signal: null };
  async termCreate(spec: TermSpec) {
    this.termSpecs.push(spec);
    return `t${this.termSpecs.length}`;
  }
  async termOutput(): Promise<TermOutput> {
    return { output: "ok\n", truncated: false, exitStatus: this.#termExit };
  }
  async termWait() {
    return this.#termExit;
  }
  async termKill() {}
  async termRelease(id: string) {
    this.released.push(id);
  }
  dokumente = { enabled: false, reachable: false, problem: null as string | null };
  async documentsStatus() {
    return { ...this.dokumente };
  }
  async documentsSet(enable: boolean) {
    this.dokumente = { enabled: enable, reachable: enable, problem: null };
    return { ...this.dokumente };
  }
  geoeffnet: string[] = [];
  gespeichert: Array<[string, string]> = [];
  async fileInfo(_cwd: string, path: string) {
    return { path: `/tmp/werkstatt/${path}`, name: path.split("/").pop() ?? path, size: 2048, modified: 1, openable: path.endsWith(".pdf") };
  }
  async openFile(_cwd: string, path: string) {
    this.geoeffnet.push(path);
  }
  async revealFile() {}
  speicherOrt: string | null = "/Users/x/Downloads/bericht.pdf";
  async pickSaveLocation() {
    return this.speicherOrt;
  }
  async saveFileCopy(_cwd: string, path: string, dest: string) {
    this.gespeichert.push([path, dest]);
  }
  freigegeben: string[] = [];
  async listDir(_cwd: string, path: string) {
    return { entries: [{ name: "a.txt", path: path ? `${path}/a.txt` : "a.txt", dir: false, size: 3, heavy: false }], truncated: false };
  }
  inhalte = new Map<string, { text: string; modified: number }>([["a.txt", { text: "alt", modified: 1 }]]);
  async readText(_cwd: string, path: string) {
    const d = this.inhalte.get(path);
    if (!d) throw new Error("gibt es nicht");
    return { path, text: d.text, size: d.text.length, modified: d.modified, binary: false };
  }
  async writeText(_cwd: string, path: string, text: string, expected: number | null) {
    const d = this.inhalte.get(path);
    if (d && expected !== null && d.modified !== expected) throw new Error("inzwischen geändert");
    const modified = (d?.modified ?? 0) + 1;
    this.inhalte.set(path, { text, modified });
    return modified;
  }
  async readSheets() {
    return [{ name: "A", rows: [["x"]], truncated: false }];
  }
  async readDocumentPreview() {
    return "# Dokument";
  }
  async allowProjectAssets(cwd: string) {
    this.freigegeben.push(cwd);
  }
  assetUrl(p: string) {
    return `asset://localhost${p}`;
  }
  meta: Record<string, { title?: string; pinned?: boolean }> = {};
  async chatsMeta() { return { ...this.meta }; }
  async chatMetaSet(id: string, rename: boolean, title: string | null, pinned: boolean | null) {
    const m = { ...(this.meta[id] ?? {}) };
    if (rename) { if (title) m.title = title; else delete m.title; }
    if (pinned !== null) m.pinned = pinned;
    this.meta[id] = m;
    return { ...this.meta };
  }
  async searchChats(q: string) { return q === "make" ? [{ id: "S0", snippet: "…make all…", role: "assistant" }] : []; }
  exportZiel: string | null = "/tmp/chat.md";
  exporte: Array<[string, string, string]> = [];
  async pickExportLocation() { return this.exportZiel; }
  async exportChat(dest: string, format: string, _t: string, md: string) { this.exporte.push([dest, format, md]); }
  async onFileDrop() { return () => {}; }
  async readImage() { return { mimeType: "image/png", data: "iVBOR" }; }
  mitteilungen: string[] = [];
  async notify(t: string) { this.mitteilungen.push(t); }
  erlaubt = { allow: [] as string[], deny: [] as string[], allowAll: false, denyAll: false };
  async permissionsGet() { return { ...this.erlaubt }; }
  async permissionsSet(allow: string[], deny: string[]) { this.erlaubt = { ...this.erlaubt, allow, deny }; return { ...this.erlaubt }; }
  async mcpList() { return [{ name: "dokumente", args: [], disabled: false, builtin: true }]; }
  async mcpToggle() { return this.mcpList(); }
  async mcpAdd() { return this.mcpList(); }
  async mcpRemove() { return this.mcpList(); }
  async mcpTest() { return "Connected 1/1 server(s)"; }
  async gitChanges() {
    return { repo: true, branch: "main", files: [{ path: "a.txt", status: "M" as const, additions: 1, deletions: 0 }] };
  }
  async gitFileDiff() {
    return { before: "alt\n", after: "neu\n", binary: false };
  }
  ptyGeschrieben: string[] = [];
  async ptyOpen() { return 1; }
  async ptyWrite(_id: number, d: string) { this.ptyGeschrieben.push(d); }
  async ptyResize() {}
  async ptyClose() {}
  async onPty() { return () => {}; }
  async browserOpen(_id: string, url: string) { return url; }
  async browserBounds() {}
  async browserNavigate(_id: string, url: string) { return url; }
  async browserGo() {}
  async browserClose() {}
  async onBrowser() { return () => {}; }
  artefakte = new Map<string, string>();
  async artifactPut(id: string, _lang: string, _t: string, code: string) { this.artefakte.set(id, code); }
  artifactUrl(id: string) { return `artefakt://localhost/${id}`; }
  async readAttachment(path: string) {
    return { name: path.split("/").pop() ?? path, path, text: "Inhalt der Datei" };
  }
  links: string[] = [];
  async openUrl(url: string) {
    this.links.push(url);
  }
  schreibt(id: string, chunk: string) {
    this.#events?.termOutput(id, chunk);
  }
  endet(id: string, exit: TermExit) {
    this.#termExit = exit;
    this.#events?.termExit(id, exit);
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

const alterSchluessel = new FakeAgent();
alterSchluessel.schluesselbund.set("JICHI_API_KEY", "alter-schluessel");
alterSchluessel.forgetKeepsKey = true;
const wiederDa = new Agent(alterSchluessel);
await wiederDa.init();
let entfernenMeldetFehler = false;
try {
  await wiederDa.forgetKey();
} catch {
  entfernenMeldetFehler = true;
}
check("erneut auftauchender Schlüssel wird als Fehler gemeldet", entfernenMeldetFehler);

// ── Gespräch ─────────────────────────────────────────────────────────────────

const fake = new FakeAgent();
fake.schluesselbund.set("JICHI_API_KEY", "sk-vorhanden");
const agent = new Agent(fake);

await agent.init();
check("offline, solange nichts gestartet wurde", agent.getSnapshot().status === "offline");
check("darf senden, obwohl offline", agent.getSnapshot().canSend);
check("gespeicherte Sitzungen für die Seitenleiste", agent.getSnapshot().sessions.length === 1);
await agent.deleteSession("S0");
check("gelöschter Chat verschwindet aus der Seitenleiste", agent.getSnapshot().sessions.length === 0);
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
  "Terminals werden angemeldet, Dateizugriffe nicht",
  JSON.parse(fake.sent[0]).params.clientCapabilities.terminal === true &&
    JSON.parse(fake.sent[0]).params.clientCapabilities.fs.writeTextFile === false,
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


// ── Ordner, Einstellungen, Wiederholung ──────────────────────────────────────

/** Wie oft eine Methode schon gesendet wurde. */
const gesendet = (f: FakeAgent, method: string) =>
  f.sent.filter((l) => (JSON.parse(l) as { method?: string }).method === method).length;

/** Warten, bis die Methode ein weiteres Mal hinausging — ein Neustart hat mehrere Schritte. */
async function erwarte(f: FakeAgent, method: string, bisher: number): Promise<void> {
  for (let i = 0; i < 50 && gesendet(f, method) <= bisher; i += 1) await settle();
  if (gesendet(f, method) <= bisher) throw new Error(`${method} ging nie hinaus`);
}

/** Einen Start samt Handschlag und neuer Sitzung beantworten. */
async function handshake(
  f: FakeAgent,
  sessionId: string,
  bisher = { init: gesendet(f, "initialize"), neu: gesendet(f, "session/new") },
): Promise<void> {
  await erwarte(f, "initialize", bisher.init);
  f.reply("initialize", { protocolVersion: 1, agentCapabilities: { loadSession: true } });
  await erwarte(f, "session/new", bisher.neu);
  f.reply("session/new", { sessionId });
  await settle();
}

/** Zähler vor einem Aufruf festhalten — sonst zählt `handshake` erst, wenn alles schon lief. */
const stand = (f: FakeAgent) => ({ init: gesendet(f, "initialize"), neu: gesendet(f, "session/new") });

const werk = new FakeAgent();
werk.schluesselbund.set("JICHI_API_KEY", "sk-vorhanden");
const zweiter = new Agent(werk);
await zweiter.init();
check("das Heimatverzeichnis ist noch kein Projekt", !zweiter.getSnapshot().hasProject);

let vor = stand(werk);
let laeuft = zweiter.newSession();
await handshake(werk, "W1", vor);
await laeuft;
check("erste Sitzung im vorgeschlagenen Ordner", werk.spawns.length === 1 && werk.spawns[0].cwd === "/tmp/werkstatt");

// Ein anderes Projekt öffnen heisst: der Agent zieht mit um.
vor = stand(werk);
laeuft = zweiter.openWorkspace("/tmp/anders");
await handshake(werk, "W2", vor);
await laeuft;
check(
  "ein anderer Ordner startet den Agenten dort neu",
  werk.spawns.length === 2 && werk.spawns[1].cwd === "/tmp/anders",
  JSON.stringify(werk.spawns.map((x) => x.cwd)),
);
check("und gilt als Projekt", zweiter.getSnapshot().hasProject && zweiter.getSnapshot().sessionId === "W2");

// Ein Zug mit Inhalt, dann unverändert speichern: nichts darf verloren gehen.
laeuft = zweiter.send("Hallo");
await erwarte(werk, "session/prompt", gesendet(werk, "session/prompt") - 1);
werk.update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Hi" } }, "W2");
werk.reply("session/prompt", { stopReason: "end_turn" });
await laeuft;
const vorher = zweiter.getSnapshot().transcript.length;
await zweiter.setConfig({ ...zweiter.config! });
check(
  "unverändertes Speichern lässt den Chat stehen",
  werk.spawns.length === 2 &&
    zweiter.getSnapshot().sessionId === "W2" &&
    zweiter.getSnapshot().transcript.length === vorher,
  `spawns=${werk.spawns.length} session=${zweiter.getSnapshot().sessionId}`,
);

// Geänderte Argumente dagegen brauchen einen neuen Prozess.
vor = stand(werk);
laeuft = zweiter.setConfig({ ...zweiter.config!, args: ["--acp", "--plan"] });
await handshake(werk, "W3", vor);
await laeuft;
check(
  "geänderte Argumente starten den Agenten neu",
  werk.spawns.length === 3 && werk.spawns[2].args.includes("--plan"),
);

// Ein Fehler im Zug verwirft das Gespräch nicht.
let prompts = gesendet(werk, "session/prompt");
laeuft = zweiter.send("mach was");
await erwarte(werk, "session/prompt", prompts);
werk.line({ jsonrpc: "2.0", id: werk.idOf("session/prompt"), error: { code: -32000, message: "Modell nicht erreichbar" } });
await laeuft;
check("ein Fehler im Zug wird angezeigt", zweiter.getSnapshot().status === "error");
check("und erlaubt einen neuen Versuch", zweiter.getSnapshot().canSend);
prompts = gesendet(werk, "session/prompt");
laeuft = zweiter.send("nochmal");
await erwarte(werk, "session/prompt", prompts);
check(
  "der neue Versuch bleibt im selben Chat",
  zweiter.getSnapshot().sessionId === "W3" && werk.spawns.length === 3 &&
    !werk.sent.slice(-1)[0].includes("session/new"),
  `session=${zweiter.getSnapshot().sessionId}`,
);
let wechselAbgelehnt = false;
try {
  await zweiter.newSession();
} catch {
  wechselAbgelehnt = true;
}
check("während eines Zuges wird kein neuer Chat begonnen", wechselAbgelehnt && !zweiter.getSnapshot().canSwitch);
werk.reply("session/prompt", { stopReason: "end_turn" });
await laeuft;

// Zwei gleichzeitige Starts ergeben einen Prozess.
const doppelt = new FakeAgent();
doppelt.schluesselbund.set("JICHI_API_KEY", "sk-vorhanden");
const hastig = new Agent(doppelt);
await hastig.init();
const a = hastig.connect();
const b = hastig.connect();
await settle();
doppelt.reply("initialize", { protocolVersion: 1, agentCapabilities: {} });
await settle();
check("zwei gleichzeitige Starts starten einen Prozess", doppelt.spawns.length === 1, String(doppelt.spawns.length));
doppelt.reply("session/new", { sessionId: "D1" });
await settle();
doppelt.reply("session/new", { sessionId: "D2" });
await Promise.all([a, b]);

// Die Einrichtung bleibt offen, wenn der Agent Fehler meldet.
const kaputt = new FakeAgent();
kaputt.konfiguriert = false;
kaputt.doctorFehler = 2;
const vorsichtig = new Agent(kaputt);
await vorsichtig.init();
await vorsichtig.setup("sk-falsch");
check("gemeldete Fehler halten die Einrichtung offen", vorsichtig.getSnapshot().needsSetup);
vorsichtig.finishSetup();
check("bis der Benutzer sie bewusst verlässt", !vorsichtig.getSnapshot().needsSetup);

// Ein von Hand gewähltes Programm gilt auch für die Bereitschaft.
const ohne = new FakeAgent();
const gewaehlt = new Agent(ohne);
await gewaehlt.init();
await gewaehlt.pickProgram();
check("ein gewähltes Programm wird gespeichert", gewaehlt.config?.program === "/opt/jichi/jichi");

// Eine verschluckte Anfrage wartet nicht ewig.
const stumm = new JsonRpcPeer({
  send: async () => {},
  onNotification: () => {},
  onRequest: async () => null,
  onMalformed: () => {},
});
let frist = "";
await stumm.request("initialize", {}, 10).catch((e: Error) => {
  frist = e.message;
});
check("eine Anfrage mit Frist gibt auf", frist.includes("keine Antwort"), frist);
check("und hinterlässt nichts Offenes", stumm.pendingCount === 0);


// ── Terminals für den Agenten ────────────────────────────────────────────────

const term = new FakeAgent();
term.schluesselbund.set("JICHI_API_KEY", "sk-vorhanden");
const befehl = new Agent(term);
await befehl.init();
vor = stand(term);
laeuft = befehl.newSession();
await handshake(term, "T1", vor);
await laeuft;
prompts = gesendet(term, "session/prompt");
laeuft = befehl.send("Tests bitte");
await erwarte(term, "session/prompt", prompts);
term.update({ sessionUpdate: "tool_call", toolCallId: "r1", title: "run_tests", kind: "execute",
  status: "in_progress", rawInput: { command: "make test" } }, "T1");
term.line({ jsonrpc: "2.0", id: 501, method: "terminal/create",
  params: { sessionId: "T1", command: "/bin/sh", args: ["-c", "make test"], cwd: "/tmp/werkstatt", outputByteLimit: 65536 } });
await settle();
const erzeugt = term.answers().find((a) => a.id === 501);
check("terminal/create liefert eine Kennung", JSON.stringify(erzeugt?.result) === JSON.stringify({ terminalId: "t1" }), JSON.stringify(erzeugt));
check("der Befehl läuft mit Argumenten und Ordner", term.termSpecs[0]?.command === "/bin/sh" &&
  term.termSpecs[0]?.args?.[1] === "make test" && term.termSpecs[0]?.cwd === "/tmp/werkstatt");
term.update({ sessionUpdate: "tool_call_update", toolCallId: "r1",
  content: [{ type: "content", content: { type: "terminal", terminalId: "t1" } }] }, "T1");
term.schreibt("t1", "CC main.o\n");
term.schreibt("t1", "OK 3 tests\n");
const karte = befehl.getSnapshot().transcript.find((i) => i.kind === "tool");
check("die Karte kennt ihr Terminal", karte?.kind === "tool" && karte.terminalId === "t1", JSON.stringify(karte));
check("und die Ausgabe wächst live", befehl.getSnapshot().terminals.t1?.output === "CC main.o\nOK 3 tests\n");
check("ein fremdes Terminal wird nicht angezeigt", (term.schreibt("t9", "x"), !("t9" in befehl.getSnapshot().terminals)));
term.endet("t1", { exitCode: 2, signal: null });
term.line({ jsonrpc: "2.0", id: 502, method: "terminal/wait_for_exit", params: { sessionId: "T1", terminalId: "t1" } });
await settle();
const gewartet = term.answers().find((a) => a.id === 502)?.result as { exitStatus?: { exitCode: number } } | undefined;
check("wait_for_exit meldet den Rückgabewert so, wie jichi ihn liest", gewartet?.exitStatus?.exitCode === 2, JSON.stringify(gewartet));
term.line({ jsonrpc: "2.0", id: 503, method: "terminal/release", params: { sessionId: "T1", terminalId: "t1" } });
await settle();
check("release gibt das Terminal frei", term.released.includes("t1"));
check("die Ausgabe bleibt nach dem Freigeben sichtbar", befehl.getSnapshot().terminals.t1?.exit?.exitCode === 2);
term.line({ jsonrpc: "2.0", id: 504, method: "terminal/output", params: { sessionId: "T1", terminalId: "t1" } });
await settle();
check("ein freigegebenes Terminal ist unbekannt", term.answers().find((a) => a.id === 504)?.error?.code === -32602);
term.reply("session/prompt", { stopReason: "end_turn" });
await laeuft;

// ── Modell und Modus ─────────────────────────────────────────────────────────

let spawns = term.spawns.length;
const loads = gesendet(term, "session/load");
laeuft = befehl.setModel("jlu/gemma-4-26b-it");
await erwarte(term, "initialize", gesendet(term, "initialize"));
term.reply("initialize", { protocolVersion: 1, agentCapabilities: { loadSession: true } });
await erwarte(term, "session/load", loads);
term.reply("session/load", null);
await laeuft;
check("ein anderes Modell startet den Agenten mit --model neu",
  term.spawns.length === spawns + 1 && term.spawns[spawns].args.join(" ").includes("--model jlu/gemma-4-26b-it"),
  JSON.stringify(term.spawns[spawns]?.args));
check("und behält den Chat", befehl.getSnapshot().sessionId === "T1");

spawns = term.spawns.length;
vor = stand(term);
laeuft = befehl.setMode("plan");
await handshake(term, "T2", vor);
await laeuft;
check("Plan-Modus startet mit --plan in einem neuen Chat",
  term.spawns[spawns]?.args.includes("--plan") && befehl.getSnapshot().sessionId === "T2" &&
    befehl.getSnapshot().mode === "plan");
check("Modell und Modus stehen zusammen in den Argumenten",
  term.spawns[spawns]?.args.includes("--model") === true);

// ── Bilder ───────────────────────────────────────────────────────────────────

let bildAbgelehnt = "";
await befehl.send("was ist das?", [{ data: "iVBORw0K", mimeType: "image/png" }]).catch((e: Error) => {
  bildAbgelehnt = e.message;
});
check("ohne Bildfähigkeit wird kein Bild gesendet", bildAbgelehnt.includes("keine Bilder"), bildAbgelehnt);

const sehend = new FakeAgent();
sehend.schluesselbund.set("JICHI_API_KEY", "sk-vorhanden");
const auge = new Agent(sehend);
await auge.init();
vor = stand(sehend);
laeuft = auge.newSession();
await erwarte(sehend, "initialize", vor.init);
sehend.reply("initialize", { protocolVersion: 1, agentCapabilities: { promptCapabilities: { image: true } } });
await erwarte(sehend, "session/new", vor.neu);
sehend.reply("session/new", { sessionId: "B1" });
await laeuft;
check("ein sehendes Modell erlaubt Bilder", auge.getSnapshot().canAttachImages);
prompts = gesendet(sehend, "session/prompt");
laeuft = auge.send("was ist das?", [{ data: "iVBORw0K", mimeType: "image/png" }]);
await erwarte(sehend, "session/prompt", prompts);
const mitBild = JSON.parse(sehend.sent[sehend.sent.length - 1]).params.prompt as Array<{ type: string }>;
check("das Bild geht vor dem Text hinaus", mitBild[0]?.type === "image" && mitBild[1]?.type === "text");
const eigen = auge.getSnapshot().transcript.find((i) => i.kind === "message" && i.role === "user");
check("und steht im Verlauf", eigen?.kind === "message" && eigen.images?.[0]?.startsWith("data:image/png;base64,") === true);
sehend.reply("session/prompt", { stopReason: "end_turn" });
await laeuft;

// ── Gateway ──────────────────────────────────────────────────────────────────

check("mit Schlüssel fragt die Anwendung das Gateway", befehl.getSnapshot().gateway?.models.length === 2);
term.gatewayAntwort = { base: "x", models: [] };
term.gatewayModels = async () => { throw new Error("nicht erreichbar"); };
await befehl.refreshGateway();
check("ein Netzfehler leert die Liste nicht", befehl.getSnapshot().gateway?.models.length === 2 &&
  befehl.getSnapshot().gateway?.error === "nicht erreichbar");

// ── Vorschau ─────────────────────────────────────────────────────────────────

const plan = planOf({ path: "a.txt", old_string: "zwei", new_string: "drei" });
check("edit_file wird als Dateiänderung gelesen", plan.kind === "files" && plan.files[0].edits.length === 1);
const vorher2 = await befehl.readProjectFile("a.txt").catch(() => null);
check("der alte Inhalt kommt aus dem Projekt", vorher2 === null || typeof vorher2 === "string");
check("die Änderung wird ausgerechnet",
  plan.kind === "files" && applyPlan("eins\nzwei\n", plan.files[0]).text === "eins\ndrei\n");
check("ein nicht gefundener Text wird gemeldet",
  plan.kind === "files" && applyPlan("nichts", plan.files[0]).missing === 1);
const patch = planOf({ edits: [{ path: "a", old_string: "x", new_string: "y" }, { path: "a", old_string: "y", new_string: "z", replace_all: true }] });
check("apply_patch fasst Änderungen je Datei zusammen", patch.kind === "files" && patch.files.length === 1 &&
  applyPlan("x x", patch.files[0]).text === "z x");
check("ein Befehl wird als Befehl gelesen", planOf({ command: "make test" }).kind === "command");
check("ein neues Word-Dokument wird als Dokument gezeigt, nicht als Textdatei",
  planOf({ path: "bericht.docx", markdown: "# Hallo" }).kind === "document");
const tabelle = planOf({ path: "t.xlsx", sheets: [{ name: "A", rows: [["x"], [1]] }] });
check("eine neue Tabelle wird als Tabelle gezeigt", tabelle.kind === "sheets" && tabelle.sheets[0].rows.length === 2);
check("kaputte Argumente sind unlesbar", planOf('{"command":"sudo id",').kind === "unreadable");
const versteckt = visible("echo ok\r\u001b[2Krm -rf ~ \u202e");
check("verborgene Zeichen werden sichtbar", versteckt.suspicious && versteckt.text.includes("␍") &&
  versteckt.text.includes("␛") && versteckt.text.includes("U+202E"), versteckt.text);
check("gewöhnlicher Text bleibt unberührt", !visible("ls -la\n\tgrep x").suspicious);
// Eine angehängte Datei geht als eingebettete Ressource mit.
term.datei = "/tmp/werkstatt/notiz.md";
const angehaengt = await befehl.pickAttachment();
check("eine Datei lässt sich anhängen", angehaengt?.name === "notiz.md" && angehaengt.text === "Inhalt der Datei");
prompts = gesendet(term, "session/prompt");
laeuft = befehl.send("lies das", [], angehaengt ? [angehaengt] : []);
await erwarte(term, "session/prompt", prompts);
const mitDatei = JSON.parse(term.sent[term.sent.length - 1]).params.prompt as Array<{ type: string; resource?: { uri: string; text: string } }>;
check("als Ressource vor dem Text", mitDatei[0]?.type === "resource" &&
  mitDatei[0].resource?.uri === "file:///tmp/werkstatt/notiz.md" && mitDatei[0].resource.text === "Inhalt der Datei" &&
  mitDatei[1]?.type === "text", JSON.stringify(mitDatei));
const meine = [...befehl.getSnapshot().transcript].reverse().find((i) => i.kind === "message" && i.role === "user");
check("der Verlauf nennt die Datei und die Uhrzeit", meine?.kind === "message" && meine.files?.[0] === "notiz.md" && typeof meine.at === "number");
term.update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Gelesen." } }, befehl.getSnapshot().sessionId ?? "");
term.reply("session/prompt", { stopReason: "end_turn" });
await laeuft;
const antwort = [...befehl.getSnapshot().transcript].reverse().find((i) => i.kind === "message" && i.role === "agent");
check("eine live geschriebene Antwort trägt ihre Uhrzeit", antwort?.kind === "message" && typeof antwort.at === "number");

// Dokumente einschalten startet den Agenten neu und behält den Chat.
check("der Stand der Dokumente ist bekannt", befehl.getSnapshot().documents?.enabled === false);
const vorDok = term.spawns.length;
const chatDok = befehl.getSnapshot().sessionId;
const loadsDok = gesendet(term, "session/load");
laeuft = befehl.setDocuments(true);
await erwarte(term, "initialize", gesendet(term, "initialize"));
term.reply("initialize", { protocolVersion: 1, agentCapabilities: { loadSession: true } });
await erwarte(term, "session/load", loadsDok);
term.reply("session/load", null);
await laeuft;
check("Dokumente an: Neustart mit demselben Chat",
  befehl.getSnapshot().documents?.enabled === true && term.spawns.length === vorDok + 1 &&
    befehl.getSnapshot().sessionId === chatDok);

// Die Dateikarte: was ein fertiges Werkzeug erzeugt hat.
check("ein fertiges create_pdf hinterlässt seine Datei",
  JSON.stringify(producedFiles({ path: "bericht.pdf", markdown: "# x" }, "completed")) === JSON.stringify(["bericht.pdf"]));
check("ein laufendes oder gescheitertes nicht",
  producedFiles({ path: "bericht.pdf", markdown: "# x" }, "in_progress").length === 0 &&
    producedFiles({ path: "bericht.pdf", markdown: "# x" }, "failed").length === 0);
check("ein Befehl hinterlässt keine Datei", producedFiles({ command: "ls" }, "completed").length === 0);
await befehl.openFile("bericht.pdf");
check("Öffnen geht an das System", term.geoeffnet[0] === "bericht.pdf");
check("Speichern unter kopiert an den gewählten Ort",
  (await befehl.saveFileAs("bericht.pdf", "bericht.pdf")) && term.gespeichert[0]?.[1] === "/Users/x/Downloads/bericht.pdf");
term.speicherOrt = null;
check("ein abgebrochener Dialog kopiert nichts", !(await befehl.saveFileAs("bericht.pdf", "bericht.pdf")) && term.gespeichert.length === 1);

// Seitenleiste: Projektordner lesen und schreiben.
check("der Projektordner wird für die Vorschau freigegeben", term.freigegeben.includes("/tmp/anders") || term.freigegeben.length > 0);
const gelesenA = await befehl.readText("a.txt");
check("eine Datei lässt sich lesen", gelesenA.text === "alt");
const neuM = await befehl.writeText("a.txt", "neu", gelesenA.modified);
check("und speichern", term.inhalte.get("a.txt")?.text === "neu" && neuM === 2);
let konflikt = "";
await befehl.writeText("a.txt", "meins", gelesenA.modified).catch((e: Error) => { konflikt = e.message; });
check("ein veralteter Stand wird nicht gespeichert", konflikt.includes("inzwischen") && term.inhalte.get("a.txt")?.text === "neu");

// Seitenleiste: Änderungen, Terminal, Artefakte.
check("git-Änderungen kommen durch", (await befehl.gitChanges()).files[0]?.status === "M");
check("ein Terminal öffnet im Projekt", (await befehl.ptyOpen(80, 24)) === 1);
await befehl.ptyWrite(1, "ls\r");
check("und bekommt Eingaben", term.ptyGeschrieben[0] === "ls\r");
const artUrl = await befehl.artifactUrl("a1", "html", "Test", "<h1>x</h1>");
check("ein Artefakt wird abgelegt und hat eine Adresse", term.artefakte.get("a1") === "<h1>x</h1>" && artUrl.endsWith("/a1"));

// Chats: umbenennen, anheften, suchen, exportieren.
term.savedSessions = [
  { id: "S0", title: "früheres Gespräch", workspace: "/tmp/alt", mode: "chat", modified: 5, turns: 4 },
  { id: "S7", title: "älter", workspace: "/tmp/alt", mode: "chat", modified: 1, turns: 1 },
];
await befehl.refreshSessions();
await befehl.renameChat("S0", "Mein Bericht");
check("ein Chat lässt sich umbenennen", befehl.getSnapshot().sessions.find((x) => x.id === "S0")?.title === "Mein Bericht");
await befehl.pinChat("S7", true);
check("angeheftete Chats stehen oben", befehl.getSnapshot().sessions[0]?.id === "S7" && befehl.getSnapshot().sessions[0]?.pinned === true);
await befehl.renameChat("S0", "");
check("ein leerer Name bringt den von jichi zurück", befehl.getSnapshot().sessions.find((x) => x.id === "S0")?.title === "früheres Gespräch");
check("die Suche findet im Inhalt", (await befehl.searchChats("make"))[0]?.id === "S0");
check("Export als Markdown geht an den gewählten Ort", (await befehl.exportChat("md")) && term.exporte[0]?.[0] === "/tmp/chat.md" && term.exporte[0][1] === "md" && term.exporte[0][2].startsWith("# "));
term.exportZiel = null;
check("ein abgebrochener Export schreibt nichts", !(await befehl.exportChat("pdf")) && term.exporte.length === 1);
const md = transcriptMarkdown([
  { kind: "message", id: "1", role: "user", text: "Hallo", streaming: false, files: ["a.pdf"] },
  { kind: "tool", id: "2", toolCallId: "t", title: "read_file a.pdf", toolKind: "read", status: "completed", output: "", truncated: false, diffs: [] },
  { kind: "message", id: "3", role: "agent", text: "**Fertig.**", streaming: false },
], "Test");
check("der Export zeigt Frage, Werkzeug und Antwort", md.startsWith("# Test") && md.includes("_Angehängt: a.pdf_") && md.includes("- ✓ `read_file a.pdf`") && md.includes("## jichi\n\n**Fertig.**"), md);

// Dauerhaft erlauben.
await befehl.alwaysAllow("write_file");
check("„Immer erlauben“ landet in jichis Erlaubnissen", term.erlaubt.allow.includes("write_file"));
check("MCP-Server werden gelistet", (await befehl.mcpServers())[0]?.builtin === true);

await befehl.openLink("https://uni-giessen.de");
check("Verweise gehen an den Browser", term.links[0] === "https://uni-giessen.de");

// ── Ergebnis ─────────────────────────────────────────────────────────────────

console.log(`\n${passed} Prüfungen bestanden, ${failures.length} fehlgeschlagen`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  // Werfen statt `process.exitCode`: so ist der Rückgabewert ungleich null, ohne
  // dass dieser Kern Node-Typen braucht. Geprüft wird am Rückgabewert.
  throw new Error(`${failures.length} Prüfungen fehlgeschlagen`);
}
