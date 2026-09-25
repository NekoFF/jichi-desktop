/**
 * Die Referenzansicht.
 *
 * Sie ist absichtlich einfach: reines DOM, eigene Klassen, kein Framework. Ihre
 * Aufgabe ist nicht, schön zu sein, sondern zu **beweisen**, dass der Kern
 * vollständig ist — jeder Zustand, den `Snapshot` kennt, ist hier einmal
 * gezeichnet, einschließlich der Wege, die man beim Klicken selten trifft
 * (Berechtigungsfrage, Abbruch, gestorbener Agent).
 *
 * Die Oberfläche nach dem JLU Design System ersetzt diese Datei und
 * `index.html`. Was sie dafür braucht, steht in `docs/CONTRACT.md`; der Kern
 * unter `src/core/` bleibt unverändert. Solange die neue Oberfläche entsteht,
 * ist dies die laufende Anwendung — und danach die Vergleichsvorlage.
 */

import {
  agent,
  formatArgs,
  parseArgs,
  permissionTone,
  relativeTime,
  roleLabel,
  shortPath,
  statusLabel,
  toolKindLabel,
  toolStatusLabel,
  type LaunchConfig,
  type Snapshot,
  type TranscriptItem,
} from "./core/index.ts";

function need<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Element #${id} fehlt in index.html`);
  return node as T;
}

const ui = {
  statusDot: need("status-dot"),
  statusText: need("status-text"),
  cwd: need("cwd-label"),
  cancel: need<HTMLButtonElement>("cancel-turn"),
  transcript: need("transcript"),
  sessionList: need("session-list"),
  newChat: need<HTMLButtonElement>("new-chat"),
  openSettings: need<HTMLButtonElement>("open-settings"),
  composer: need<HTMLFormElement>("composer"),
  prompt: need<HTMLTextAreaElement>("prompt"),
  send: need<HTMLButtonElement>("send"),
  settings: need("settings"),
  cfgProgram: need<HTMLInputElement>("cfg-program"),
  cfgArgs: need<HTMLInputElement>("cfg-args"),
  cfgCwd: need<HTMLInputElement>("cfg-cwd"),
  cfgKey: need<HTMLInputElement>("cfg-key"),
  cfgHint: need("cfg-hint"),
  cfgDiag: need("cfg-diag"),
  cfgCancel: need<HTMLButtonElement>("cfg-cancel"),
  cfgSave: need<HTMLButtonElement>("cfg-save"),
};

/** Die Leeransicht aus index.html, damit sie nach „Neuer Chat“ wiederkommt. */
const emptyView = ui.transcript.firstElementChild?.cloneNode(true) as HTMLElement | null;

// ── Zeichnen ─────────────────────────────────────────────────────────────────

/** Gezeichnete Verlaufseinträge, damit nicht bei jedem Token alles neu entsteht. */
const drawn = new Map<string, { node: HTMLElement; signature: string }>();
let permissionNode: HTMLElement | null = null;

function svg(path: string): string {
  return `<svg viewBox="0 0 16 16" aria-hidden="true">${path}</svg>`;
}

const ICON = {
  tool: svg('<path d="M6.5 3.5 3 7l6 6 3.5-3.5z"/><path d="M9.5 2.5 13.5 6.5"/>'),
  ask: svg('<circle cx="8" cy="8" r="6"/><path d="M8 5.5v3M8 10.8v.2"/>'),
};

function renderItem(item: TranscriptItem): HTMLElement {
  const box = document.createElement("div");

  if (item.kind === "message") {
    box.className = `msg ${item.role === "user" ? "user" : "agent"}`;
    const role = document.createElement("div");
    role.className = "msg-role";
    role.textContent = roleLabel(item.role);
    const body = document.createElement("div");
    body.className = "msg-body";
    body.textContent = item.text;
    box.append(role, body);
    return box;
  }

  if (item.kind === "notice") {
    box.className = `note${item.level === "error" ? " error" : ""}`;
    box.textContent = item.text;
    return box;
  }

  box.className = "tool";
  const card = document.createElement("div");
  card.className = `tool-card ${item.status === "completed" ? "done" : item.status === "failed" ? "failed" : "running"}`;

  const head = document.createElement("div");
  head.className = "tool-head";
  head.innerHTML = ICON.tool;
  const title = document.createElement("span");
  title.className = "tool-title";
  title.textContent = item.title;
  const state = document.createElement("span");
  state.className = "tool-state";
  state.textContent = `${toolKindLabel(item.toolKind)} · ${toolStatusLabel(item.status)}`;
  head.append(title, state);
  card.append(head);

  const body = [
    item.output,
    ...item.diffs.map((d) => `--- ${d.path}\n${d.newText}`),
    item.truncated ? "\n… gekürzt" : "",
  ]
    .filter(Boolean)
    .join("\n");
  if (body) {
    const out = document.createElement("pre");
    out.className = "tool-out";
    out.textContent = body;
    card.append(out);
  }

  box.append(card);
  return box;
}

