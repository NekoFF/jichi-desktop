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

Was auf den einzelnen Plattformen auffiel (2026-09-26):

- **Node der Linux-Distribution reicht nicht.** `npm run check` startet
  `node src/core/selftest.ts`; das Node-Paket von Ubuntu 26.04 (22.22) ist ohne
  eingebautes TypeScript-Entfernen gebaut. Node 24 von nodejs.org nehmen.
- **Windows: `npm install` scheitert am Design System.** Dessen `build`-Skript ruft
  `cp` auf, das `cmd.exe` nicht kennt. Bis das dort behoben ist:
  `npm ci --script-shell "C:\Program Files\Git\bin\bash.exe"`.
- **Windows: Smart App Control** blockiert unsignierte, frisch gebaute Programme —
  schon die Build-Skripte von Rust (`os error 4551`) und ebenso die fertige
  Anwendung. Zum Bauen muss es aus sein; für eine Verteilung braucht die
  Anwendung eine Code-Signatur.
- **Windows: jichi läuft in WSL.** Die Anwendung startet `wsl.exe jichi --acp`;
  jichi wird dafür in der Standard-Distribution gebaut und nach `/usr/local/bin`
  gelegt (`make WERROR=1` baut unter Ubuntu ohne Änderung).

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
Mehr in [`CONTRACT.md`](CONTRACT.md) und [`SEITENPANEL.md`](SEITENPANEL.md);
wer neu einsteigt, beginnt mit [`PROJECT_HANDOFF.md`](PROJECT_HANDOFF.md)
(Absicht, Aufbau, Entscheidungen, bekannte Grenzen).

## Stand

Läuft unter macOS, Linux und Windows (dort mit jichi in WSL): benutzt unter
macOS, gebaut und geprüft unter Windows 11 und Ubuntu 26.04 (WSL2). Was genau
gemessen ist und was nicht — und warum Tauri: [`ANFORDERUNGEN.md`](ANFORDERUNGEN.md)
und [`ENTSCHEIDUNGEN.md`](ENTSCHEIDUNGEN.md).

Entstanden im Praktikum am Hochschulrechenzentrum der JLU Gießen.
