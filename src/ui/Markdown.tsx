/**
 * Antworten des Agenten als Markdown.
 *
 * Sicher, weil `react-markdown` kein HTML durchlässt: ein `<script>` oder
 * `<img onerror>` im Modelltext bleibt Text. Zwei Dinge sind zusätzlich
 * abgesichert, weil das Fenster kein Browser ist:
 *
 * - **Verweise** öffnen im Browser des Systems, nie in diesem Fenster — ein
 *   Klick würde sonst die Anwendung selbst wegnavigieren.
 * - **Bilder** werden nicht geladen, sondern als Text gezeigt. Ein Bild von
 *   einer fremden Adresse verriete bei jedem Anzeigen, dass und wann jemand
 *   diese Antwort liest.
 */

import { memo, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { Check, Copy, Sparkles } from "lucide-react";

import { agent, t } from "../core/index.ts";
import { panel } from "./panel/store.ts";
import { useSprache } from "./util.ts";

/** Sprachen, die als lebendiges Artefakt in der Seitenleiste laufen. */
const ARTEFAKT: Record<string, string> = { html: "html", svg: "svg", xml: "", mermaid: "mermaid", jsx: "jsx", tsx: "tsx", markdown: "markdown", md: "markdown" };
/** Beim Aufruf ausgewertet, damit der Titel der aktuellen Sprache folgt. */
function standardTitel(lang: string): string | undefined {
  switch (lang) {
    case "html": return t("HTML-Seite");
    case "svg": return t("Grafik");
    case "mermaid": return t("Diagramm");
    case "jsx":
    case "tsx": return t("React-Komponente");
    case "markdown": return t("Dokument");
    default: return undefined;
  }
}

function artefaktTitel(lang: string, code: string): string {
  const titel = /<title>([^<]{1,60})<\/title>/i.exec(code)?.[1] ?? /^#\s+(.{1,60})$/m.exec(code)?.[1] ?? /(?:function|const)\s+([A-Z]\w{1,40})/.exec(code)?.[1];
  return titel?.trim() || standardTitel(lang) || t("Artefakt");
}

/** Sieht aus wie ein Pfad im Projekt: `src/main.rs`, `README.md`, `a/b.c:12`. */
const PFAD = /^(?!https?:)(?:\.\/)?[\w@.-]+(?:\/[\w@.-]+)*\.[A-Za-z0-9]{1,8}(?::(\d+))?$/;

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object" && "props" in node) {
    return textOf((node as { props: { children?: ReactNode } }).props.children);
  }
  return "";
}

function Codeblock({ children, className }: { children?: ReactNode; className?: string }) {
  const [kopiert, setKopiert] = useState(false);
  const sprache = /language-([\w+-]+)/.exec(className ?? "")?.[1];
  const text = textOf(children).replace(/\n$/, "");
  const art = sprache ? ARTEFAKT[sprache.toLowerCase()] : undefined;
  const alsArtefakt = art || (sprache === "xml" && /^\s*<svg[\s>]/.test(text) ? "svg" : "");

  async function kopieren() {
    try {
      await navigator.clipboard.writeText(text);
      setKopiert(true);
      setTimeout(() => setKopiert(false), 1400);
    } catch {
      /* ohne Zwischenablage bleibt der Knopf einfach stumm */
    }
  }

  return (
    <div className="md-code">
      <div className="md-code-kopf">
        <span>{sprache ?? "Code"}</span>
        <span className="md-code-luecke" />
        {alsArtefakt && (
          <button type="button" className="md-code-artefakt" onClick={() => panel.artefakt({ lang: alsArtefakt, code: text, title: artefaktTitel(alsArtefakt, text) })}>
            <Sparkles size={12} /> {t("Öffnen")}
          </button>
        )}
        <button type="button" onClick={() => void kopieren()} aria-label={t("Code kopieren")}>
          {kopiert ? <Check size={12} /> : <Copy size={12} />}
          {kopiert ? t("Kopiert") : t("Kopieren")}
        </button>
      </div>
      <pre>
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

const components: Components = {
  pre: ({ children }) => <>{children}</>,
  code({ className, children }) {
    const block = /language-/.test(className ?? "") || textOf(children).includes("\n");
    if (block) return <Codeblock className={className}>{children}</Codeblock>;
    const inhalt = textOf(children);
    const pfad = PFAD.exec(inhalt);
    if (pfad) {
      // Ein Pfad öffnet die Datei in der Seitenleiste (fehlt sie, sagt die Ansicht das).
      const line = pfad[1] ? Number(pfad[1]) : undefined;
      return (
        <code className="md-inline md-pfad" role="link" tabIndex={0} title={t("In der Seitenleiste öffnen")}
          onClick={() => panel.datei(inhalt.replace(/:\d+$/, ""), line)}
          onKeyDown={(e) => e.key === "Enter" && panel.datei(inhalt.replace(/:\d+$/, ""), line)}>
          {children}
        </code>
      );
    }
    return <code className="md-inline">{children}</code>;
  },
  a({ href, children }) {
    const url = href ?? "";
    const offen = /^https?:\/\//i.test(url);
    return (
      <a
        href={offen ? url : undefined}
        title={url}
        onClick={(e) => {
          e.preventDefault();
          if (!offen) return;
          // Mit ⌘/Strg im System-Browser, sonst im Browser der Seitenleiste.
          if (e.metaKey || e.ctrlKey) void agent.openLink(url).catch(() => {});
          else panel.browser(url);
        }}
      >
        {children}
      </a>
    );
  },
  img({ alt, src }) {
    return (
      <span className="md-bild" title={src ?? ""}>
        {alt ? t("[Bild: {alt}]", { alt }) : t("[Bild]")}
      </span>
    );
  },
  table: ({ children }) => (
    <div className="md-tabelle">
      <table>{children}</table>
    </div>
  ),
};

/** Nur neu rechnen, wenn sich der Text ändert — beim Streamen die jüngste Nachricht. */
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  useSprache();
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }]]}
        components={components}
        skipHtml
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});
