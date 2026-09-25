# Arbeitsteilung in diesem Projekt

An diesem Projekt arbeiten zwei Beteiligte gleichzeitig. Die Grenze ist scharf
und gilt in beide Richtungen.

## Wem was gehört

| Bereich | Eigentümer | Regel |
| --- | --- | --- |
| `src-tauri/**` | **Kern** | für die Oberfläche gesperrt |
| `src/core/**` | **Kern** | für die Oberfläche gesperrt |
| `docs/CONTRACT.md` | **Kern** | beschreibt die Naht; nur der Kern ändert sie |
| `index.html` | Oberfläche | ersetzen |
| `src/main.ts` | Oberfläche | ersetzen (heute die Referenzansicht) |
| `src/styles.css` | Oberfläche | ersetzen |
| `src/components/**`, `src/ui/**` | Oberfläche | neu |
| `package.json`, `tsconfig.json`, `vite.config.ts` | Oberfläche | ab jetzt; der Kern fasst sie nicht mehr an |
| `README.md` | Kern | |

**Fehlt der Oberfläche etwas aus dem Kern, wird es im Kern ergänzt und in
`docs/CONTRACT.md` eingetragen — nicht daran vorbeigearbeitet.**

## Regeln für die Oberfläche

1. `import { agent } from "./core/index.ts"` ist der einzige Zugang. Kein
   `invoke`, kein `listen`, kein `@tauri-apps/api` in einer Komponente.
2. Keine festen Farben. Nur semantische Token des JLU Design System
   (`bg-surface`, `text-on-surface`, `border-outline-variant`, …), nie
   `bg-blue-500` und nie `style={{ color: "#123456" }}`.
3. Keine eigenen Grundbausteine. Erst im Design System suchen (`Button`,
   `Card`, `Dialog`, `Badge`, `Tooltip`, `PromptInput`, Layouts).
4. Der API-Schlüssel wird nie entgegengenommen und nie gespeichert — die
   Einstellungen kennen nur den **Pfad** zu seiner Datei.

## Vor jeder Übergabe

```sh
npm run check        # Typen + 42 Prüfungen des Kerns
npm run check:rust   # 11 Prüfungen der Rust-Seite
```

Beide müssen grün sein. Sie laufen ohne Fenster, ohne Modell und ohne
installiertes jichi. Geprüft wird am **Rückgabewert**, nicht an der Ausgabe.

Bleibt `npm run check` rot, wurde der Kern angefasst. Dann zurücknehmen.

## Zweige

- `main` — Kern. Lauffähig, mit der Referenzansicht.
- `design/jlu` — Oberfläche. Eigener Arbeitsbaum, siehe `docs/AUFTRAG_OBERFLAECHE.md`.

Nie im fremden Arbeitsbaum arbeiten und nie den fremden Zweig auschecken.