/** Was sich geändert haben muss, damit ein Eintrag neu gezeichnet wird. */
function signature(item: TranscriptItem): string {
  if (item.kind === "message") return `${item.text.length}:${item.streaming}`;
  if (item.kind === "notice") return item.text;
  return `${item.status}:${item.title}:${item.output.length}:${item.diffs.length}`;
}

function renderPermission(snap: Snapshot): void {
  if (!snap.permission) {
    permissionNode?.remove();
    permissionNode = null;
    return;
  }
  if (permissionNode?.dataset.for === String(snap.permission.requestId)) return;
  permissionNode?.remove();

  const box = document.createElement("div");
  box.className = "perm";
  box.dataset.for = String(snap.permission.requestId);

  const card = document.createElement("div");
  card.className = "perm-card";
  const title = document.createElement("div");
  title.className = "perm-title";
  title.innerHTML = `${ICON.ask} jichi bittet um Erlaubnis`;
  const what = document.createElement("div");
  what.className = "perm-tool";
  what.textContent = snap.permission.title;

  const actions = document.createElement("div");
  actions.className = "perm-actions";
  for (const option of snap.permission.options) {
    const tone = permissionTone(option);
    const button = document.createElement("button");
    button.type = "button";
    button.className = tone === "danger" ? "deny" : "allow";
    button.textContent = option.name;
    button.addEventListener("click", () => agent.answerPermission(option.optionId));
    actions.append(button);
  }
  const abort = document.createElement("button");
  abort.type = "button";
  abort.textContent = "Zug abbrechen";
  abort.addEventListener("click", () => agent.answerPermission(null));
  actions.append(abort);

  card.append(title, what, actions);
  box.append(card);
  ui.transcript.append(box);
  permissionNode = box;
}

function renderTranscript(snap: Snapshot): void {
  if (snap.transcript.length === 0) {
    if (drawn.size || ui.transcript.children.length === 0) {
      drawn.clear();
      ui.transcript.replaceChildren();
      if (emptyView) ui.transcript.append(emptyView.cloneNode(true));
    }
    renderPermission(snap);
    return;
  }

  // Erster echter Eintrag: die Leeransicht weicht.
  if (drawn.size === 0) ui.transcript.replaceChildren();

  const near =
    ui.transcript.scrollHeight - ui.transcript.scrollTop - ui.transcript.clientHeight < 120;

  const alive = new Set<string>();
  for (const item of snap.transcript) {
    alive.add(item.id);
    const sig = signature(item);
    const existing = drawn.get(item.id);
    if (!existing) {
      const node = renderItem(item);
      drawn.set(item.id, { node, signature: sig });
      ui.transcript.append(node);
    } else if (existing.signature !== sig) {
      const node = renderItem(item);
      existing.node.replaceWith(node);
      drawn.set(item.id, { node, signature: sig });
    }
  }
  for (const [id, entry] of drawn) {
    if (!alive.has(id)) {
      entry.node.remove();
      drawn.delete(id);
    }
  }

  renderPermission(snap);
  if (near) ui.transcript.scrollTop = ui.transcript.scrollHeight;
}

function renderSessions(snap: Snapshot): void {
  ui.sessionList.replaceChildren();
  for (const session of snap.sessions) {
    const button = document.createElement("button");
    button.className = `session${session.id === snap.sessionId ? " active" : ""}`;
    button.textContent = session.title;
    button.title = `${session.title}\n${session.workspace ?? ""}\n${relativeTime(session.modified)} · ${session.turns} Beiträge`;
    button.addEventListener("click", () => {
      void agent.loadSession(session.id).catch(report);
    });
    ui.sessionList.append(button);
  }
}

