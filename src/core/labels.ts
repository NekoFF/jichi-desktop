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
import { locale, t } from "./i18n.ts";

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

export function statusLabel(status: Status): string {
  switch (status) {
    case "offline":
      return t("nicht verbunden");
    case "starting":
      return t("startet");
    case "ready":
      return t("bereit");
    case "busy":
      return t("arbeitet");
    case "cancelling":
      return t("bricht ab");
    case "error":
      return t("Fehler");
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
      return t("Du");
    case "agent":
      return "jichi";
    case "thought":
      return t("Überlegung");
  }
}

/** Die Einteilung, die der Agent selbst vornimmt — in Worten. */
export function toolKindLabel(kind: ToolKind): string {
  switch (kind) {
    case "read":
      return t("liest");
    case "edit":
      return t("ändert");
    case "delete":
      return t("löscht");
    case "move":
      return t("verschiebt");
    case "search":
      return t("sucht");
    case "execute":
      return t("führt aus");
    case "think":
      return t("denkt");
    case "fetch":
      return t("ruft ab");
    default:
      return t("Werkzeug");
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
      return t("wartet");
    case "in_progress":
      return t("läuft");
    case "completed":
      return t("fertig");
    case "failed":
      return t("fehlgeschlagen");
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
  if (diff < 60) return t("gerade eben");
  const minutes = Math.round(diff / 60);
  if (minutes < 60) return t("vor {n} Min.", { n: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t("vor {n} Std.", { n: hours });
  const days = Math.round(hours / 24);
  if (days === 1) return t("gestern");
  if (days < 30) return t("vor {n} Tagen", { n: days });
  return new Date(seconds * 1000).toLocaleDateString(locale(), {
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
