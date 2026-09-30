/**
 * Das Eingabefeld: schreiben, anhängen, senden — und darunter, wie jichi
 * arbeitet (links) und mit welchem Modell (rechts).
 *
 * Der Knopf rechts im Feld sagt, was ein Druck gerade bewirkt: ohne Text ein
 * ruhiges ↵, mit Text der blaue Pfeil, während eines Zuges ein Stopp.
 *
 * Im Menü hinter „+“ steht nur, was wirklich geht. Keine Knöpfe für Dinge,
 * die der Agent (noch) nicht kann.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  ArrowUp,
  Check,
  ChevronDown,
  CornerDownLeft,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  GitCompare,
  ImagePlus,
  ListChecks,
  MessagesSquare,
  Paperclip,
  Plus,
  RefreshCw,
  Sparkles,
  Square,
  Terminal,
  X,
  Zap,
  Wand2,
} from "lucide-react";

import { agent, shortPath, t, type AgentMode, type Snapshot } from "../core/index.ts";
import { zurEingabe } from "./panel/store.ts";
import { kannAufnehmen, Mikrofon } from "./Sprache.tsx";
import { projektEinrichten } from "./ProjektEinrichten.tsx";
import type { FileAttachment } from "../core/transport.ts";

const nachricht = (ursache: unknown) => (ursache instanceof Error ? ursache.message : String(ursache));

/** Schliesst ein Aufklappmenü bei Klick daneben und bei Escape. */
function useSchliessen(ref: RefObject<HTMLElement | null>, offen: boolean, zu: () => void) {
  useEffect(() => {
    if (!offen) return;
    const klick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) zu();
    };
    const taste = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        zu();
      }
    };
    document.addEventListener("mousedown", klick);
    window.addEventListener("keydown", taste, true);
    return () => {
      document.removeEventListener("mousedown", klick);
      window.removeEventListener("keydown", taste, true);
    };
  }, [ref, offen, zu]);
}

function Menuepunkt({
  icon,
  titel,
  text,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  titel: string;
  text?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" role="menuitem" className="menue-punkt" disabled={disabled} onClick={onClick}>
      <span className="menue-icon">{icon}</span>
      <span className="menue-titel">{titel}</span>
      {text && <span className="menue-text">{text}</span>}
    </button>
  );
}

// ── Bilder ───────────────────────────────────────────────────────────────────

const MAX_BILDER = 4;
const MAX_BILD_BYTES = 5 * 1024 * 1024;

interface Bild {
  id: string;
  data: string;
  mimeType: string;
  url: string;
}

function alsBild(datei: File): Promise<Bild> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|gif|webp)$/.test(datei.type)) {
      reject(new Error(t("Nur PNG, JPEG, GIF oder WebP.")));
      return;
    }
    if (datei.size > MAX_BILD_BYTES) {
      reject(new Error(t("Das Bild ist größer als 5 MB.")));
      return;
    }
    const leser = new FileReader();
    leser.onerror = () => reject(new Error(t("Das Bild ließ sich nicht lesen.")));
    leser.onload = () => {
      const url = String(leser.result);
      resolve({ id: `${Date.now()}-${Math.random()}`, url, data: url.slice(url.indexOf(",") + 1), mimeType: datei.type });
    };
    leser.readAsDataURL(datei);
  });
}

// ── Das Menü hinter „+“ ──────────────────────────────────────────────────────

/** Zur Zeit des Zeichnens gebaut, damit die Texte der aktuellen Sprache folgen. */
const auftraege = (): Array<{ icon: ReactNode; titel: string; text: string; dokumente?: boolean }> => [
  { icon: <FileSpreadsheet size={15} />, titel: t("Bericht als Word"), text: t("Fasse den Stand dieses Projekts als Bericht zusammen und speichere ihn als bericht.docx."), dokumente: true },
  { icon: <FileText size={15} />, titel: t("Projekt erklären"), text: t("Erklär mir den Aufbau dieses Projekts und die wichtigsten Teile.") },
  { icon: <Terminal size={15} />, titel: t("Tests ausführen"), text: t("Führe die Tests aus und fasse zusammen, was fehlschlägt.") },
  { icon: <GitCompare size={15} />, titel: t("Änderungen prüfen"), text: t("Sieh dir die noch nicht committeten Änderungen an (git diff) und prüfe sie auf Fehler.") },
  { icon: <Sparkles size={15} />, titel: t("Commit-Nachricht"), text: t("Schlage eine Commit-Nachricht für die aktuellen Änderungen vor.") },
];

