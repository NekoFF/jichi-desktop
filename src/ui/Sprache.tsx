/**
 * Sprache in der Oberfläche: diktieren ins Eingabefeld und Antworten vorlesen.
 *
 * Aufgenommen wird im Fenster (MediaRecorder); was gesprochen wurde, geht über
 * den Kern an Rust und von dort ans Gateway — der Schlüssel kommt nie hierher.
 * Der erkannte Text landet im Eingabefeld, nicht direkt bei jichi: man sieht
 * ihn, kann ihn verbessern, und erst „Senden“ macht ihn zur Frage.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Loader2, Mic, Square, Volume2 } from "lucide-react";

import { agent } from "../core/index.ts";
import { nachricht } from "./util.ts";

/** Längste Aufnahme; danach wird von selbst gestoppt und erkannt. */
const AUFNAHME_MAX_MS = 5 * 60 * 1000;

export function kannAufnehmen(): boolean {
  return typeof MediaRecorder !== "undefined" && typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

/** Das Format, das diese WebView kann und Whisper versteht. */
function format(): string | undefined {
  for (const t of ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"]) {
    if (MediaRecorder.isTypeSupported?.(t)) return t;
  }
  return undefined;
}

function mikrofonFehler(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Kein Zugriff auf das Mikrofon — in den Systemeinstellungen unter Datenschutz › Mikrofon erlauben.";
  }
  if (name === "NotFoundError") return "Kein Mikrofon gefunden.";
  return `Aufnahme nicht möglich: ${nachricht(e)}`;
}

type Diktat = "bereit" | "nimmt-auf" | "erkennt";

/** Diktieren: einmal klicken nimmt auf, noch einmal klicken erkennt. Esc verwirft. */
export function Mikrofon({ einfuegen, fehler, aus }: {
  einfuegen: (text: string) => void;
  fehler: (text: string | null) => void;
  aus?: boolean;
}) {
  const [zustand, setZustand] = useState<Diktat>("bereit");
  const [sekunden, setSekunden] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const verwerfen = useRef(false);
  const uhr = useRef<ReturnType<typeof setInterval> | null>(null);
  const grenze = useRef<ReturnType<typeof setTimeout> | null>(null);

  const aufraeumen = useCallback(() => {
    if (uhr.current) clearInterval(uhr.current);
    if (grenze.current) clearTimeout(grenze.current);
    uhr.current = grenze.current = null;
    rec.current?.stream.getTracks().forEach((t) => t.stop());
    rec.current = null;
  }, []);

  useEffect(() => () => {
    verwerfen.current = true;
    if (rec.current?.state === "recording") rec.current.stop();
    aufraeumen();
  }, [aufraeumen]);

  const stoppen = useCallback((weg = false) => {
    verwerfen.current = weg;
    if (rec.current?.state === "recording") rec.current.stop();
  }, []);

  useEffect(() => {
    if (zustand !== "nimmt-auf") return;
    const f = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        stoppen(true);
      }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [zustand, stoppen]);

  async function starten() {
    fehler(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      fehler(mikrofonFehler(e));
      return;
    }
    const mime = format();
    const r = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    const teile: Blob[] = [];
    r.ondataavailable = (e) => e.data.size && teile.push(e.data);
    r.onstop = async () => {
      const typ = r.mimeType || mime || "audio/mp4";
      aufraeumen();
      if (verwerfen.current) {
        setZustand("bereit");
        return;
      }
      setZustand("erkennt");
      try {
        const text = await agent.transcribe(new Blob(teile, { type: typ }));
        if (text) einfuegen(text);
        else fehler("Nichts verstanden — bitte noch einmal.");
      } catch (e) {
        fehler(nachricht(e));
      } finally {
        setZustand("bereit");
      }
    };
    rec.current = r;
    verwerfen.current = false;
    r.start(1000);
    setSekunden(0);
    setZustand("nimmt-auf");
    const t0 = Date.now();
    uhr.current = setInterval(() => setSekunden(Math.floor((Date.now() - t0) / 1000)), 250);
    grenze.current = setTimeout(() => stoppen(false), AUFNAHME_MAX_MS);
  }

  if (zustand === "nimmt-auf") {
    const mm = String(Math.floor(sekunden / 60));
    const ss = String(sekunden % 60).padStart(2, "0");
    return (
      <button type="button" className="mikrofon nimmt-auf" onClick={() => stoppen(false)}
        aria-label="Aufnahme beenden und erkennen" title="Beenden und erkennen · Esc verwirft">
        <span className="mikrofon-punkt" aria-hidden="true" />
        <span className="mikrofon-zeit">{mm}:{ss}</span>
        <Square size={10} fill="currentColor" />
      </button>
    );
  }
  if (zustand === "erkennt") {
    return (
      <span className="mikrofon erkennt" role="status" aria-label="Wird erkannt" title="Wird erkannt …">
        <Loader2 size={15} className="dreht" />
      </span>
    );
  }
  return (
    <button type="button" className="mikrofon" disabled={aus} onClick={() => void starten()} aria-label="Diktieren" title="Diktieren">
      <Mic size={15} />
    </button>
  );
}

// ── Vorlesen ─────────────────────────────────────────────────────────────────

/** Ein Spieler für die ganze Anwendung: es liest immer nur eine Antwort vor. */
type Spiel = { id: string | null; laedt: boolean };
let spiel: Spiel = { id: null, laedt: false };
let ton: HTMLAudioElement | null = null;
let url: string | null = null;
const hoerer = new Set<() => void>();
const setze = (s: Spiel) => {
  spiel = s;
  hoerer.forEach((f) => f());
};

function anhalten() {
  ton?.pause();
  ton = null;
  if (url) URL.revokeObjectURL(url);
  url = null;
  setze({ id: null, laedt: false });
}

async function vorlesen(id: string, text: string, fehler: (t: string) => void) {
  anhalten();
  setze({ id, laedt: true });
  try {
    const mp3 = await agent.speak(text);
    if (spiel.id !== id) return; // inzwischen etwas anderes gewählt
    url = URL.createObjectURL(new Blob([mp3], { type: "audio/mpeg" }));
    ton = new Audio(url);
    ton.onended = anhalten;
    ton.onerror = () => {
      anhalten();
      fehler("Der Ton ließ sich nicht abspielen.");
    };
    setze({ id, laedt: false });
    await ton.play();
  } catch (e) {
    if (spiel.id === id) anhalten();
    fehler(nachricht(e));
  }
}

export function Vorlesen({ id, text }: { id: string; text: string }) {
  const s = useSyncExternalStore(
    (f) => (hoerer.add(f), () => hoerer.delete(f)),
    () => spiel,
  );
  const [fehler, setFehler] = useState<string | null>(null);
  useEffect(() => {
    if (!fehler) return;
    const t = setTimeout(() => setFehler(null), 6000);
    return () => clearTimeout(t);
  }, [fehler]);
  const meins = s.id === id;
  return (
    <>
      <button type="button"
        className={meins ? "vorlesen aktiv" : "vorlesen"}
        onClick={() => (meins ? anhalten() : void vorlesen(id, text, setFehler))}
        aria-label={meins ? "Vorlesen beenden" : "Vorlesen"}
        title={meins ? "Vorlesen beenden" : "Vorlesen"}
        aria-pressed={meins}>
        {meins && s.laedt ? <Loader2 size={14} className="dreht" /> : meins ? <Square size={11} fill="currentColor" /> : <Volume2 size={14} />}
      </button>
      {fehler && <span className="aktionen-fehler" role="alert" title={fehler}>{fehler}</span>}
    </>
  );
}
