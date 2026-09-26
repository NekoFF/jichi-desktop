/**
 * Was ein Werkzeug tun *wird* — aus seinen Argumenten gelesen.
 *
 * Eine Berechtigungsfrage mit nur einem Titel („run_terminal_command …“) lässt
 * den Benutzer raten. jichi schickt mit jedem `tool_call` die vollen Argumente
 * (`rawInput`); hier wird daraus etwas, das man beurteilen kann: der Befehl
 * Zeichen für Zeichen, oder für jede Datei der alte und der neue Text.
 *
 * Rein und ohne Seiteneffekt. Den alten Text einer Datei liest der Kern über
 * den Transport; hier wird nur gerechnet.
 */

import { t } from "./i18n.ts";

/** Eine Ersetzung, wie `edit_file` und `apply_patch` sie beschreiben. */
export interface PlannedEdit {
  oldString: string;
  newString: string;
  replaceAll: boolean;
}

export interface PlannedFile {
  path: string;
  /** `write_file`: der ganze neue Inhalt. */
  content?: string;
  /** `edit_file` / `apply_patch`: Ersetzungen, in dieser Reihenfolge. */
  edits: PlannedEdit[];
}

export type Plan =
  | { kind: "command"; command: string; background: boolean }
  | { kind: "files"; files: PlannedFile[] }
  /** Ein neues Dokument (Word, PDF) aus Markdown. */
  | { kind: "document"; path: string; title?: string; markdown: string }
  /** Eine neue Tabelle (Excel, CSV). */
  | { kind: "sheets"; path: string; sheets: Array<{ name: string; rows: unknown[][] }> }
  /** Etwas anderes — gezeigt werden die Argumente selbst. */
  | { kind: "other"; args: Record<string, unknown> }
  /** Keine lesbaren Argumente. Das ist verdächtig und wird so gezeigt. */
  | { kind: "unreadable"; raw: string };

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

function edit(v: unknown): PlannedEdit | null {
  if (!v || typeof v !== "object") return null;
  const e = v as Record<string, unknown>;
  const oldString = str(e.old_string);
  const newString = str(e.new_string);
  if (oldString === undefined || newString === undefined) return null;
  return { oldString, newString, replaceAll: e.replace_all === true };
}

/** Argumente eines Aufrufs lesen. jichi schickt ein Objekt; alles andere gilt als unlesbar. */
export function planOf(rawInput: unknown): Plan {
  let args = rawInput;
  if (typeof args === "string") {
    try {
      args = JSON.parse(args);
    } catch {
      return { kind: "unreadable", raw: args as string };
    }
  }
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return { kind: "unreadable", raw: args === undefined ? "" : JSON.stringify(args) };
  }
  const a = args as Record<string, unknown>;

  // Dokumente: `markdown` statt `content`, damit sie nie für eine Textdatei
  // gehalten werden, deren alter Inhalt verglichen würde.
  if (str(a.path) !== undefined && str(a.markdown) !== undefined) {
    return { kind: "document", path: str(a.path)!, title: str(a.title), markdown: str(a.markdown)! };
  }
  if (str(a.path) !== undefined && (Array.isArray(a.sheets) || Array.isArray(a.rows))) {
    const roh = Array.isArray(a.sheets) ? a.sheets : [{ name: "", rows: a.rows }];
    const sheets = roh.map((b, i) => {
      const o = (b ?? {}) as Record<string, unknown>;
      const rows = Array.isArray(o.rows) ? o.rows.filter(Array.isArray) as unknown[][] : [];
      return { name: str(o.name) ?? t("Blatt {n}", { n: i + 1 }), rows };
    });
    return { kind: "sheets", path: str(a.path)!, sheets };
  }

  const command = str(a.command);
  if (command !== undefined && a.path === undefined && a.edits === undefined) {
    return { kind: "command", command, background: a.run_in_background === true };
  }

  if (Array.isArray(a.edits)) {
    const byPath = new Map<string, PlannedFile>();
    for (const raw of a.edits) {
      const path = str((raw as Record<string, unknown> | null)?.path);
      const e = edit(raw);
      if (!path || !e) return { kind: "other", args: a };
      const file = byPath.get(path) ?? { path, edits: [] };
      file.edits.push(e);
      byPath.set(path, file);
    }
    return { kind: "files", files: [...byPath.values()] };
  }

  const path = str(a.path);
  if (path !== undefined && str(a.content) !== undefined) {
    return { kind: "files", files: [{ path, content: str(a.content), edits: [] }] };
  }
  const single = edit(a);
  if (path !== undefined && single) {
    return { kind: "files", files: [{ path, edits: [single] }] };
  }
  return { kind: "other", args: a };
}

/**
 * Welche Dateien ein fertiges Werkzeug hinterlassen hat — für die Dateikarte.
 * Leer, solange es läuft oder wenn es scheiterte.
 */
export function producedFiles(rawInput: unknown, status: string): string[] {
  if (status !== "completed") return [];
  const plan = planOf(rawInput);
  switch (plan.kind) {
    case "document":
    case "sheets":
      return [plan.path];
    case "files":
      return plan.files.map((f) => f.path);
    default:
      return [];
  }
}

export interface Applied {
  text: string;
  /** Ersetzungen, deren alter Text nicht gefunden wurde — das Werkzeug wird scheitern. */
  missing: number;
}

/** Den neuen Inhalt einer Datei ausrechnen, wie das Werkzeug es tun wird. */
export function applyPlan(before: string | null, file: PlannedFile): Applied {
  if (file.content !== undefined) return { text: file.content, missing: 0 };
  let text = before ?? "";
  let missing = 0;
  for (const e of file.edits) {
    if (!e.oldString || !text.includes(e.oldString)) {
      missing += 1;
      continue;
    }
    text = e.replaceAll ? text.split(e.oldString).join(e.newString) : text.replace(e.oldString, () => e.newString);
  }
  return { text, missing };
}

/**
 * Unsichtbares sichtbar machen.
 *
 * Ein Befehl kann Zeichen enthalten, die man in einer Zeile nicht sieht: einen
 * Wagenrücklauf, ein Escape, eine Richtungsumkehr (U+202E), ein Nullbreiten-
 * zeichen. Damit lässt sich ein harmlos aussehender Befehl vor einen anderen
 * stellen. In der Berechtigungsfrage wird jedes solche Zeichen als Kennung
 * gezeigt, damit das, was man liest, das ist, was ausgeführt wird.
 */
export function visible(text: string): { text: string; suspicious: boolean } {
  let suspicious = false;
  const out = text.replace(
    // C0 ausser \t und \n, DEL, C1, Richtungs- und Nullbreitenzeichen, BOM.
    /[\u0000-\u0008\u000b-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g,
    (ch) => {
      suspicious = true;
      const code = ch.charCodeAt(0);
      if (ch === "\r") return "␍";
      if (ch === "\u001b") return "␛";
      return `⟨U+${code.toString(16).toUpperCase().padStart(4, "0")}⟩`;
    },
  );
  return { text: out, suspicious };
}
