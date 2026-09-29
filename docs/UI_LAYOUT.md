# UI Layout

Dieses Dokument beschreibt das Layout des jichi Desktop Interfaces.

## Overview

jichi Desktop verwendet zwei Layout-Varianten, die in den Einstellungen gewählt werden können:

### 1. Freistehend (Floating)

```
┌─────────────────────────────────────────────────────────────┐
│  [macOS Window Controls]                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  │   ┌──────────┐    ┌─────────────────────────────┐   │   │
│  │   │          │    │                             │   │   │
│  │   │ Sidebar  │    │        Main Area            │   │   │
│  │   │ (white)  │    │    (light gray background)  │   │   │
│  │   │          │    │                             │   │   │
│  │   └──────────┘    └─────────────────────────────┘   │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Charakteristika**:
- Sidebar als separate weiße Fläche
- Hauptbereich leicht grau
- Weicher Kontrast zwischen den Bereichen
- Keine sichtbare Trennlinie

### 2. Klassisch (Classic)

```
┌─────────────────────────────────────────────────────────────┐
│  [macOS Window Controls]                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ┌──────────┐  ┌───────────────────────────────────┐   │
│  │ │          │  │                                   │   │
│  │ │ Sidebar  │  │      Main Area                    │   │
│  │ │ (left)   │  │  (full background)                │   │
│  │ │          │  │                                   │   │
│  │ └──────────┘  └───────────────────────────────────┘   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Charakteristika**:
- Sidebar auf der linken Seite
- Traditionelle Desktop-App-Struktur
- Hauptbereich füllt den Rest aus

## Bereiche des Hauptfensters

### 1. Sidebar (Links)

**Elemente**:
- Projekt-Dateien
- Chat-Liste
- Einstellungen
- Suche

**Features**:
- Chat-Verwaltung (neu, öffnen, löschen, umbenennen)
- Dateibrowsing
- Einstellungen-Zugriff

### 2. Hauptbereich (Mitte/Rechts)

**Elemente**:
- Chat-Verlauf
- Eingabefeld
- Werkzeug- Aufrufe
- Diagnose-Anzeige

**Features**:
- Markdown-Rendering
- Code-Syntax-Highlighting
- Diff-Vorschau für Edits
- Werkzeug-Permission-Dialoge

### 3. Seitenleiste (Rechts - Optional)

**Tab-Panel**:
- Dateien
- Datei-Ansicht (Code, Markdown, PDF, Word, Excel)
- Änderungen (Git Diff)
- Terminal
- Browser
- Artefakte (HTML, SVG, Mermaid)

**Shortcuts**:
- `⌘⇧E` — Dateien
- `⌘⇧D` — Änderungen
- `Ctrl+\`` — Terminal
- `⌘⇧B` — Browser

## Komponenten

### Chat-Zeile

```
┌─────────────────────────────────────────────────────────────┐
│ [model] [mode]                                              │
│                                                             │
│ User:                                                       │
│ …                                                           │
│                                                             │
│ Assistant:                                                  │
│ … (Markdown)                                                │
│                                                             │
│ ┌─────────────────────────────────────────────────────┐    │
│ │ Tool: read_file                                     │    │
│ │ Allow? [y]es  [n]o  [a]lways  [v]iew               │    │
│ └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Werkzeug-Anfrage

```
┌─────────────────────────────────────────────────────────────┐
│ ▸ write_file  notes.txt                                     │
│                                                             │
│ @@ -1,3 +1,3 @@                                            │
│  # Notes                                                    │
│ -TODO: write this                                          │
│ +Done.                                                     │
│                                                             │
│ Allow? [y]es  [n]o  [a]lways  [v]iew                       │
└─────────────────────────────────────────────────────────────┘
```

### Sprungleiste

```
┌─────────────────────────────────────────────────────────────┐
│  ┌───────────────────────────────────────────────────────┐  │
│  │  •  •  •  •  •  •  •  •  •  •  •  •  •  •  •  •      │  │
│  │  ↑  ↑  ↑  ↑  ↑  ↑  ↑  ↑  ↑  ↑  ↑  ↑  ↑  ↑  ↑  ↑      │  │
│  │  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |      │  │
│  └───────────────────────────────────────────────────────┘  │
│  Question 1  Question 2  Question 3  ...                   │
└─────────────────────────────────────────────────────────────┘
```

## Responsiveness

- **Minimalbreite**: ~800px (Sidebar braucht Platz)
- **Empfohlene Größe**: 1280x800 px oder größer
- **Maximale Breite**: Kein Limit, Sidebar wächst mit

## Theme-Unterstützung

### Helles Theme

- Helle Hintergründe
- Dunkle Schrift
- Kontrastreiche Akzente

### Dunkles Theme

- Dunkle Hintergründe
- Helle Schrift
- Sanfte Akzente

### System

- Orientiert am Betriebssystem
- Automatischer Wechsel bei Theme-Änderung

## Accessibility

- Kontrastverhältnisse WCAG AA
- Tastatur-Navigation
- Screenreader-Kompatibilität
- Zoom-fest
