# Vertrag zwischen Kern und Oberfläche

Diese Anwendung ist in zwei Hälften geteilt. Diese Datei beschreibt die Naht.

| | Zuständig | Status |
| --- | --- | --- |
| Prozess, Protokoll, Zustand | `src-tauri/src/lib.rs`, `src/core/` | **fertig und geprüft** |
| Oberfläche nach JLU Design System | `index.html`, `src/main.ts`, `src/styles.css` | zu bauen |

Die Oberfläche braucht **kein** ACP-Wissen, keine Tauri-Aufrufe und keine
Prozessverwaltung. Sie abonniert einen Schnappschuss und ruft Methoden.

---

## 1. Anbindung

```ts
import { useSyncExternalStore } from "react";
import { agent, type Snapshot } from "./core/index.ts";

export function useAgent(): Snapshot {
  return useSyncExternalStore(agent.subscribe, agent.getSnapshot);
}
```

`subscribe` und `getSnapshot` sind gebundene Felder, ihre Identität ist stabil —
sie dürfen direkt übergeben werden.

**Einmal beim Hochfahren** — vor dem ersten Rendern, nicht in einem Effekt pro
Komponente:

```ts
void agent.init();
```

`init()` bindet die Prozessereignisse, lädt die Einstellungen und liest die
gespeicherten Sitzungen. Es startet **keinen** Agenten. Der erste `send()` tut
das von selbst.

## 2. Der Schnappschuss

```ts
interface Snapshot {
  status: "offline" | "starting" | "ready" | "busy" | "cancelling" | "error";
  error: string | null;          // fertiger deutscher Satz, wenn status === "error"
  sessionId: string | null;
  cwd: string | null;            // Arbeitsverzeichnis des Agenten
  agentVersion: string | null;   // erste Zeile von `jichi --version`
  capabilities: AgentCapabilities | null;
  transcript: readonly TranscriptItem[];
  permission: PendingPermission | null;
  sessions: readonly StoredSession[];
  diagnostics: readonly string[]; // stderr des Agenten, jüngste zuletzt
  canSend: boolean;
  canCancel: boolean;
}
```

`canSend` und `canCancel` sind bereits abgeleitet. **Nicht neu herleiten** —
`canSend` gilt absichtlich auch offline (Senden verbindet selbst), `canCancel`
auch bei offener Berechtigungsfrage.

### `transcript`

Eine flache, geordnete Liste. `id` ist stabil und taugt als React-Schlüssel.

```ts
{ kind: "message", id, role: "user" | "agent" | "thought", text, streaming }
{ kind: "tool",    id, toolCallId, title, toolKind, status, output, truncated, diffs, rawInput }
{ kind: "notice",  id, level: "info" | "warning" | "error", text }
```

- `streaming: true` heißt: der Text wächst noch. Ein Cursor oder ein Puls gehört
  hierhin, sonst nirgends.
- Schnipsel sind bereits zusammengefasst — ein Eintrag je Antwort, nicht je Token.
- `output` ist bei 64 KiB gekappt; dann ist `truncated: true`.
- `notice` sind Meldungen der Anwendung selbst (Abbruch, Agent beendet, Warnung
  des Agenten), nicht des Modells.

### `permission`

```ts
{ requestId, toolCallId, title, toolKind, options: [{ optionId, name, kind }] }
```

Ist das gesetzt, **blockiert der Agent** und tut gar nichts mehr, bis geantwortet
wird. Diese Frage muss sichtbar sein, ohne dass jemand scrollt.

```ts
agent.answerPermission(option.optionId); // gewählt
agent.answerPermission(null);            // Zug abbrechen
```

`permissionTone(option)` liefert `"accent" | "warning" | "danger" | "neutral"` —
danach die Variante des Knopfes wählen, nicht nach dem Text.

## 3. Methoden

| Aufruf | Wirkung |
| --- | --- |
| `agent.send(text)` | Ein Zug. Verbindet bei Bedarf selbst. Wirft mit deutschem Text. |
| `agent.cancel()` | Bricht den laufenden Zug ab, auch bei offener Berechtigungsfrage. |
| `agent.newSession()` | Neues Gespräch. |
| `agent.loadSession(id)` | Gespeichertes Gespräch öffnen; der Verlauf wird eingespielt. |
| `agent.answerPermission(id \| null)` | Antwort auf die Berechtigungsfrage. |
| `agent.refreshSessions()` | Seitenleiste neu lesen (nach jedem Zug automatisch). |
| `agent.setConfig(config)` | Einstellungen speichern und neu verbinden. |
| `agent.config` | Aktuelle Einstellungen, oder `null` vor `init()`. |
| `agent.disconnect()` | Prozess beenden. |

