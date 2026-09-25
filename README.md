# jichi Desktop

Eine Desktop-Oberfläche für [jichi](https://github.com/alexanderlarsdallmann/jichi),
den C89-Agenten der JLU Gießen. Sie startet ihn als eigenen Prozess und spricht
mit ihm **ACP** (Agent Client Protocol) — zeilengetrenntes JSON-RPC 2.0 über
stdin/stdout, dieselbe Schnittstelle, über die auch Editoren ihn ansteuern.

Läuft auf **Linux, macOS und Windows**. Unter Windows über WSL2, weil das
Projekt Windows nativ nicht unterstützt.

## Aufbau

```
src-tauri/src/lib.rs   Prozess: starten, Zeilen schieben, Ereignisse melden
src/core/              Protokoll, Zustand, Einstellungen — ohne DOM, ohne Framework
  protocol.ts            ACP als Typen
  jsonrpc.ts             JSON-RPC 2.0: Rahmen, Zuordnung, Antwortpflicht
  transport.ts           die einzige Stelle, die Tauri kennt
  state.ts               Ansichtsmodell und reine Übergänge
  agent.ts               der Agent als ein Objekt
  settings.ts            was gespeichert wird — und was nicht
  labels.ts              deutsche Wörter und Töne
  selftest.ts            42 Prüfungen gegen einen erfundenen Agenten
index.html, src/main.ts   Referenzansicht (wird durch das JLU Design System ersetzt)
docs/CONTRACT.md          die Naht zwischen Kern und Oberfläche
```

## Loslegen

```sh
npm install
npm run tauri dev
```

Beim ersten Start sucht die Anwendung `jichi` im PATH und in den üblichen
Verzeichnissen (`/opt/homebrew/bin`, `/usr/local/bin`, `~/.local/bin`, `~/bin`).
Wird es nicht gefunden, den vollen Pfad in den Einstellungen eintragen — er wird
gemerkt.

### API-Schlüssel

jichi liest seinen Schlüssel aus der Umgebungsvariablen, die in seiner
Konfiguration unter `apiKeyEnv` steht (bei der JLU-Konfiguration
`JICHI_API_KEY`). Eine aus dem Dock gestartete Anwendung erbt kein
Shell-Environment, also muss sie die Variable selbst setzen.

Diese Anwendung speichert **keinen Schlüssel**. In den Einstellungen wird der
*Pfad* zu der Datei hinterlegt, die ihn enthält; gelesen wird sie erst beim
Start des Agenten, von der Rust-Seite:

```sh
mkdir -p ~/.config/jichi
printf '%s' 'DEIN-SCHLUESSEL' > ~/.config/jichi/apikey.txt
chmod 600 ~/.config/jichi/apikey.txt
```

Dieser Pfad wird beim ersten Start automatisch vorgeschlagen, wenn es ihn gibt.

## Prüfen

```sh
npm run check        # Typen + 42 Prüfungen des Kerns
npm run check:rust   # 11 Prüfungen der Rust-Seite
```

Beides läuft ohne Fenster, ohne Modell und ohne installiertes jichi. Geprüft
wird am Rückgabewert, nicht an der Ausgabe.

## Lizenz

MIT.
