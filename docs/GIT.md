# Git-Repository

Dieses Dokument beschreibt die git-Repository-Konfiguration und die `.gitignore`-Regeln für das jichi Desktop Projekt.

## Repository-Setup

Das Projekt nutzt ein git-Repository für Versionsverwaltung und Zusammenarbeit.

### Remote

Das Remote-Repository befindet sich auf dem GitLab des Hochschulrechenzentrums der JLU Gießen:

```
git@gitlab.hrz.uni-giessen.de:ki-hrz/jichi-desktop.git
```

### Branch-Struktur

- `main` — Hauptentwicklungszweig (aktive Entwicklung)
- `design/jlu` — Veraltet (einst für Design-Worktree, in main integriert)

## `.gitignore`

Die `.gitignore`-Datei definiert, welche Dateien und Verzeichnisse nicht im Repository versioniert werden sollen.

### Logik und Struktur

Die `.gitignore` ist nach Kategorien organisiert:

#### 1. Logs und Debug-Ausgaben

```
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
lerna-debug.log*
.pnpm-debug.log*
```

Protokolldateien von Build-Tools und Paketmanagern werden ausgeschlossen, da sie:
- Projekt-spezifisch sind
- Häufig aktualisiert werden
- Lokale Pfade enthalten können

#### 2. Abhängigkeiten

```
node_modules/
.jichi/
.pnp
.pnp.js
```

- `node_modules/` — Alle npm-Pakete (kann mit `npm install` reinstalliert werden)
- `.jichi/` — Projekt-spezifischer Cache des jichi Desktop Clients
- `.pnp*` — Plug'n'Play-Dateien von Yarn (optional)

#### 3. Build-Ausgaben

```
dist/
dist-ssr/
*.local
.cache/
```

- `dist/` — Vite-Build-Ausgabe
- `dist-ssr/` — Server-side Rendering (falls benötigt)
- `.cache/` — Zwischenspeicher für schnelle Builds

#### 4. Editor- und IDE-Dateien

```
.vscode/
.idea/
*.swp
*.swo
*~
```

- `.vscode/` — VS Code Konfigurationen (ausgenommen `extensions.json` für empfohlene Extensions)
- `.idea/` — JetBrains IDEs (WebStorm, IntelliJ)
- `*.swp`, `*.swo`, `*~` — Vim- und Emacs-Swap-Dateien

#### 5. Betriebssystem-Dateien

```
.DS_Store
Thumbs.db
.AppleDouble
.LSOverride
._*
*~
.directory
.Trash-*
```

Platform-spezifische Metadaten-Dateien von macOS, Windows und Linux.

#### 6. Umgebungsvariablen

```
.env
.env.local
.env.production
.env.development
```

Dateien mit sensiblen Konfigurationswerten (API Keys, Endpunkte) — **niemals ins Repository committen!**

#### 7. Tauri (Rust-Frontend-Bridge)

```
src-tauri/target/
src-tauri/*.rs.bk
src-tauri/*.pdb
src-tauri/*.dll
src-tauri/*.exe
src-tauri/*.so
src-tauri/*.dylib
src-tauri/*.a
src-tauri/*.lib
src-tauri/*.pdb
src-tauri/*.ilk
src-tauri/*.manifest
src-tauri/*.exp
src-tauri/*.bin
src-tauri/debug/
src-tauri/release/
src-tauri/build/
```

Rust-Build-Ausgaben, die mit `cargo build` neu erzeugt werden können.

#### 8. Rust-Generisch

```
**/target/
**/*.o
**/*.pdb
...
```

Plattformunabhängige Rust-Build-Ausgaben (doppelt für Sicherheit).

#### 9. Test-Coverage

```
coverage/
.nyc_output/
.coverage
```

Testergebnisse und Coverage-Berichte.

#### 10. TypeScript

```
*.tsbuildinfo
tsconfig.tsbuildinfo
```

TypeScript Build-Cache-Dateien.

#### 11. Lock-Files

```
package-lock.json
yarn.lock
pnpm-lock.yaml
bun.lockb
```

Die `.gitignore` listet alle gängigen Lock-Files auf — nur **eins** sollte versioniert werden (je nach verwendetem Package Manager).

#### 12. Debug- und Test-Dateien

```
.vscode-test/
.webview/
tmp/
temp/
*.tmp
```

Temporäre Dateien für Tests und Debugging.

#### 13. Sicherheit — Secrets

```
.secrets/
.secrets.*
secret*
apikey.txt
api-key.txt
```

**WICHTIG**: Diese Dateien enthalten sensible Informationen und werden **ausdrücklich** ausgeschlossen.

**Hinweis**: Der jichi Desktop Client speichert API Keys in einem eigenen geschützten Verzeichnis unter `~/Library/Application Support/de.uni-giessen.hrz.jichi-desktop/secrets/` (macOS) oder gleichwertig unter Linux/Windows — **nicht im git-Repository!**

#### 14. Projektspezifisch

```
.local/
jichi-*.patch
jichi-macos-*
```

- `.local/` — Lokale Konfiguration
- `jichi-*.patch` — Patch-Dateien für den upstream jichi Agent
- `jichi-macos-*` — macOS-spezifische Berichte und Fixes

## Verwendung

### Neue Dateien hinzufügen

```bash
# Alle Änderungen anzeigen
git status

# Alle Dateien hinzufügen (außer ignorierte)
git add .

# Spezifische Datei hinzufügen
git add src/main.tsx

# Änderungen commiten
git commit -m " Beschreibung der Änderung"
```

### Ignorierte Dateien überschreiben

Manchmal ist es sinnvoll, eine ignorierte Datei zu versionieren:

```bash
git add -f .env.example  # Erzwinge Hinzufügen
```

### `.gitignore` anpassen

Änderungen an `.gitignore` selbst **müssen** versioniert werden:

```bash
git add .gitignore
git commit -m "chore: update .gitignore für [Grund]"
```

## Best Practices

1. **Nie Secrets committen** — API Keys, Tokens, Passwörter gehören **niemals** ins Repository
2. **Lock-Files committen** — aber nur das des verwendeten Package Managers (`package-lock.json` **oder** `yarn.lock` **oder** `pnpm-lock.yaml`)
3. **`.gitignore` als Dokumentation** — jede Kategorie sollte einen Kommentar haben, warum etwas ignoriert wird
4. **Plattform-spezifisch** — macOS, Windows und Linux sind alle abgedeckt
5. **Projektspezifisch** — jichi Desktop-spezifische Pfade und Muster sind enthalten

## Related Documentation

- [`PROJECT_HANDOFF.md`](PROJECT_HANDOFF.md) — Projektkontext und Architektur
- [`CONTRACT.md`](CONTRACT.md) — Interface-Vertrag zwischen UI und Core
- [`SEITENPANEL.md`](SEITENPANEL.md) — Dokumentation der Seitenleiste
- [`AUFTRAG_OBERFLAECHE.md`](AUFTRAG_OBERFLAECHE.md) — UI-Auftragsdokumentation (historisch)
