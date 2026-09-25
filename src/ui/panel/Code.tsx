/**
 * Quelltext mit Zeilennummern und Hervorhebung — ohne `innerHTML`.
 *
 * lowlight liefert einen Syntaxbaum, der hier zu React-Elementen wird. Sehr
 * große Dateien werden nicht hervorgehoben (das würde die Anzeige einfrieren),
 * nur nummeriert.
 */

import { memo, useEffect, useMemo, useRef } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { common, createLowlight } from "lowlight";

const lowlight = createLowlight(common);

const ENDUNG: Record<string, string> = {
  rs: "rust", ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", mjs: "javascript",
  py: "python", c: "c", h: "c", cc: "cpp", cpp: "cpp", hpp: "cpp", go: "go", java: "java", kt: "kotlin",
  swift: "swift", rb: "ruby", php: "php", cs: "csharp", sh: "bash", bash: "bash", zsh: "bash",
  json: "json", yaml: "yaml", yml: "yaml", toml: "ini", ini: "ini", md: "markdown", html: "xml",
  htm: "xml", xml: "xml", svg: "xml", css: "css", scss: "scss", less: "less", sql: "sql",
  makefile: "makefile", mk: "makefile", dockerfile: "dockerfile", lua: "lua", r: "r", diff: "diff",
};

export function sprache(path: string): string | null {
  const name = path.split("/").pop()?.toLowerCase() ?? "";
  if (name === "makefile" || name === "dockerfile") return ENDUNG[name];
  const e = name.includes(".") ? name.split(".").pop()! : "";
  return ENDUNG[e] ?? null;
}

const MAX_HERVORHEBEN = 200_000;

export const Code = memo(function Code({
  text,
  path,
  line,
}: {
  text: string;
  path: string;
  /** Zu dieser Zeile springen und sie markieren (1-basiert). */
  line?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const zeilen = useMemo(() => text.replace(/\n$/, "").split("\n").length, [text]);
  const inhalt = useMemo(() => {
    const lang = sprache(path);
    if (!lang || text.length > MAX_HERVORHEBEN || !lowlight.registered(lang)) return text;
    try {
      return toJsxRuntime(lowlight.highlight(lang, text), { Fragment, jsx, jsxs });
    } catch {
      return text;
    }
  }, [text, path]);

  useEffect(() => {
    if (!line || !box.current) return;
    const el = box.current.querySelector<HTMLElement>(`[data-nr="${line}"]`);
    el?.scrollIntoView({ block: "center" });
  }, [line, text]);

  return (
    <div className="code-ansicht" ref={box}>
      <div className="code-nummern" aria-hidden="true">
        {Array.from({ length: zeilen }, (_, i) => (
          <span key={i} data-nr={i + 1} className={line === i + 1 ? "markiert" : ""}>
            {i + 1}
          </span>
        ))}
      </div>
      <pre className="code-text">
        <code>{inhalt}</code>
      </pre>
    </div>
  );
});
