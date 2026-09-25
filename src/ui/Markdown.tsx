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
import { Check, Copy } from "lucide-react";

import { agent } from "../core/index.ts";

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
        <button type="button" onClick={() => void kopieren()} aria-label="Code kopieren">
          {kopiert ? <Check size={12} /> : <Copy size={12} />}
          {kopiert ? "Kopiert" : "Kopieren"}
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
          if (offen) void agent.openLink(url).catch(() => {});
        }}
      >
        {children}
      </a>
    );
  },
  img({ alt, src }) {
    return (
      <span className="md-bild" title={src ?? ""}>
        [Bild{alt ? `: ${alt}` : ""}]
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