function PlusMenue({
  snap,
  bildWaehlen,
  dateiAnhaengen,
  auftrag,
}: {
  snap: Snapshot;
  bildWaehlen: () => void;
  dateiAnhaengen: () => void;
  auftrag: (text: string) => void;
}) {
  const [offen, setOffen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const zu = useCallback(() => setOffen(false), []);
  useSchliessen(box, offen, zu);
  const tun = (f: () => void) => () => {
    setOffen(false);
    f();
  };

  return (
    <div className="plus" ref={box}>
      <button
        type="button"
        className={`plus-knopf${offen ? " offen" : ""}`}
        aria-label={t("Hinzufügen")}
        aria-haspopup="menu"
        aria-expanded={offen}
        onClick={() => setOffen((o) => !o)}
      >
        <Plus size={17} />
      </button>
      {offen && (
        <div className="menue plus-menue" role="menu">
          <div className="menue-gruppe">{t("Hinzufügen")}</div>
          <Menuepunkt
            icon={<ImagePlus size={15} />}
            titel={t("Bilder")}
            text={snap.canAttachImages ? t("einfügen, ziehen oder wählen") : t("das Modell liest keine Bilder")}
            disabled={!snap.canAttachImages}
            onClick={tun(bildWaehlen)}
          />
          <Menuepunkt
            icon={<Paperclip size={15} />}
            titel={t("Datei")}
            text={t("PDF, Word, Excel oder Text als Kontext")}
            onClick={tun(dateiAnhaengen)}
          />
          <Menuepunkt
            icon={<FolderOpen size={15} />}
            titel={snap.hasProject ? t("Anderes Projekt") : t("Projekt öffnen")}
            text={snap.hasProject ? shortPath(snap.cwd, 28) : t("Ordner wählen")}
            disabled={!snap.canSwitch}
            onClick={tun(() => void agent.pickWorkspace().catch(() => {}))}
          />
          <Menuepunkt
            icon={<Wand2 size={15} />}
            titel={t("Projekt einrichten")}
            text={snap.hasProject ? t("Packs von jichi init") : t("erst ein Projekt öffnen")}
            disabled={!snap.hasProject || !snap.canSwitch}
            onClick={tun(projektEinrichten)}
          />
          {snap.documents && !snap.documents.enabled && !snap.documents.problem && (
            <Menuepunkt
              icon={<FileSpreadsheet size={15} />}
              titel={t("Dokumente einschalten")}
              text={t("jichi liest und erstellt PDF, Word, Excel")}
              disabled={!snap.canSwitch}
              onClick={tun(() => void agent.setDocuments(true).catch(() => {}))}
            />
          )}
          <div className="menue-gruppe">{t("Schnellaufträge")}</div>
          {auftraege().filter((a) => !a.dokumente || snap.documents?.enabled).map((a) => (
            <Menuepunkt
              key={a.titel}
              icon={a.icon}
              titel={a.titel}
              text={snap.hasProject ? undefined : t("erst ein Projekt öffnen")}
              disabled={!snap.hasProject}
              onClick={tun(() => auftrag(a.text))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Arbeitsweise (links) ─────────────────────────────────────────────────────

/** Zur Zeit des Zeichnens gebaut, damit die Texte der aktuellen Sprache folgen. */
const modi = (): Array<{ id: AgentMode; label: string; titel: string; icon: ReactNode }> => [
  { id: "chat", label: "Chat", titel: t("fragt vor jeder Änderung"), icon: <MessagesSquare size={13} /> },
  { id: "plan", label: "Plan", titel: t("liest und plant, ändert nichts"), icon: <ListChecks size={13} /> },
  { id: "auto", label: "Auto", titel: t("ändert und führt aus, ohne zu fragen"), icon: <Zap size={13} /> },
];

function Modus({ snap, fehler }: { snap: Snapshot; fehler: (text: string | null) => void }) {
  const [frage, setFrage] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const zu = useCallback(() => setFrage(false), []);
  useSchliessen(box, frage, zu);

  async function setzen(mode: AgentMode) {
    fehler(null);
    try {
      await agent.setMode(mode);
    } catch (ursache) {
      fehler(nachricht(ursache));
    }
  }

  return (
    <div className="modus-box" ref={box}>
      <div className="modus" role="radiogroup" aria-label={t("Arbeitsweise")}>
        {modi().map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={snap.mode === m.id}
            className={`${snap.mode === m.id ? "gewaehlt" : ""} modus-${m.id}`}
            disabled={!snap.canSwitch}
            title={`${m.label}: ${m.titel}`}
            onClick={() => {
              if (m.id === snap.mode) return;
              if (m.id === "auto") setFrage(true);
              else void setzen(m.id);
            }}
          >
            {m.icon}
            <span>{m.label}</span>
          </button>
        ))}
      </div>
      {frage && (
        <div className="menue auto-frage" role="alertdialog" aria-label={t("Auto-Modus")}>
          <p>
            <strong>Auto</strong>{" "}
            {t("ändert Dateien und führt Befehle aus, ohne zu fragen. Es beginnt ein neuer Chat. Nur für Projekte unter Versionsverwaltung.")}
          </p>
          <div>
            <button type="button" className="knopf" onClick={() => setFrage(false)}>
              {t("Abbrechen")}
            </button>
            <button
              type="button"
              className="knopf gefahr-voll"
              onClick={() => {
                setFrage(false);
                void setzen("auto");
              }}
            >
              {t("Auto einschalten")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Modell (rechts) ──────────────────────────────────────────────────────────

interface Wahl {
  wert: string | null;
  name: string;
  detail: string;
}

function ModellMenue({ snap, fehler }: { snap: Snapshot; fehler: (text: string | null) => void }) {
  const [offen, setOffen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const zu = useCallback(() => setOffen(false), []);
  useSchliessen(box, offen, zu);

  const konfiguriert = (snap.readiness?.config.models ?? []).filter(
    (m) => m.roles.length === 0 || m.roles.includes("chat"),
  );
  const bekannt = new Set(konfiguriert.flatMap((m) => [m.name, m.model]));
  const eigene: Wahl[] = konfiguriert.map((m, i) => ({
    wert: i === 0 ? null : m.name,
    name: m.name,
    detail: m.model.replace(/^jlu\//, ""),
  }));
  const gateway: Wahl[] = (snap.gateway?.models ?? [])
    .filter((m) => m.kind === "chat" && !bekannt.has(m.id))
    .map((m) => ({ wert: m.id, name: m.id.replace(/^jlu\//, ""), detail: t("am Gateway") }));

  const aktiv = snap.model;
  const gewaehlt =
    [...eigene, ...gateway].find((w) => w.wert === aktiv) ??
    (aktiv ? { wert: aktiv, name: aktiv.replace(/^jlu\//, ""), detail: "" } : eigene[0]);

  async function waehlen(wert: string | null) {
    setOffen(false);
    fehler(null);
    try {
      await agent.setModel(wert);
    } catch (ursache) {
      fehler(nachricht(ursache));
    }
  }

  const punkt = (w: Wahl) => (
    <button
      key={`${w.wert ?? ""}`}
      type="button"
      role="menuitemradio"
      aria-checked={w.wert === aktiv}
      className="menue-punkt modell-punkt"
      onClick={() => void waehlen(w.wert)}
    >
      <span className="menue-titel">{w.name}</span>
      <span className="menue-text">{w.detail}</span>
      <span className="modell-haken">{w.wert === aktiv && <Check size={14} />}</span>
    </button>
  );

  return (
    <div className="modell-box" ref={box}>
      <button
        type="button"
        className={`modell-knopf${offen ? " offen" : ""}`}
        disabled={!snap.canSwitch}
        aria-haspopup="menu"
        aria-expanded={offen}
        title={snap.canSwitch ? t("Modell wählen") : t("Während einer Antwort nicht wählbar")}
        onClick={() => setOffen((o) => !o)}
      >
        <span>{gewaehlt?.name ?? t("Modell")}</span>
        <ChevronDown size={13} />
      </button>
      {offen && (
        <div className="menue modell-menue" role="menu">
          <div className="menue-gruppe">{t("Modell")}</div>
          {eigene.length === 0 && <div className="menue-leer">{t("Keine Modelle konfiguriert.")}</div>}
          {eigene.map(punkt)}
          {gateway.length > 0 && <div className="menue-gruppe">{t("Weitere am Gateway")}</div>}
          {gateway.map(punkt)}
          <div className="menue-fuss">
            <span>
              {snap.gateway?.error ??
                (snap.gateway?.loading ? t("Gateway wird gefragt …") : t("Nur freie Modelle (jlu/…)"))}
            </span>
            <button
              type="button"
              aria-label={t("Liste neu laden")}
              title={t("Liste neu laden")}
              disabled={!snap.readiness?.keyStored || snap.gateway?.loading}
              onClick={() => void agent.refreshGateway()}
            >
              <RefreshCw size={12} className={snap.gateway?.loading ? "dreht" : ""} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Das Feld ─────────────────────────────────────────────────────────────────

export function Eingabe({ snap }: { snap: Snapshot }) {
  const [text, setText] = useState("");
  const [bilder, setBilder] = useState<Bild[]>([]);
  const [dateien, setDateien] = useState<FileAttachment[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ziehen, setZiehen] = useState(false);
  const feld = useRef<HTMLTextAreaElement>(null);
  const waehler = useRef<HTMLInputElement>(null);

  const anpassen = useCallback(() => {
    const el = feld.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);
  useEffect(anpassen, [text, anpassen]);
  useEffect(() => {
    window.addEventListener("resize", anpassen);
    return () => window.removeEventListener("resize", anpassen);
  }, [anpassen]);

  async function bilderDazu(liste: File[]) {
    const nurBilder = liste.filter((d) => d.type.startsWith("image/"));
    if (!nurBilder.length) return;
    if (!snap.canAttachImages) {
      setFehler(t("Das aktive Modell kann keine Bilder lesen."));
      return;
    }
    setFehler(null);
    try {
      const neu = await Promise.all(nurBilder.map(alsBild));
      setBilder((alt) => {
        const alle = [...alt, ...neu];
        if (alle.length > MAX_BILDER) setFehler(t("Höchstens {n} Bilder je Nachricht.", { n: MAX_BILDER }));
        return alle.slice(0, MAX_BILDER);
      });
    } catch (ursache) {
      setFehler(nachricht(ursache));
    }
  }

  async function dateiDazu() {
    setFehler(null);
    try {
      const d = await agent.pickAttachment();
      if (d) setDateien((alt) => [...alt.filter((x) => x.path !== d.path), d]);
    } catch (ursache) {
      setFehler(nachricht(ursache));
    }
  }

  // Aus der Seitenleiste: ein Ausschnitt oder eine Datei als Kontext.
  useEffect(
    () =>
      zurEingabe.listen((e) => {
        if ("ersetzen" in e) {
          // „Bearbeiten“ einer früheren Nachricht: sie steht wieder im Feld.
          setText(e.ersetzen);
          requestAnimationFrame(() => feld.current?.focus());
        } else if ("dateien" in e) {
          void ablegen(e.dateien);
        } else if ("text" in e) {
          setText((alt) => (alt.trim() ? `${alt.trimEnd()}\n\n${e.text}` : e.text));
          requestAnimationFrame(() => {
            const el = feld.current;
            el?.focus();
            el?.setSelectionRange(el.value.length, el.value.length);
          });
        } else {
          void agent.attachmentOf(e.datei).then(
            (d) => setDateien((alt) => [...alt.filter((x) => x.path !== d.path), d]),
            (err: Error) => setFehler(err.message),
          );
        }
      }),
    [],
  );

  // Dateien über dem Fenster fallen lassen: Bilder als Bild, alles andere als Kontext.
  async function ablegen(pfade: string[]) {
    setFehler(null);
    for (const p of pfade) {
      const bild = /\.(png|jpe?g|gif|webp)$/i.test(p);
      try {
        if (bild) {
          if (!snap.canAttachImages) {
            setFehler(t("Das aktive Modell kann keine Bilder lesen."));
            continue;
          }
          const b = await agent.readImage(p);
          setBilder((alt) => [...alt, { id: `${Date.now()}-${Math.random()}`, data: b.data, mimeType: b.mimeType, url: `data:${b.mimeType};base64,${b.data}` }].slice(0, MAX_BILDER));
        } else {
          const d = await agent.attachmentFromPath(p);
          setDateien((alt) => [...alt.filter((x) => x.path !== d.path), d]);
        }
      } catch (ursache) {
        setFehler(nachricht(ursache));
      }
    }
  }
  const [schwebt, setSchwebt] = useState(false);
  useEffect(() => {
    let aus: (() => void) | null = null;
    let weg = false;
    void agent.onFileDrop((e) => {
      if (e.kind === "over") setSchwebt(true);
      else setSchwebt(false);
      if (e.kind === "drop" && e.paths.length) void ablegen(e.paths);
    }).then((f) => (weg ? f() : (aus = f)), () => {});
    return () => {
      weg = true;
      aus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.canAttachImages]);

  const leer = !text.trim() && !bilder.length && !dateien.length;
  const arbeitet = snap.canCancel;

  function senden() {
    if (leer || !snap.canSend) return;
    const inhalt = text.trim();
    const mitBildern = bilder;
    const mitDateien = dateien;
    setText("");
    setBilder([]);
    setDateien([]);
    setFehler(null);
    void agent
      .send(
        inhalt,
        mitBildern.map(({ data, mimeType }) => ({ data, mimeType })),
        mitDateien,
      )
      .catch((ursache) => {
        // nicht verlieren, wenn der Start scheitert
        setText(inhalt);
        setBilder(mitBildern);
        setDateien(mitDateien);
        setFehler(nachricht(ursache));
      });
  }

  /** Diktierter Text an die Schreibmarke — markierter Text wird ersetzt. */
  function diktiert(diktat: string) {
    const el = feld.current;
    const von = el?.selectionStart ?? text.length;
    const bis = el?.selectionEnd ?? text.length;
    const davor = text.slice(0, von);
    const danach = text.slice(bis);
    const luecke = davor && !/\s$/.test(davor) ? " " : "";
    const neu = `${davor}${luecke}${diktat}${danach && !/^\s/.test(danach) ? " " : ""}${danach}`;
    setText(neu);
    const pos = davor.length + luecke.length + diktat.length;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  }

  function auftrag(auftragText: string) {
    setText((alt) => (alt.trim() ? `${alt.trimEnd()}\n${auftragText}` : auftragText));
    requestAnimationFrame(() => {
      const el = feld.current;
      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
    });
  }

  return (
    <div className="eingabe">
      <div className="spalte">
        {schwebt && (
          <div className="ablage-hinweis" aria-live="polite">
            {t("Loslassen zum Anhängen — Bilder, PDF, Word, Excel, Text")}
          </div>
        )}
        <div
          className={`eingabe-feld${ziehen || schwebt ? " ziehen" : ""}`}
          onDragOver={(e) => {
            if ([...e.dataTransfer.items].some((i) => i.type.startsWith("image/"))) {
              e.preventDefault();
              setZiehen(true);
            }
          }}
          onDragLeave={() => setZiehen(false)}
          onDrop={(e) => {
            e.preventDefault();
            setZiehen(false);
            void bilderDazu([...e.dataTransfer.files]);
          }}
        >
          {(bilder.length > 0 || dateien.length > 0) && (
            <div className="anhaenge">
              {bilder.map((a) => (
                <div key={a.id} className="anhang">
                  <img src={a.url} alt="" />
                  <button type="button" aria-label={t("Bild entfernen")} onClick={() => setBilder((alt) => alt.filter((x) => x.id !== a.id))}>
                    <X size={11} />
                  </button>
                </div>
              ))}
              {dateien.map((d) => (
                <div key={d.path} className="anhang-datei" title={d.path}>
                  <FileText size={14} />
                  <span>{d.name}</span>
                  <button type="button" aria-label={t("{name} entfernen", { name: d.name })} onClick={() => setDateien((alt) => alt.filter((x) => x.path !== d.path))}>
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="eingabe-zeile">
            <PlusMenue
              snap={snap}
              bildWaehlen={() => waehler.current?.click()}
              dateiAnhaengen={() => void dateiDazu()}
              auftrag={auftrag}
            />
            <input
              ref={waehler}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              multiple
              hidden
              onChange={(e) => {
                void bilderDazu([...(e.target.files ?? [])]);
                e.target.value = "";
              }}
            />
            <textarea
              ref={feld}
              rows={1}
              value={text}
              placeholder={snap.hasProject ? t("Frag jichi …") : t("Frag jichi … oder öffne zuerst ein Projekt")}
              readOnly={!snap.canSend && !arbeitet}
              onChange={(e) => setText(e.target.value)}
              onPaste={(e) => {
                const liste = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
                if (liste.length) {
                  e.preventDefault();
                  void bilderDazu(liste);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  senden();
                }
              }}
            />
            {snap.readiness?.keyStored && kannAufnehmen() && (
              <Mikrofon einfuegen={diktiert} fehler={setFehler} aus={!snap.canSend && !arbeitet} />
            )}
            {arbeitet ? (
              <button className="senden stopp" onClick={() => void agent.cancel()} aria-label={t("Antwort abbrechen")} title={t("Abbrechen")}>
                <Square size={11} fill="currentColor" />
              </button>
            ) : leer ? (
              <span className="senden ruhig" aria-hidden="true" title={t("Enter zum Senden")}>
                <CornerDownLeft size={15} />
              </span>
            ) : (
              <button className="senden" disabled={!snap.canSend} onClick={senden} aria-label={t("Senden")} title={t("Senden (Enter)")}>
                <ArrowUp size={16} strokeWidth={2.4} />
              </button>
            )}
          </div>
        </div>

        <div className="eingabe-fuss">
          <Modus snap={snap} fehler={setFehler} />
          {fehler ? (
            <span className="eingabe-fehler" role="alert">
              {fehler}
            </span>
          ) : (
            <span className="eingabe-luecke" />
          )}
          <ModellMenue snap={snap} fehler={setFehler} />
        </div>
      </div>
    </div>
  );
}
