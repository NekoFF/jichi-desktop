/**
 * Ein Diff, wie man ihn aus einem Review kennt: entfernte Zeilen rot, neue
 * grün, lange unveränderte Strecken zusammengeklappt.
 */

import { memo, useMemo } from "react";
import { diffLines } from "diff";

import { t } from "../core/index.ts";
import { useSprache } from "./util.ts";

/** So viele unveränderte Zeilen bleiben um eine Änderung herum stehen. */
const CONTEXT = 3;

type Zeile =
  | { art: "gleich" | "weg" | "neu"; text: string; alt?: number; neu?: number }
  | { art: "luecke"; anzahl: number };

function zeilenVon(text: string): string[] {
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

export function diffRows(before: string, after: string): { rows: Zeile[]; added: number; removed: number } {
  const roh: Zeile[] = [];
  let a = 1;
  let n = 1;
  let added = 0;
  let removed = 0;
  for (const teil of diffLines(before, after)) {
    for (const text of zeilenVon(teil.value)) {
      if (teil.added) {
        roh.push({ art: "neu", text, neu: n++ });
        added += 1;
      } else if (teil.removed) {
        roh.push({ art: "weg", text, alt: a++ });
        removed += 1;
      } else {
        roh.push({ art: "gleich", text, alt: a++, neu: n++ });
      }
    }
  }

  // Unveränderte Strecken fern jeder Änderung zu einer Lücke zusammenfassen.
  const naheAnAenderung = roh.map(() => false);
  roh.forEach((z, i) => {
    if (z.art === "neu" || z.art === "weg") {
      for (let j = Math.max(0, i - CONTEXT); j <= Math.min(roh.length - 1, i + CONTEXT); j += 1) {
        naheAnAenderung[j] = true;
      }
    }
  });
  const rows: Zeile[] = [];
  let luecke = 0;
  roh.forEach((z, i) => {
    if (z.art === "gleich" && !naheAnAenderung[i]) {
      luecke += 1;
      return;
    }
    if (luecke) rows.push({ art: "luecke", anzahl: luecke });
    luecke = 0;
    rows.push(z);
  });
  if (luecke) rows.push({ art: "luecke", anzahl: luecke });
  return { rows, added, removed };
}

export const Diff = memo(function Diff({
  path,
  before,
  after,
  note,
}: {
  path: string;
  before: string | null;
  after: string;
  note?: string;
}) {
  useSprache();
  const { rows, added, removed } = useMemo(() => diffRows(before ?? "", after), [before, after]);
  return (
    <div className="diff">
      <div className="diff-kopf">
        <span className="diff-pfad">{path}</span>
        {before === null && <span className="diff-neu">{t("neue Datei")}</span>}
        <span className="diff-zahl">
          <span className="plus">+{added}</span> <span className="minus">−{removed}</span>
        </span>
      </div>
      {note && <div className="diff-hinweis">{note}</div>}
      <div className="diff-zeilen" role="table" aria-label={t("Änderungen an {path}", { path })}>
        {rows.length === 0 && <div className="diff-leer">{t("keine Änderung")}</div>}
        {rows.map((z, i) =>
          z.art === "luecke" ? (
            <div key={i} className="diff-luecke">
              {z.anzahl === 1 ? t("… 1 unveränderte Zeile") : t("… {n} unveränderte Zeilen", { n: z.anzahl })}
            </div>
          ) : (
            <div key={i} className={`diff-zeile ${z.art}`} role="row">
              <span className="nr">{z.alt ?? ""}</span>
              <span className="nr">{z.neu ?? ""}</span>
              <span className="zeichen">{z.art === "neu" ? "+" : z.art === "weg" ? "−" : " "}</span>
              <span className="text">{z.text || " "}</span>
            </div>
          ),
        )}
      </div>
    </div>
  );
});