## 4. Wortwahl und Ton

`src/core/labels.ts` hält die deutschen Wörter und die Einordnung. Damit kennt
keine Komponente ACP:

```ts
statusLabel(status)        // "bereit", "arbeitet", "bricht ab" …
statusTone(status)         // "success" | "accent" | "warning" | "danger" | "neutral"
toolKindLabel(kind)        // "liest", "ändert", "löscht", "führt aus" …
toolKindTone(kind)         // "danger" bei löschenden Werkzeugen
toolStatusLabel(status)    // "läuft", "fertig", "fehlgeschlagen"
permissionTone(option)
relativeTime(seconds)      // "vor 3 Min.", "gestern"
shortPath(path)            // "~/projekte/…"
```

`Tone` ist absichtlich abstrakt: die Zuordnung zu einer JLU-Variante oder einem
semantischen Token trifft die Oberfläche, an genau einer Stelle.

## 5. Was gezeichnet werden muss

Die Selbstprüfung erzeugt jeden dieser Zustände; keiner ist selten.

1. **Leer** — noch kein Gespräch.
2. **Eingabe** — `canSend === false` muss sichtbar sein, nicht nur wirkungslos.
3. **Strömender Text** — `streaming: true`.
4. **Werkzeugkarte** in vier Zuständen, davon einer `failed`.
5. **Berechtigungsfrage** — die wichtigste Fläche der ganzen Anwendung.
6. **Abbruch** — `cancelling`, und `canCancel` auch während der Frage.
7. **Agent beendet** — `offline` plus ein `notice` mit `level: "error"`.
8. **Fehler beim Start** — `status: "error"`, `error` ist der fertige Satz.
9. **Sitzungsliste** — Titel, Zeit, Arbeitsverzeichnis; die aktive markiert.
10. **Einstellungen** — Programm, Argumente, Arbeitsverzeichnis, **Pfad zur
    Schlüsseldatei**, und die Diagnose (`diagnostics`).

`src/main.ts` zeichnet alle zehn ohne Framework. Als Vorlage lesen, nicht
übernehmen.

## 6. Regeln

- **`src/core/` und `src-tauri/` nicht ändern.** Fehlt etwas, fehlt es im
  Vertrag — dann hier ergänzen, nicht daran vorbeiarbeiten.
- **Kein `invoke`, kein `listen` in Komponenten.** Der Transport ist die einzige
  Stelle, die Tauri kennt.
- **Keine festen Farben.** Regel des Design Systems: semantische Token statt
  `bg-blue-500` oder `style={{ color: "#123456" }}`.
- **Keine eigenen Grundbausteine.** Erst im Design System suchen.
- **Der Schlüssel bleibt in seiner Datei.** Die Einstellungen speichern den
  *Pfad*; gelesen wird er von der Rust-Seite beim Start. Kein Eingabefeld, das
  einen Schlüsselwert entgegennimmt und ablegt.

## 7. Prüfen

```sh
npm run check        # Typen + 31 Prüfungen des Kerns gegen einen erfundenen Agenten
npm run check:rust   # 8 Prüfungen der Rust-Seite
npm run tauri dev    # die Anwendung
```

`npm run check` braucht weder Fenster noch Tauri noch ein installiertes jichi.
Geprüft wird am **Rückgabewert**, nicht an der Ausgabe.

## 8. Was die Rust-Seite löst

Drei Dinge, die eine Oberfläche sonst zu spüren bekommt:

1. **PATH** — eine aus dem Dock gestartete Anwendung erbt kein
   Shell-Environment. Der PATH des Kindes wird ergänzt, und der Agent wird in den
   üblichen Verzeichnissen gesucht.
2. **Schlüssel** — der Agent liest `JICHI_API_KEY` aus der Umgebung. Die
   Anwendung kennt nur den Pfad einer Datei und liest sie beim Start.
3. **Generationen** — jedes Kind hat eine Nummer. Nach einem Neustart können
   gepufferte Zeilen des alten Prozesses nachkommen; sie werden verworfen,
   statt der neuen Sitzung zugeschrieben zu werden.

Und eine Eigenheit der Plattform: unter Windows gibt es kein natives jichi
(„not supported by design“), dort läuft der Start über `wsl.exe`. Die
Fallunterscheidung steht in `default_launch()` und sonst nirgends.
