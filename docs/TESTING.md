# Testing

Dieses Dokument beschreibt die Test-Strategie für jichi Desktop.

## Test-Architektur

```
┌─────────────────────────────────────────────────────────────┐
│                    Testing Pyramid                          │
│                                                             │
│  E2E Tests (Vitest + React Testing Library)                │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  - UI-Komponenten                                    │  │
│  │  - State Management                                  │  │
│  │  - Integration                                       │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  Core Tests (TypeScript + Vitest)                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  - Agent Logic                                       │  │
│  │  - Transport Layer                                   │  │
│  │  - State Transitions                                 │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  Rust Tests (cargo test)                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  - Tauri Commands                                    │  │
│  │  - File IO                                           │  │
│  │  - MCP Logic                                         │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Core-Tests (TypeScript)

### Test-Verzeichnis

```
src/core/
├── selftest.ts       # Kern-Selbsttest (120+ Prüfungen)
├── agent.test.ts     # Agent-Logik
├── state.test.ts     # State Management
├── jsonrpc.test.ts   # JSON-RPC
└── transport.test.ts # Transport Layer
```

### Test-Befehl

```bash
# TypeScript-Tests
npm run check
npm run check:rust

# Nur UI-Tests
npm run test:ui
```

### Test-Beispiel

```typescript
// src/core/selftest.ts
export function frisch(): void {
  const fresh = new Agent(new TestTransport())
  fresh.setup('test-key')
  equal(fresh.getSnapshot().apiKeySet, true)
}

export function neuling(): void {
  const fresh = new Agent(new TestTransport())
  equal(fresh.getSnapshot().apiKeySet, false)
}
```

## UI-Tests (React)

### Test-Verzeichnis

```
src/ui/
├── Eingabe.test.tsx      # Eingabekomponente
├── Sprungleiste.test.tsx # Sprungleiste
├── Markdown.test.tsx     # Markdown-Rendering
└── panel/
    └── store.test.ts     # Panel-Store
```

### Test-Verwendung

```bash
npm run test:ui
```

### Test-Beispiel

```typescript
// src/ui/Eingabe.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { Eingabe } from './Eingabe'

test('sendet Nachricht beim Drücken von Enter', () => {
  const onSubmit = vi.fn()
  render(<Eingabe onSubmit={onSubmit} canSend={true} />)

  const input = screen.getByPlaceholderText('Nachricht...')
  fireEvent.change(input, { target: { value: 'Test' } })
  fireEvent.keyDown(input, { key: 'Enter' })

  expect(onSubmit).toHaveBeenCalledWith('Test')
})
```

## Rust-Tests

### Test-Verzeichnis

```
src-tauri/src/
├── artefakt.rs      # Artefakt-Tests
├── browser.rs       # Browser-Tests
├── chats.rs         # Chat-Tests
├── documents.rs     # Dokumenten-Tests
├── gateway.rs       # Gateway-Tests
├── git.rs           # Git-Tests
├── konfig.rs        # Konfiguration-Tests
├── mcp_dokumente.rs # MCP Dokumenten-Tests
├── projekt.rs       # Projekt-Tests
├── pty.rs           # PTY-Tests
├── speech.rs        # Speech-Tests
├── terminal.rs      # Terminal-Tests
└── lib.rs           # Integrationstests
```

### Test-Befehl

```bash
# Rust-Tests
npm run check:rust

# Oder direkt
cargo test --manifest-path src-tauri/Cargo.toml
```

### Test-Beispiel

```rust
// src-tauri/src/chats.rs
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chat_meta_serialization() {
        let meta = Meta {
            id: "test-id".to_string(),
            title: "Test Chat".to_string(),
            pinned: false,
            modified_ms: 1234567890,
            message_count: 5,
            workspace: "/test/path".to_string(),
        };

        let json = serde_json::to_string(&meta).unwrap();
        let deserialized: Meta = serde_json::from_str(&json).unwrap();

        assert_eq!(meta.id, deserialized.id);
        assert_eq!(meta.title, deserialized.title);
    }
}
```

## E2E-Tests

### Tooling

- **Vitest** — Test-Runner
- **React Testing Library** — React-Komponenten-Tests
- **Tauri Test Helpers** — Integrationstests

### E2E-Verzeichnis

```
tests/
└── e2e/
    ├── setup.test.ts
    ├── chat.test.ts
    ├── files.test.ts
    └── settings.test.ts
```

### E2E-Beispiel

```typescript
// tests/e2e/chat.test.ts
import { test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

test('zeigt Chat-Historie an', async () => {
  render(<App />)
  
  // Simuliere User-Input
  const input = screen.getByPlaceholderText('Nachricht...')
  fireEvent.change(input, { target: { value: 'Hello' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  
  // Prüfe, ob Antwort angezeigt wird
  expect(screen.getByText(/Hello/)).toBeInTheDocument()
})
```

## Test-Strategie

### Unit-Tests (70%)

- Kleinstmögliche Einheiten testen
- Schnell (< 100ms pro Test)
- Mocked Dependencies

### Integration-Tests (20%)

- Komponenten-Interaktionen
- State-Transitions
- API-Integration

### E2E-Tests (10%)

- Gesamte Benutzer-Flüsse
- Langsam (> 1s pro Test)
- Reale Daten

## CI-Tests

### Lokales Testen

```bash
# TypeScript + Core + UI Tests
npm run check

# Rust-Tests
npm run check:rust

# Alles zusammen
npm run check && npm run check:rust
```

### CI-Status

- **Branch Protection**: Main branch erfordert successful checks
- **PR-Checks**: Alle Tests müssen grün sein
- **Code Coverage**: Mindestens 80% (kann variiert werden)

## Test-Tools

### TypeScript/React

```bash
# Typ-Check
npx tsc --noEmit

# Tests
npx vitest run

# Coverage
npx vitest run --coverage
```

### Rust

```bash
# Tests
cargo test --manifest-path src-tauri/Cargo.toml

# Clippy
cargo clippy --manifest-path src-tauri/Cargo.toml

# Format
cargo fmt --manifest-path src-tauri/Cargo.toml
```

## Troubleshooting

### Tests schlagen fehl

```bash
# Cache leeren
rm -rf node_modules/.vite
npm run check

# Rust-Tests mit neuem Build
cargo clean
cargo test --manifest-path src-tauri/Cargo.toml
```

### Tests hängen

```bash
# Timeout erhöhen
VITEST_TEST_TIMEOUT=30000 npm run check

# Rust-Tests mit Timeout
RUST_BACKTRACE=1 cargo test --manifest-path src-tauri/Cargo.toml
```

### Coverage报告

```bash
# Coverage report erzeugen
npx vitest run --coverage

# Report öffnen
open coverage/index.html
```
