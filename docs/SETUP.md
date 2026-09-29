# Setup und Installation

Dieses Dokument beschreibt, wie die Entwicklungsumgebung für jichi Desktop eingerichtet wird.

## Voraussetzungen

- **Node.js**: Version 24 oder höher
- **npm**: Kommt mit Node.js
- **Rust**: Stable Channel (für Tauri)
- **Tauri CLI**: `npm install -g @tauri-apps/cli`
- **Git**: Für Versionsverwaltung

## Installation

```bash
# Repository klonen
git clone git@gitlab.hrz.uni-giessen.de:ki-hrz/jichi-desktop.git
cd jichi-desktop

# Abhängigkeiten installieren
npm install

# Rust-Abhängigkeiten prüfen
cargo check --manifest-path src-tauri/Cargo.toml

# Dev-Server starten
npm run tauri dev
```

## First-Run Setup

Beim ersten Start muss der `jichi`-Binary gesucht oder ausgewählt werden:

1. Anwendung starten
2. Suchpfad prüfen oder Binary manuell auswählen
3. API-Key eingeben (wird sicher gespeichert)
4. `jichi doctor` ausführen, um die Konfiguration zu prüfen

## Entwicklung

```bash
# Development Build mit Hot-Reload
npm run dev

# Full Tauri Dev
npm run tauri dev

# Type-Check und Tests
npm run check

# Rust-Tests
npm run check:rust

# Build für Produktionsdeployment
npm run build
npm run tauri build
```

## Troubleshooting

### Node-Module nicht gefunden

```bash
rm -rf node_modules package-lock.json
npm install
```

### Rust-Build-Probleme

```bash
cd src-tauri
cargo clean
cargo build
```

### Tauri-Dev-Server startet nicht

Prüfe, ob Port 1420 frei ist:

```bash
lsof -i :1420  # macOS/Linux
netstat -ano | findstr :1420  # Windows
```
