# Architektur

Dieses Dokument beschreibt die Architektur von jichi Desktop.

## Überblick

jichi Desktop ist eine Desktop-Anwendung, die den KI-Agenten `jichi` als Backend nutzt.

```
┌─────────────────────────────────────────────────────────────┐
│                    Tauri Window (UI)                        │
│  ┌──────────────┐  ┌────────────────────────────────────┐   │
│  │  React UI    │  │  Rust Backend (src-tauri/src/)     │   │
│  │  (src/ui/)   │  │  - Prozess-Management              │   │
│  │              │  │  - Datei-IO                        │   │
│  │  Components  │  │  - Secrets (API Keys)              │   │
│  │              │  │  - PTY/Terminal                    │   │
│  │  State Mgmt  │  │  - Browser (webview)               │   │
│  └──────┬───────┘  └────────────────┬───────────────────┘   │
│         │                           │                        │
│         └───────────────┬───────────┘                        │
│                         │ ACP (JSON-RPC 2.0)                 │
│                         ▼                                    │
│                  ┌──────────────┐                            │
│                  │   jichi      │                            │
│                  │  (CLI Agent) │                            │
│                  └──────────────┘                            │
└─────────────────────────────────────────────────────────────┘
```

## Schichten-Architektur

### 1. UI Layer (`src/ui/`)

React-Komponenten, die die Benutzeroberfläche darstellen.

**Verantwortlichkeiten**:
- Anzeige von Chats, Werkzeugen, Diagnose
- Formulare für Eingabe und Konfiguration
- Navigation und Layout

**Technologien**:
- React 19
- TypeScript
- Tailwind CSS
- JLU Design System

### 2. Core Layer (`src/core/`)

TypeScript-Kern, der die Kommunikation mit dem Backend regelt.

**Verantwortlichkeiten**:
- ACP-Protokoll (JSON-RPC 2.0)
- State Management
- Einstellungen
- Transportschicht

**Dateien**:
- `agent.ts` — Agent-Lebenszyklus, Sitzungen
- `transport.ts` — Tauri-Bridge (einziger Tauri-Import im TS)
- `state.ts` — State-Typen und -Logik
- `protocol.ts` — ACP-Typen
- `jsonrpc.ts` — JSON-RPC-Helper
- `preferences.ts` — UI-Einstellungen
- `settings.ts` — Agent-Einstellungen

### 3. Tauri Layer (`src-tauri/src/`)

Rust-Code für System-Integration.

**Verantwortlichkeiten**:
- Prozess-Management (`jichi --acp`)
- Datei-IO (Sitzungen, Chats)
- Secrets-Verwaltung (API Keys)
- PTY/Terminal
- Browser (webview)
- Dokumente (MCP-Server für PDF/Word/Excel)

**Dateien**:
- `lib.rs` — Hauptmodul, Exports
- `main.rs` — Tauri-Entry-Point
- `chats.rs` — Chat-Verwaltung
- `konfig.rs` — MCP-Server Konfiguration
- `terminal.rs` — Terminal-Emulation
- `browser.rs` — Webview-Steuerung
- `documents.rs` — Dokumenten-Verarbeitung
- `mcp_dokumente.rs` — MCP Dokumenten-Server

### 4. Backend Layer (`jichi` binary)

Der `jichi`-Agent als Kindprozess.

**Kommunikation**: ACP (Agent Client Protocol) über stdin/stdout

**Protokoll**: JSON-RPC 2.0 (ein JSON-Objekt pro Zeile)

## Datenfluss

### 1. UI -> Core -> Tauri -> Backend

```
User Interaction
    ↓
React Component (src/ui/)
    ↓
Core API (src/core/index.ts)
    ↓
Transport (src/core/transport.ts → invoke/listen)
    ↓
Rust (src-tauri/src/lib.rs)
    ↓
jichi --acp (stdin/stdout)
```

### 2. Backend -> Tauri -> Core -> UI

```
jichi --acp (stdout)
    ↓
Rust (src-tauri/src/lib.rs → listen)
    ↓
Transport (src/core/transport.ts)
    ↓
Core State (src/core/state.ts)
    ↓
React Components (src/ui/)
```

## State Management

### State-Typen (`src/core/state.ts`)

```typescript
interface Snapshot {
  messages: Message[]
  tools: ToolCall[]
  diagnostics: Diagnostic[]
  canSend: boolean
  canCancel: boolean
  needsSetup: boolean
  // ...
}
```

### State-Verwaltung

- `getSnapshot()` — Liest aktuellen State
- `subscribe(listener)` — Subscribt auf State-Änderungen
- `useAgent()` — React-Hook für State-Zugriff

## Kommunikation (ACP)

### JSON-RPC 2.0 über stdin/stdout

**Format**: Ein JSON-Objekt pro Zeile, Newline-terminated

```json
{
  "jsonrpc": "2.0",
  "method": "session/new",
  "params": {
    "cwd": "/path/to/project",
    "apiKey": "..."
  }
}
```

**Methoden**:
- `session/new` — Neue Sitzung starten
- `session/prompt` — Prompt senden
- `session/cancel` — Laufende Operation abbrechen
- `acp_start` — ACP-Server starten
- `doctor` — Diagnose ausführen
- `probe` — Connectivity prüfen

## Layout-Strategie

### Freistehend (floating)

- Linke Sidebar: Weiße Fläche, abgesetzte Oberfläche
- Rechte Hauptfläche: Leicht grau, leichter Kontrast

### Klassisch

- Traditionelle Sidebar auf der linken Seite
- Hauptinhalt daneben

**Beide Varianten** unterstützen dieselben Features und sind per Konfiguration wählbar.

## Sicherheit

### Secrets-Verwaltung

API Keys werden **nicht** in localStorage, Logs oder State gespeichert.

**Speicherort** (macOS):
```
~/Library/Application Support/de.uni-giessen.hrz.jichi-desktop/secrets/
```

**Permissions**: `0600` (owner-only read/write)

## Erweiterbarkeit

### User-Defined Tools

In `config.json`:

```json
{
  "tools": [
    {
      "name": "my-tool",
      "description": "Ein benutzerdefiniertes Tool",
      "schema": { ... },
      "shell": "echo $JICHI_ARG_TEXT"
    }
  ]
}
```

### MCP Servers

```json
{
  "mcpServers": [
    {
      "name": "filesystem",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    }
  ]
}
```
