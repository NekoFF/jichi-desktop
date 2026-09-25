# Auftrag: Oberfläche nach dem JLU Design System

## Wo du arbeitest

```
Verzeichnis : /Users/neko/FOLDER1HOME/projects/jichi-desktop-design
Zweig       : design/jlu
```

Das ist ein eigener Arbeitsbaum desselben Repositoriums (`git worktree`).
Parallel dazu arbeitet jemand anderes in
`/Users/neko/FOLDER1HOME/projects/jichi-desktop` auf `main`. **Dieses
Verzeichnis nie betreten und `main` nie auschecken** — dann gibt es keine
Konflikte, und am Ende wird `design/jlu` in `main` zusammengeführt.

Zuerst:

```sh
cd /Users/neko/FOLDER1HOME/projects/jichi-desktop-design
npm install
```

Ein bereits laufender Entwicklungsserver des anderen Arbeitsbaums belegt Port
1420. Vorher beenden, sonst startet `npm run tauri dev` nicht.

## Was es ist

Eine Desktop-Anwendung (Tauri v2) für **jichi**, den C89-Agenten der JLU Gießen.
Sie startet ihn als Kindprozess und spricht ACP mit ihm. Läuft auf Linux, macOS
und Windows.

**Die gesamte Logik ist fertig und geprüft.** Prozessverwaltung, Protokoll,
Zustandsmaschine, Einstellungen, Fehlerbehandlung — alles liegt in
`src-tauri/src/lib.rs` und `src/core/`. Deine Aufgabe ist ausschließlich die
Oberfläche.

## Was du baust

Die Anwendung ist ein Chat mit einem Agenten, der Werkzeuge benutzt und dafür um
Erlaubnis fragt.

```
┌──────────────┬─────────────────────────────────────┐
│ jichi        │  ● bereit          ~/projekte/foo   │
│ + Neuer Chat ├─────────────────────────────────────┤
│              │  Du                                 │
│ SITZUNGEN    │  Erklär mir dieses Projekt          │
│ Parser-Fix   │                                     │
│ Tests        │  jichi                              │
│ README       │  Ich sehe mir die Dateien an…       │
│              │                                     │
│              │  ┌ read_file src/main.c ── fertig ┐ │
│              │  │ int main(void) { return 0; }   │ │
│              │  └────────────────────────────────┘ │
│              │                                     │
│              │  ┌ jichi bittet um Erlaubnis ─────┐ │
│              │  │ write_file notes.txt           │ │
│              │  │ [Erlauben] [Immer] [Ablehnen]  │ │
│              │  └────────────────────────────────┘ │
│ Einstellungen│  [ Frag jichi …              ]  ➤   │
└──────────────┴─────────────────────────────────────┘
```

**Verbindlich ist `docs/CONTRACT.md`.** Dort steht die Anbindung, die Form des
Zustands, alle Methoden und die zehn Zustände, die gezeichnet werden müssen.
Lies sie zuerst.

`index.html` und `src/main.ts` enthalten heute eine vollständige, laufende
Referenzansicht in reinem DOM. Sie zeichnet alle zehn Zustände. **Als Vorlage
lesen, dann ersetzen** — sie ist der Beweis, dass der Kern vollständig ist, kein
Gestaltungsvorschlag.

## Technik

- **React 19 + TypeScript**, Vite ist schon eingerichtet.
- **`@ki4jlu/design-system`** ist die einzige Gestaltungsgrundlage:
  <https://github.com/KI4JLU/JLU-Design-System>

  Das Paket liegt nicht in der npm-Registry, lässt sich aber direkt aus GitHub
  installieren — sein `prepare`-Skript baut `dist` beim Installieren:

  ```sh
  npm i github:KI4JLU/JLU-Design-System
  ```

  Es braucht React 19 und Tailwind 4 als Peer. Die Schriften (Inter, Manrope,
  JetBrains Mono) lädt die Anwendung selbst. Neben den Komponenten wird
  `@ki4jlu/design-system/tokens.css` exportiert.

- Vorhandene Komponenten benutzen, keine eigenen bauen: Layouts, `Button`,
  `Card`, `Dialog`, `Badge`, `Tooltip`, Eingabefelder, Seitenleiste.
  `ThemeProvider` bringt hell/dunkel/System mit — keine eigene Themenlogik.
- Deutsch als Sprache der Oberfläche. Die Wörter liegen fertig in
  `src/core/labels.ts`.

## Grenzen

**Gesperrt:** `src/core/**`, `src-tauri/**`, `docs/CONTRACT.md`.

**Dir gehören:** `index.html`, `src/main.ts` (→ `main.tsx`), `src/styles.css`,
alles Neue unter `src/`, sowie `package.json`, `tsconfig.json` und
`vite.config.ts`.

Fehlt dir etwas aus dem Kern — ein Feld, eine Methode, ein Ereignis —, dann
**nicht daran vorbeiarbeiten**: in `docs/CONTRACT.md` als offene Frage
vermerken und weiterbauen. Der Kern ergänzt es.

Drei Regeln, die nicht verhandelbar sind:

1. Kein `invoke`, kein `listen`, kein `@tauri-apps/api` in einer Komponente.
   `import { agent } from "./core/index.ts"` ist der einzige Zugang.
2. Keine festen Farben. Semantische Token, nie `bg-blue-500`, nie
   `style={{ color: "#123456" }}`.
3. Kein Eingabefeld, das einen API-Schlüssel entgegennimmt. Die Einstellungen
   kennen nur den **Pfad** zu der Datei, die ihn enthält — gelesen wird sie von
   der Rust-Seite beim Start.

## Fertig ist es, wenn

```sh
npm run check        # Typen + 31 Prüfungen des Kerns — muss grün bleiben
npm run check:rust   # 9 Prüfungen der Rust-Seite
npm run tauri dev    # startet und zeigt alle zehn Zustände
```

Wird `npm run check` rot, wurde der Kern angefasst. Dann zurücknehmen.

Zum Ausprobieren ohne Modell: `src/core/selftest.ts` zeigt, wie sich jeder
Zustand erzeugen lässt — ein erfundener Agent, kein Fenster, kein Schlüssel.
