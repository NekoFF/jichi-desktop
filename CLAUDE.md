# Arbeitsteilung in diesem Projekt

An diesem Projekt arbeiten zwei Beteiligte gleichzeitig. Die Grenze ist scharf
und gilt in beide Richtungen.

## Wem was gehört

| Bereich | Eigentümer | Regel |
| --- | --- | --- |
| `src-tauri/**` | **Kern** | für die Oberfläche gesperrt |
| `src/core/**` | **Kern** | für die Oberfläche gesperrt |
| `docs/CONTRACT.md` | **Kern** | beschreibt die Naht; nur der Kern ändert sie |
| `index.html`, `src/main.tsx`, `src/styles.css` | **Kern** | seit der Übernahme der Gestaltung |
| `README.md` | Kern | |

Die Arbeitsteilung von vorher ist aufgehoben: Kern **und** Oberfläche liegen
wieder in einer Hand, auf `main`. Der Zweig `design/jlu` ist zusammengeführt.

**Fehlt der Oberfläche etwas aus dem Kern, wird es im Kern ergänzt und in
`docs/CONTRACT.md` eingetragen — nicht daran vorbeigearbeitet.**

## Regeln für die Oberfläche

1. `import { agent } from "./core/index.ts"` ist der einzige Zugang. Kein
   `invoke`, kein `listen`, kein `@tauri-apps/api` in einer Komponente.
2. Keine festen Farben. Nur die semantischen Token des JLU Design System
   (`--color-surface`, `--color-on-surface`, `--color-outline-variant`, …),
   nie ein `#123456` im Regelwerk.
3. **Maße kommen nicht aus dem Design System.** Dessen Komponenten folgen
   Material 3 und sind für den Finger gerastert (Zeilen um 48 px); auf dem
   Schreibtisch wirkt das wie eine Fernsehoberfläche. Diese Anwendung baut ihr
   Gerüst deshalb selbst und hält die Dichte eines Fensterprogramms: Zeilen
   30 px, Bedienschrift 13 px, Text 14 px. Alle Maße stehen in `:root` von
   `src/styles.css` — dort ändern, nirgends sonst.
4. Kein Regelwerk, das sich an die innere Struktur einer fremden Komponente
   klammert (`> div[id] > div:first-child`). Das hält bis zu deren nächster
   Fassung.
5. Der API-Schlüssel geht ausschliesslich durch `agent.setup(key)` und
   verschwindet damit in der geschützten Ablage. Kein zweites Eingabefeld,
   keine Anzeige, keine Kopie.

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
