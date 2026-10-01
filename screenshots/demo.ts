/**
 * Demo-Bühne für Bildschirmfotos: die echte Oberfläche im Browser, die
 * Tauri-Brücke durch `mockIPC` ersetzt.
 *
 * Was jichi sagt, ist nicht erfunden: Die ACP-Zeilen stammen aus einem echten
 * Lauf (jichi 0.12.0, jlu/qwen3-coder-next, fixture.py) und werden hier Zug
 * für Zug wieder abgespielt. Erfunden sind nur die Titel der älteren Chats in
 * der Seitenleiste.
 *
 * URL: /screenshots/demo.html?lang=en&theme=light&layout=floating&stop=perm
 */

import { mockIPC } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";

import fixture from "./fixture.json";

type Rec = { dir: "in" | "out"; t: number; line: string };
const F = fixture as unknown as {
  recording: Rec[];
  files: Record<string, string>;
  dirs: Record<string, unknown[]>;
  git: { branch: string; changes: unknown[]; before: string; after: string };
  docs: Record<string, string>;
  docsListe: string[];
  docsCommit: string;
  initListe: string;
  initProbe: string;
  version: string;
};

const q = new URLSearchParams(location.search);
const PROJ = "/Users/neko/Projects/weather-cli";
const HOME = "/Users/neko";

// Einstellungen der Oberfläche vor dem ersten Zeichnen.
localStorage.setItem("jichi-desktop.preferences.v1", JSON.stringify({
  name: q.get("name") ?? "Neko",
  language: q.get("lang") ?? "en",
  appearance: q.get("theme") ?? "light",
  layout: q.get("layout") ?? "floating",
}));

document.documentElement.setAttribute("data-theme", q.get("theme") === "dark" ? "dark" : "light");

// Das Projekt ist offen, wie nach „Projekt öffnen“.
localStorage.setItem("jichi-desktop.launch.v1", JSON.stringify({ program: "/usr/local/bin/jichi", args: ["--acp"], cwd: PROJ, env: [{ name: "JICHI_API_KEY", secret: "JICHI_API_KEY" }] }));

// ── Die Aufnahme in Züge teilen ──────────────────────────────────────────────

const msgs = F.recording.map((r) => ({ dir: r.dir, t: r.t, m: JSON.parse(r.line) as Record<string, any> }));
const antwortAuf = (id: number) => msgs.find((x) => x.dir === "in" && x.m.id === id && ("result" in x.m || "error" in x.m))!.m;
const SID = antwortAuf(2).result.sessionId as string;
/** Für jeden Zug: was jichi zwischen Prompt und Antwort schickte. */
const zuege: Array<{ zeilen: typeof msgs; ende: Record<string, any> }> = [];
for (let i = 0; i < msgs.length; i++) {
  const x = msgs[i];
  if (x.dir === "out" && x.m.method === "session/prompt") {
    const zeilen: typeof msgs = [];
    let j = i + 1;
    for (; j < msgs.length; j++) {
      const y = msgs[j];
      if (y.dir === "in" && y.m.id === x.m.id && ("result" in y.m || "error" in y.m)) break;
      if (y.dir === "in") zeilen.push(y);
    }
    zuege.push({ zeilen, ende: msgs[j].m });
    i = j;
  }
}

let zug = 0;
/** Wie viele Züge zu Ende gespielt sind — vorher ist convert.py noch die alte. */
let fertig = 0;
const stopBeiErlaubnis = q.get("stop") === "perm";
const schnell = q.get("fast") !== "0";
const sende = (m: unknown) => emit("acp-line", { generation: 1, line: JSON.stringify(m) });
const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function spieleZug(clientId: number) {
  const z = zuege[zug++];
  if (!z) return sende({ jsonrpc: "2.0", id: clientId, result: { stopReason: "end_turn" } });
  let vorher = z.zeilen[0]?.t ?? 0;
  for (const y of z.zeilen) {
    // Abstände wie aufgenommen, gekürzt — die Oberfläche soll streamen, nicht warten.
    await warte(Math.min(schnell ? 40 : 400, Math.max(4, (y.t - vorher) * 1000 * (schnell ? 0.15 : 1))));
    vorher = y.t;
    if (y.m.method === "session/request_permission") {
      // Die Rückfragen wurden bei der Aufnahme mit „einmal erlauben“ beantwortet.
      // Fürs Bild der Rückfrage hält das Spiel an der ersten an; sonst zeigt es
      // sie nicht, denn die Antwort steht schon in der Aufnahme.
      if (stopBeiErlaubnis) return void (await sende(y.m));
      continue;
    }
    await sende(y.m);
  }
  await sende({ ...z.ende, id: clientId });
  fertig++;
}

// ── Die Brücke ───────────────────────────────────────────────────────────────

