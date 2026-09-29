# Contributing

Dieses Dokument beschreibt, wie man zu jichi Desktop beitragen kann.

## Willkommen!

Wir freuen uns, dass du zu jichi Desktop beitragen möchtest! Diese Anleitung hilft dir beim Einstieg.

## Code of Conduct

Bitte halte dich an unseren [Code of Conduct](CODE_OF_CONDUCT.md) — wir sind ein freundliches, einladendes Team.

## Wie du beitragen kannst

### 1. Issues finden

Suche nach offenen Issues:

- **bugs** — Fehler, die behoben werden müssen
- **enhancement** — neue Features
- **documentation** — Dokumentations-Verbesserungen
- **good first issue** — Einstiegs-Issues für Neue

### 2. Issues melden

Wenn du einen Bug findest:

1. **Prüfe**, ob der Bug schon gemeldet wurde
2. **Erstelle** ein neues Issue mit:
   - Klarem Titel
   - Schritt-für-Schritt-Reproduktion
   - Erwartetes vs. tatsächlich Verhalten
   - Umgebungsinformationen (OS, Node-Version, etc.)
   - Screenshots (wenn relevant)

### 3. Pull Requests

#### Vor dem PR

1. **Issue öffnen** — Beschreibe, was du ändern willst
2. **Forken** — Repo forken (auf GitLab)
3. **Branch erstellen** — `feature/your-feature` oder `fix/issue-123`

#### PR-Workflow

```bash
# 1. Branch erstellen
git checkout -b feature/my-feature

# 2. Änderungen vornehmen
# ... edit files ...

# 3. Tests laufen lassen
npm run check
npm run check:rust

# 4. Committen (conventional commits)
git add .
git commit -m "feat: add new feature"
# oder
git commit -m "fix: resolve issue #123"

# 5. Pushen
git push origin feature/my-feature
```

#### PR-Beschreibung

Benutze das PR-Template:

```markdown
## Describe your changes

**Problem:** Was war das Problem?

**Lösung:** Was hast du geändert?

**Test:** Wie hast du getestet?

**Screenshots:** (optional) Vorher/Nachher
```

### 4. Code-Style

#### TypeScript/React

```typescript
// ✅ Gut
const Button = ({ onClick, children }: ButtonProps) => {
  return <button onClick={onClick}>{children}</button>
}

// ❌ Schlecht
const Button = (props) => {
  return <button onClick={props.onClick}>{props.children}</button>
}
```

#### Rust

```rust
// ✅ Gut
fn add(a: i32, b: i32) -> i32 {
    a + b
}

// ❌ Schlecht
fn add(a:i32,b:i32)->i32{a+b}
```

### 5. Test-Strategie

Alle PRs müssen folgende Tests bestehen:

```bash
# TypeScript/React
npm run check

# Rust
npm run check:rust
```

### 6. Dokumentation

Jede neue Funktion sollte dokumentiert sein:

- **Code-Comments** — Wichtige Logik erklären
- **API-Dokumentation** — Neue Exports dokumentieren
- **User-Dokumentation** — Neue Features in docs/ beschreiben

## Development Setup

### Voraussetzungen

- Node.js 24+
- Rust (stable)
- npm
- Git

### Setup

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

### Development Workflow

```bash
# Dev-Server (Hot-Reload)
npm run tauri dev

# Type-Check
npx tsc --noEmit

# Tests
npm run check
npm run check:rust

# Build
npm run build
npm run tauri build
```

## Review-Prozess

### Review-Criteria

- **Funktionalität** — Funktioniert wie erwartet?
- **Code-Qualität** — Sauberer, lesbarer Code?
- **Tests** — Ausreichende Testabdeckung?
- **Dokumentation** — Ist alles dokumentiert?
- **Performance** — Keine Performance-Probleme?

### Review-Feedback

- **Positive Feedback** — Was gut ist
- **Verbesserungsvorschläge** — Konkrete Änderungsvorschläge
- **Rückfragen** — Klärung von Unklarheiten

### Merge-Ready

Ein PR ist merge-ready wenn:

- [ ] Alle Tests bestehen
- [ ] Code-Review abgeschlossen
- [ ] Dokumentation aktualisiert
- [ ] keine merge conflicts
- [ ] conventional commit message

## Release-Process

### Versionen

jichi Desktop folgt [Semantic Versioning](https://semver.org/):

- `MAJOR` — Breaking changes
- `MINOR` — Neue Features (backward compatible)
- `PATCH` — Bug fixes (backward compatible)

### Release-Workflow

1. **Version update** — `package.json` und `CHANGELOG.md` updaten
2. **Tag erstellen** — `git tag v1.2.3`
3. **Pushen** — `git push && git push --tags`
4. **Release** — GitLab Release erstellen

## Fragen?

- **Discussions** — Offene Fragen im Discussions-Tab
- **Issues** — Bugs und Features
- **Email** — [team@hrz.uni-giessen.de](mailto:team@hrz.uni-giessen.de)

## Danke!

Danke für deinen Beitrag! 🙏
