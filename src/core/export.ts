/**
 * Ein Chat als Markdown — für den Export (Markdown, Word, PDF).
 *
 * Rein und ohne Seiteneffekt: aus dem Verlauf wird ein lesbares Dokument.
 * Werkzeuge erscheinen knapp als Zeile, nicht mit ihrer ganzen Ausgabe — ein
 * Export soll das Gespräch zeigen, nicht das Protokoll.
 */

import type { TranscriptItem } from "./state.ts";
import { locale, t } from "./i18n.ts";

export function transcriptMarkdown(items: readonly TranscriptItem[], title: string, when = new Date()): string {
  const out: string[] = [`# ${title}`, "", `_${t("Exportiert aus jichi Desktop am {datum}", { datum: when.toLocaleString(locale()) })}_`, ""];
  for (const i of items) {
    if (i.kind === "message") {
      if (i.role === "user") {
        out.push(`## ${t("Du")}`, "");
        if (i.files?.length) out.push(`_${t("Angehängt: {dateien}", { dateien: i.files.join(", ") })}_`, "");
        if (i.images?.length) out.push(`_${t("{n} Bild(er)", { n: i.images.length })}_`, "");
        out.push(i.text, "");
      } else if (i.role === "agent") {
        out.push("## jichi", "", i.text, "");
      }
    } else if (i.kind === "tool") {
      const zustand = i.status === "completed" ? "✓" : i.status === "failed" ? "✗" : "…";
      out.push(`- ${zustand} \`${i.title.replace(/`/g, "'")}\``);
      // Eine Werkzeugfolge endet mit einer Leerzeile, wenn danach Text kommt.
    } else if (i.kind === "notice" && i.level !== "info") {
      out.push(`> ${i.level === "error" ? t("Fehler") : t("Hinweis")}: ${i.text}`, "");
    }
  }
  return out.join("\n").replace(/(\n- .+)\n(?!- |\n)/g, "$1\n\n").trimEnd() + "\n";
}

/** Ein Dateiname aus einem Titel. */
export function dateiname(title: string): string {
  return (title.replace(/[^\p{L}\p{N} _-]+/gu, "").trim().replace(/\s+/g, "-").slice(0, 60) || "chat").toLowerCase();
}