const modelle = [
  { name: "coder", model: "jlu/qwen3-coder-next", apiBase: "https://api.hrz.uni-giessen.de/v1", apiKeyEnv: "JICHI_API_KEY", roles: [] },
  { name: "embed", model: "jlu/qwen3-embedding", apiBase: "https://api.hrz.uni-giessen.de/v1", apiKeyEnv: "JICHI_API_KEY", roles: ["embed"] },
];
const jetzt = Math.floor(Date.now() / 1000);
const sitzungen = [
  { id: "a1", title: "Add a --json flag to the CLI", workspace: PROJ, mode: "chat", modified: jetzt - 3600 * 3, turns: 4 },
  { id: "a2", title: "Explain the wttr.in response format", workspace: PROJ, mode: "chat", modified: jetzt - 86400, turns: 2 },
  { id: "a3", title: "Plan: cache the last forecast", workspace: PROJ, mode: "plan", modified: jetzt - 86400 * 3, turns: 6 },
];
const rel = (p: string) => p.replace(PROJ + "/", "").replace(/^\.\//, "");

mockIPC(async (cmd, args: any) => {
  switch (cmd) {
    case "default_launch":
      return { program: "jichi", args: ["--acp"], resolved: "/usr/local/bin/jichi", cwd: HOME, env: [{ name: "JICHI_API_KEY", secret: "JICHI_API_KEY" }], hint: "" };
    case "readiness":
      return { agent: "/usr/local/bin/jichi", version: F.version, config: { path: `${HOME}/.jichi`, exists: true, problem: null, models: modelle }, keyStored: true, keyEnv: "JICHI_API_KEY", needsSetup: false };
    case "probe": return F.version;
    case "secret_present": return true;
    case "sessions": return sitzungen;
    case "search_chats": return [];
    case "chats_meta": return {};
    case "gateway_models":
      return { base: "https://api.hrz.uni-giessen.de/v1", models: [
        { id: "jlu/gemma-4-26b-it", kind: "chat" }, { id: "jlu/gpt-oss-20b", kind: "chat" }, { id: "jlu/qwen3-coder-next", kind: "chat" },
        { id: "jlu/qwen3.8-27b", kind: "chat" }, { id: "jlu/qwen3-embedding", kind: "embed" }, { id: "jlu/jina-rerank", kind: "rerank" },
        { id: "jlu/whisper-1", kind: "transcribe" }, { id: "jlu/tts-1-hd", kind: "speech" }] };
    case "documents_status": return { enabled: true, reachable: true, problem: null };
    case "acp_start": return 1;
    case "acp_running": return true;
    case "acp_stop": return null;
    case "acp_send": {
      const m = JSON.parse(args.line);
      if (!("method" in m)) return null; // Antwort der Oberfläche auf eine Rückfrage
      setTimeout(() => {
        if (m.method === "initialize") sende({ ...antwortAuf(1), id: m.id });
        else if (m.method === "session/new") sende({ ...antwortAuf(2), id: m.id });
        else if (m.method === "session/prompt") void spieleZug(m.id);
        else if (m.method === "session/cancel") {/* nichts */}
        else if ("id" in m) sende({ jsonrpc: "2.0", id: m.id, result: {} });
      }, 30);
      return null;
    }
    case "list_dir": return { entries: F.dirs[rel(args.path ?? "") === PROJ ? "" : rel(args.path ?? "")] ?? F.dirs[""], truncated: false };
    case "read_text": case "read_workspace_file": {
      const p = rel(args.path);
      const text = p === "weather/convert.py" && fertig < 2 ? F.git.before : F.files[p] ?? "";
      return cmd === "read_workspace_file" ? text : { path: p, text, size: text.length, modified: Date.now(), binary: false };
    }
    case "file_info": return { path: rel(args.path), name: rel(args.path).split("/").pop(), size: 120, modified: jetzt, openable: true };
    case "git_changes": return { repo: true, branch: F.git.branch, files: fertig >= 2 ? F.git.changes : [] };
    case "git_file_diff": return { before: F.git.before, after: F.git.after, binary: false };
    case "jichi_doku_status":
      return { ort: { root: "/Users/neko/src/jichi/docs", quelle: "programm", commit: F.docsCommit }, seiten: F.docsListe.length,
        quelle: { eingetragen: true, aktuell: true, embedModell: true }, problem: null };
    case "jichi_doku_liste": return F.docsListe;
    case "jichi_doku_lesen": {
      const s = F.docs[args.seite];
      if (s === undefined) throw new Error(`${args.seite}: not part of the demo`);
      return s;
    }
    case "jichi_doku_suchen": return [{ datei: "SETUP_WIZARD.md", zeile: 1, text: "# Setup wizard (`jichi setup`)" }];
    case "jichi_init_liste": return { exit: 0, stdout: F.initListe, stderr: "" };
    case "jichi_init": return { exit: 0, stdout: F.initProbe, stderr: "" };
    case "permissions_get": return { allow: ["read_file", "list_files"], deny: [], allowAll: false, denyAll: false };
    case "mcp_list": return [{ name: "dokumente", command: "jichi-desktop", args: ["--mcp-dokumente"], disabled: false, builtin: true }];
    case "pty_open": return 1;
    case "term_create": return "t1";
    default:
      return null;
  }
}, { shouldMockEvents: true });

// Wie Tauri: Ereignisse über das Ereignis-Plugin.
void import("../src/main.tsx");
