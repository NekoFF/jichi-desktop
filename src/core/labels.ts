/**
 * Beschriftungen und Einordnungen für die Oberfläche.
 *
 * Damit muss keine Komponente ACP kennen: sie fragt hier nach dem deutschen Wort
 * und nach dem *Ton* (neutral, betont, gefährlich) und wählt danach ihre
 * Darstellung. Liegt die Zuordnung hier, ändert sie sich an einer Stelle — und
 * ein Werkzeug, das löscht, sieht dann überall gleich gefährlich aus.
 */

import type { PermissionOption, ToolKind, ToolStatus } from "./protocol.ts";
import type { MessageRole, Status } from "./state.ts";

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

export function statusLabel(status: Status): string {
  switch (status) {
    case "offline":
      return "nicht verbunden";
    case "starting":
      return "startet";
    case "ready":
      return "bereit";
    case "busy":
      return "arbeitet";
    case "cancelling":
      return "bricht ab";
    case "error":
      return "Fehler";
  }
}

export function statusTone(status: Status): Tone {
  switch (status) {
    case "ready":
      return "success";
    case "busy":
    case "starting":
      return "accent";
    case "cancelling":
      return "warning";
    case "error":
      return "danger";
    case "offline":
      return "neutral";
  }
}

export function roleLabel(role: MessageRole): string {
  switch (role) {
    case "user":
      return "Du";
    case "agent":
      return "jichi";
    case "thought":
      return "Überlegung";
  }
}

/** Die Einteilung, die der Agent selbst vornimmt — in Worten. */
export function toolKindLabel(kind: ToolKind): string {
  switch (kind) {
    case "read":
      return "liest";
    case "edit":
      return "ändert";
    case "delete":
      return "löscht";
    case "move":
      return "verschiebt";
    case "search":
      return "sucht";
    case "execute":
      return "führt aus";
    case "think":
      return "denkt";
    case "fetch":
      return "ruft ab";
    default:
      return "Werkzeug";
  }
}

/** Wie folgenreich ein Werkzeug ist. Steuert, wie deutlich gefragt wird. */
export function toolKindTone(kind: ToolKind): Tone {
  switch (kind) {
    case "delete":
      return "danger";
    case "edit":
    case "move":
    case "execute":
      return "warning";
    default:
      return "neutral";
  }
}

export function toolStatusLabel(status: ToolStatus): string {
  switch (status) {
    case "pending":
      return "wartet";
    case "in_progress":
      return "läuft";
    case "completed":
      return "fertig";
    case "failed":
      return "fehlgeschlagen";
  }
}

export function toolStatusTone(status: ToolStatus): Tone {
  switch (status) {
    case "completed":
      return "success";
    case "failed":
      return "danger";
    case "in_progress":
      return "accent";
    case "pending":
      return "neutral";
  }
}

/**
 * Der Ton einer Berechtigungsoption. Der Agent liefert `kind` mit; fehlt es,
 * wird die Id gelesen, weil sie im Protokoll dieselben Wörter benutzt.
 */
export function permissionTone(option: PermissionOption): Tone {
  const kind = option.kind ?? option.optionId;
  if (kind.startsWith("allow_always")) return "warning";
  if (kind.startsWith("allow")) return "accent";
  if (kind.startsWith("reject")) return "danger";
  return "neutral";
}

/**
 * Ein Zeitpunkt in Worten, für die Sitzungsliste. Sekunden seit Epoche, damit
 * die Rust-Seite nichts formatieren muss.
 */
export function relativeTime(seconds: number, now = Date.now()): string {
  const diff = Math.max(0, Math.round(now / 1000 - seconds));
  if (diff < 60) return "gerade eben";
  const minutes = Math.round(diff / 60);
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.round(hours / 24);
  if (days === 1) return "gestern";
  if (days < 30) return `vor ${days} Tagen`;
  return new Date(seconds * 1000).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Ein Pfad, gekürzt von links — das Ende eines Pfades sagt mehr als sein Anfang. */
export function shortPath(path: string | null, max = 48): string {
  if (!path) return "";
  const home = "/Users/";
  const pretty = path.startsWith(home) ? path.replace(/^\/(Users|home)\/[^/]+/, "~") : path;
  return pretty.length <= max ? pretty : `…${pretty.slice(pretty.length - max + 1)}`;
}
