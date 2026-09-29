# Konfiguration

Dieses Dokument beschreibt die Konfigurationsoptionen von jichi Desktop.

## Konfigurationsdateien

### 1. Global (`~/.jichi`)

Standard-Konfiguration für den `jichi`-Agenten:

```json
{
  "models": [
    {
      "name": "Claude",
      "provider": "anthropic",
      "model": "claude-opus-4-8",
      "apiKeyEnv": "ANTHROPIC_API_KEY",
      "inputCostPer1M": 15.0,
      "outputCostPer1M": 75.0
    }
  ],
  "maxToolIters": 25,
  "maxRetries": 4,
  "routing": {
    "fast": "qwen3-coder",
    "strong": "opus",
    "escalateOnVerify": true,
    "escalateOnError": false
  }
}
```

### 2. Local (`./local/config.json`)

Projekt-spezifische Konfiguration (git-ignored):

```json
{
  "models": [
    {
      "name": "local",
      "provider": "openai",
      "model": "local-model",
      "apiBase": "http://localhost:1234/v1"
    }
  ]
}
```

### 3. Desktop (`~/.config/de.uni-giessen.hrz.jichi-desktop/`)

Desktop-spezifische Einstellungen (im Rust-Code verwaltet).

## UI-Einstellungen

### Zugang

#### API Key

- Eingabe des API Keys für den LLM-Provider
- Wird sicher gespeichert (nicht in localStorage)
- Nach dem Löschen wird das Setup-Formular erneut angezeigt

#### Verfügbare Modelle

Zeigt die Modelle, die über den API-Key verfügbar sind (nur `jlu/…` Modelle).

### Erscheinungsbild

#### Theme

- **Hell** — Helle Farbpalette
- **Dunkel** — Dunkle Farbpalette
- **System** — Thematisch orientiert am Betriebssystem

#### Name

Benutzerdefinierter Name für die Anzeige im Chat.

### Layout

#### Komponierung

- **Freistehend** — Sidebar als eigenständige weiße Fläche
- **Klassisch** — Traditionelle Sidebar-Position

### MCP-Server

Verwaltung von Model Context Protocol Servern:

- **Hinzufügen** — Neuer MCP-Server
- **Entfernen** — Vorhandenen Server entfernen
- **Verbindung prüfen** — Connectivity testen

## jichi Konfiguration

### Models

Mehrere Modelle können konfiguriert werden:

```json
{
  "models": [
    {
      "name": "local",
      "provider": "openai",
      "model": "<model-id>",
      "apiBase": "http://localhost:1234/v1",
      "roles": ["chat", "edit"]
    },
    {
      "name": "Claude",
      "provider": "anthropic",
      "model": "claude-opus-4-8",
      "apiKeyEnv": "ANTHROPIC_API_KEY"
    }
  ]
}
```

### Model Roles

- `chat` — Chat-Antworten
- `embed` — Embeddings für Suche
- `rerank` — Reranking von Suchergebnissen
- `summarize` — Zusammenfassung
- `autocomplete` — Code-Vervollständigung

### Routing

```json
{
  "routing": {
    "fast": "qwen3-coder",
    "strong": "opus",
    "escalateOnVerify": true,
    "escalateOnError": false
  }
}
```

### Permissions

```json
{
  "permissions": {
    "allow": ["edit_file"],
    "deny": ["run_terminal_command"]
  }
}
```

### MCP Servers

```json
{
  "mcpServers": [
    {
      "name": "filesystem",
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "."
      ],
      "autoApprove": ["read", "list"]
    }
  ]
}
```

### LSP Servers

```json
{
  "lspServers": [
    {
      "name": "clangd",
      "command": "clangd",
      "extensions": ["c", "h", "cpp"]
    }
  ]
}
```

## Umgebungsvariablen

| Variable | Beschreibung |
|----------|-------------|
| `JICHI_DESKTOP_DIR` | Überschreibt das Desktop-App-Verzeichnis |
| `JICHI_CONFIG` | Pfad zur globalen jichi-Konfiguration |

## Beispiel-Konfiguration

```json
{
  "models": [
    {
      "name": "local",
      "provider": "openai",
      "model": "llama-3.1",
      "apiBase": "http://localhost:11434/v1"
    },
    {
      "name": "Claude",
      "provider": "anthropic",
      "model": "claude-3-5-sonnet",
      "apiKeyEnv": "ANTHROPIC_API_KEY"
    }
  ],
  "routing": {
    "fast": "local",
    "strong": "Claude"
  },
  "mcpServers": [
    {
      "name": "dokumente",
      "command": "jichi",
      "args": ["--mcp-dokumente"]
    }
  ],
  "lspServers": [
    {
      "name": "clangd",
      "command": "clangd",
      "extensions": ["c", "h", "cpp"]
    }
  ],
  "maxToolIters": 25,
  "maxRetries": 4
}
```
