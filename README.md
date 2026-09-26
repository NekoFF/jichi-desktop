# jichi Desktop

Ein Desktop-Fenster für den KI-Agenten [jichi](https://github.com/alexanderlarsdallmann/jichi)
— für macOS, Linux und Windows. Projektordner wählen, Aufgabe schreiben, Antworten,
Werkzeugaufrufe und Rückfragen sehen, frühere Chats wieder aufnehmen.

Die Anwendung ist ein **Client**: sie startet `jichi --acp` als Kindprozess und
spricht mit ihm über ACP (JSON-RPC 2.0, eine Nachricht pro Zeile über stdin/stdout).
Modell und Agentenschleife sind jichi; hier liegen Fenster, Protokoll und Zustand.

## Was sie kann

- Chats pro Projekt, mit Verlauf, Suche, Export (Markdown, Word, PDF) und einer
  Sprungleiste zu jeder Frage
- Rückfragen und Erlaubnisse von jichi als Dialog, dauerhafte Erlaubnisse und
  MCP-Server in den Einstellungen
- Seitenpanel: Dateien, Datei-Ansicht und -Bearbeitung, Git-Änderungen, Terminal,
  Browser, Artefakte (HTML/SVG/Mermaid in einer abgeschotteten Vorschau), PDF-Vorschau
- Dokumente für jichi: PDF, Word, Excel lesen und erzeugen (eingebauter MCP-Server)
- Modelle über das HRZ-Gateway; der API-Schlüssel liegt in einer geschützten Datei
  der Anwendung, nie in `localStorage`, Logs oder Zustand

## Voraussetzungen

- **jichi** gebaut oder im `PATH` (die Anwendung sucht es beim ersten Start)
- Node.js 24, Rust (stable), dazu die [Tauri-Voraussetzungen](https://v2.tauri.app/start/prerequisites/)
  der Plattform

## Befehle

```sh
npm install
npm run tauri dev      # Anwendung mit Live-Neuladen
npm run check          # TypeScript, Kern-Selbsttest, UI-Tests
npm run check:rust     # Rust-Tests
npm run build          # Frontend bauen
npm run tauri build    # Installationspaket (.app/.dmg, .deb/.AppImage, .msi)
```

Vite läuft auf Port 1420. `npm run dev` allein öffnet nur das Frontend im
Browser — ohne Tauri-Brücke, also ohne Agent.

## Aufbau

| Ort | Aufgabe |
|---|---|
| `src-tauri/src/` | Rust: Prozess, Dateien, Schlüssel, PTY, Browser, Dokumente |
| `src/core/` | TypeScript-Kern: ACP, Zustand, Einstellungen — einzige Tauri-Schicht ist `transport.ts` |
| `src/ui/` | React-Oberfläche; spricht nur über `src/core/index.ts` mit dem Agenten |

Farben aus dem JLU Design System (semantische Tokens).
Mehr in [`docs/CONTRACT.md`](docs/CONTRACT.md) und [`docs/SEITENPANEL.md`](docs/SEITENPANEL.md);
wer neu einsteigt, beginnt mit [`docs/PROJECT_HANDOFF.md`](docs/PROJECT_HANDOFF.md)
(Absicht, Aufbau, Entscheidungen, bekannte Grenzen).

## Stand

Entwickelt und geprüft auf macOS (Apple Silicon). Linux und Windows werden als
Nächstes getestet. Sprache (Spracheingabe und -ausgabe) ist in Arbeit.

Entstanden im Praktikum am Hochschulrechenzentrum der JLU Gießen.