function render(): void {
  const snap = agent.getSnapshot();

  ui.statusDot.className = `dot${
    snap.status === "ready"
      ? " on"
      : snap.status === "busy" || snap.status === "starting" || snap.status === "cancelling"
        ? " busy"
        : snap.status === "error"
          ? " error"
          : ""
  }`;
  // Offline ist der Normalzustand vor dem ersten Zug — dann lieber zeigen, dass
  // der Agent gefunden wurde, als ein nacktes "nicht verbunden", das nach einem
  // Defekt aussieht.
  ui.statusText.textContent =
    snap.error ??
    (snap.status === "offline" && snap.agentVersion
      ? `${snap.agentVersion} · nicht verbunden`
      : statusLabel(snap.status));
  ui.statusText.title = [snap.agentVersion, snap.error].filter(Boolean).join(" — ");

  ui.cwd.textContent = shortPath(snap.cwd);
  ui.cwd.title = snap.cwd ?? "";
  ui.cancel.hidden = !snap.canCancel;
  ui.send.disabled = !snap.canSend || ui.prompt.value.trim() === "";
  ui.prompt.readOnly = !snap.canSend;

  ui.cfgDiag.textContent = snap.diagnostics.join("\n") || "— noch nichts —";

  renderSessions(snap);
  renderTranscript(snap);
}

function report(cause: unknown): void {
  ui.statusText.textContent = cause instanceof Error ? cause.message : String(cause);
  ui.statusDot.className = "dot error";
}

// ── Bedienung ────────────────────────────────────────────────────────────────

function autosize(): void {
  ui.prompt.style.height = "auto";
  ui.prompt.style.height = `${Math.min(ui.prompt.scrollHeight, 200)}px`;
}

ui.prompt.addEventListener("input", () => {
  autosize();
  ui.send.disabled = !agent.getSnapshot().canSend || ui.prompt.value.trim() === "";
});

ui.prompt.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    ui.composer.requestSubmit();
  }
});

ui.composer.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = ui.prompt.value;
  if (!text.trim()) return;
  ui.prompt.value = "";
  autosize();
  void agent.send(text).catch((cause) => {
    // Der Text darf nicht verloren gehen, wenn der Start scheitert.
    ui.prompt.value = text;
    autosize();
    report(cause);
  });
});

ui.cancel.addEventListener("click", () => void agent.cancel().catch(report));
ui.newChat.addEventListener("click", () => void agent.newSession().catch(report));

// ── Einstellungen ────────────────────────────────────────────────────────────

const KEY_VAR = "JICHI_API_KEY";

function openSettings(): void {
  const config = agent.config;
  const snap = agent.getSnapshot();
  ui.cfgProgram.value = config?.program ?? "";
  ui.cfgArgs.value = formatArgs(config?.args ?? []);
  ui.cfgCwd.value = config?.cwd ?? "";
  ui.cfgKey.value = config?.env.find((e) => e.name === KEY_VAR)?.file ?? "";
  ui.cfgHint.textContent = [
    snap.agentVersion ? `Gefunden: ${snap.agentVersion}` : "Das Programm wurde noch nicht geprüft.",
    "Der Schlüssel wird erst beim Start aus der Datei gelesen.",
  ].join(" ");
  ui.settings.hidden = false;
}

function closeSettings(): void {
  ui.settings.hidden = true;
}

ui.openSettings.addEventListener("click", openSettings);
ui.cfgCancel.addEventListener("click", closeSettings);
ui.settings.addEventListener("click", (event) => {
  if (event.target === ui.settings) closeSettings();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !ui.settings.hidden) closeSettings();
});

ui.cfgSave.addEventListener("click", () => {
  const keyFile = ui.cfgKey.value.trim();
  const previous = agent.config;
  const next: LaunchConfig = {
    program: ui.cfgProgram.value.trim(),
    args: parseArgs(ui.cfgArgs.value),
    cwd: ui.cfgCwd.value.trim(),
    env: [
      ...(previous?.env.filter((e) => e.name !== KEY_VAR) ?? []),
      ...(keyFile ? [{ name: KEY_VAR, file: keyFile }] : []),
    ],
  };
  closeSettings();
  void agent.setConfig(next).catch(report);
});

// ── Start ────────────────────────────────────────────────────────────────────

agent.subscribe(render);
render();
void agent.init().catch(report);
