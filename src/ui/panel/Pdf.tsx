/**
 * PDF in der Seitenleiste — mit pdf.js, damit es auf jedem System gleich
 * aussieht (WebKitGTK unter Linux zeigt PDFs nicht selbst).
 *
 * pdf.js wird erst geladen, wenn ein PDF geöffnet wird. Seiten werden erst
 * gezeichnet, wenn sie ins Bild scrollen: ein 300-seitiges Handbuch soll die
 * Anwendung nicht anhalten.
 */

import { useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";

import { t } from "../../core/index.ts";

let pdfjs: Promise<typeof import("pdfjs-dist")> | null = null;

function lade() {
  pdfjs ??= Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]).then(
    ([lib, worker]) => {
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      return lib;
    },
  );
  return pdfjs;
}

function Seite({ doc, nr, scale }: { doc: PDFDocumentProxy; nr: number; scale: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [sichtbar, setSichtbar] = useState(nr <= 2);
  const [groesse, setGroesse] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const o = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setSichtbar(true), { rootMargin: "600px" });
    o.observe(el);
    return () => o.disconnect();
  }, []);

  useEffect(() => {
    let aus = false;
    let task: { cancel(): void } | null = null;
    void doc.getPage(nr).then((page) => {
      if (aus) return;
      const vp = page.getViewport({ scale });
      setGroesse({ w: vp.width, h: vp.height });
      if (!sichtbar || !canvas.current) return;
      const dpr = window.devicePixelRatio || 1;
      const c = canvas.current;
      c.width = Math.floor(vp.width * dpr);
      c.height = Math.floor(vp.height * dpr);
      const ctx = c.getContext("2d");
      if (!ctx) return;
      const zeichnen = page.render({
        canvas: c,
        canvasContext: ctx,
        viewport: vp,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      });
      task = zeichnen;
      zeichnen.promise.catch(() => {});
    });
    return () => {
      aus = true;
      task?.cancel();
    };
  }, [doc, nr, scale, sichtbar]);

  return (
    <div className="pdf-seite" ref={box} style={groesse ? { width: groesse.w, height: groesse.h } : { height: 800 * scale }}>
      <canvas ref={canvas} style={groesse ? { width: groesse.w, height: groesse.h } : undefined} />
    </div>
  );
}

export function PdfAnsicht({ url }: { url: string }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [scale, setScale] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let aus = false;
    let aufgabe: { destroy(): Promise<void> } | null = null;
    setDoc(null);
    setFehler(null);
    void lade()
      .then((lib) => {
        const ladeAufgabe = lib.getDocument({ url, enableXfa: false });
        aufgabe = ladeAufgabe;
        return ladeAufgabe.promise;
      })
      .then(async (d) => {
        if (aus) return;
        // Anfangs auf Breite einpassen.
        const p = await d.getPage(1);
        const breite = (box.current?.clientWidth ?? 600) - 32;
        setScale(Math.min(2, Math.max(0.5, breite / p.getViewport({ scale: 1 }).width)));
        setDoc(d);
      })
      .catch((e: unknown) => !aus && setFehler(e instanceof Error ? e.message : String(e)));
    return () => {
      aus = true;
      void aufgabe?.destroy();
    };
  }, [url]);

  return (
    <div className="pdf" ref={box}>
      {doc && scale && (
        <div className="pdf-leiste">
          <span>{doc.numPages === 1 ? t("1 Seite") : t("{n} Seiten", { n: doc.numPages })}</span>
          <span className="luecke" />
          <button type="button" className="knopf-klein knopf-symbol" aria-label={t("Herauszoomen")} onClick={() => setScale((s) => Math.max(0.3, (s ?? 1) / 1.2))}>
            <Minus size={13} />
          </button>
          <span className="pdf-zoom">{t("{n} %", { n: Math.round(scale * 100) })}</span>
          <button type="button" className="knopf-klein knopf-symbol" aria-label={t("Hineinzoomen")} onClick={() => setScale((s) => Math.min(4, (s ?? 1) * 1.2))}>
            <Plus size={13} />
          </button>
        </div>
      )}
      {fehler && <p className="panel-fehler">{t("Das PDF ließ sich nicht anzeigen: {fehler}", { fehler })}</p>}
      {!doc && !fehler && <p className="panel-hinweis">{t("PDF wird geladen …")}</p>}
      <div className="pdf-seiten">
        {doc && scale && Array.from({ length: doc.numPages }, (_, i) => <Seite key={i} doc={doc} nr={i + 1} scale={scale} />)}
      </div>
    </div>
  );
}
