# Themen und Design-System

Dieses Dokument beschreibt das Themen- und Design-System von jichi Desktop.

## JLU Design System

jichi Desktop nutzt das **JLU Design System** (`@ki4jlu/design-system`) als Basis für Farben und Komponenten.

### Integration

```bash
npm install @ki4jlu/design-system
```

**Version**: `0.43.0` (GitHub Packages)

### Verwendung in CSS

```css
/* Semantic Color Tokens */
--color-bg-default: var(--jlu-bg-default);
--color-bg-emphasis: var(--jlu-bg-emphasis);
--color-bg-subtle: var(--jlu-bg-subtle);

--color-text-default: var(--jlu-text-default);
--color-text-emphasis: var(--jlu-text-emphasis);
--color-text-subtle: var(--jlu-text-subtle);

--color-accent: var(--jlu-accent);
--color-accent-hover: var(--jlu-accent-hover);
--color-accent-active: var(--jlu-accent-active);

--color-success: var(--jlu-success);
--color-warning: var(--jlu-warning);
--color-error: var(--jlu-error);
```

### Farbpalette

#### Grundfarben

| Token | Beschreibung | Wert (Light) | Wert (Dark) |
|-------|-------------|--------------|-------------|
| `--jlu-bg-default` | Standard-Hintergrund | `#ffffff` | `#1a1a1a` |
| `--jlu-bg-emphasis` | Betonter Hintergrund | `#f5f5f5` | `#2d2d2d` |
| `--jlu-bg-subtle` | Subtiler Hintergrund | `#fafafa` | `#252525` |
| `--jlu-text-default` | Standard-Text | `#1a1a1a` | `#f5f5f5` |
| `--jlu-text-emphasis` | Betonter Text | `#1a1a1a` | `#f5f5f5` |
| `--jlu-text-subtle` | Subtiler Text | `#666666` | `#aaaaaa` |
| `--jlu-accent` | Akzentfarbe | `#0052cc` | `#3388ff` |

#### Statusfarben

| Token | Beschreibung | Wert |
|-------|-------------|------|
| `--jlu-success` | Erfolg | `#00a650` |
| `--jlu-warning` | Warnung | `#faad14` |
| `--jlu-error` | Fehler | `#ff4d4f` |

## Theme-Strategie

### Light Theme

- Helle Hintergründe (`#ffffff`, `#f5f5f5`)
- Dunkler Text (`#1a1a1a`)
- Hoher Kontrast
- Akzent: Blau (`#0052cc`)

### Dark Theme

- Dunkle Hintergründe (`#1a1a1a`, `#2d2d2d`)
- Heller Text (`#f5f5f5`)
- Reduzierter Kontrast für angenehmes Sehen
- Akzent: Helles Blau (`#3388ff`)

### System Theme

- Orientiert am Betriebssystem
- Wird über `prefers-color-scheme` erkannt
- Automatischer Wechsel bei Theme-Änderung

## CSS-Classes

### Layout-Classes

```css
/* Sidebar */
.jlu-sidebar {
  background: var(--jlu-bg-default);
  border-right: 1px solid var(--jlu-border-subtle);
}

/* Main Area */
.jlu-main {
  background: var(--jlu-bg-subtle);
}

/* Card */
.jlu-card {
  background: var(--jlu-bg-default);
  border-radius: var(--jlu-border-radius);
  box-shadow: var(--jlu-shadow-sm);
}

/* Button */
.jlu-button {
  background: var(--jlu-accent);
  color: var(--jlu-text-on-accent);
  border-radius: var(--jlu-border-radius);
}
```

### Status-Classes

```css
/* Success */
.jlu-success {
  color: var(--jlu-success);
}

/* Warning */
.jlu-warning {
  color: var(--jlu-warning);
}

/* Error */
.jlu-error {
  color: var(--jlu-error);
}
```

## Typography

### Font Families

```css
/* Inter — UI Text */
--jlu-font-ui: 'Inter', sans-serif;

/* JetBrains Mono — Code */
--jlu-font-code: 'JetBrains Mono', monospace;

/* Manrope — Headings */
--jlu-font-heading: 'Manrope', sans-serif;
```

### Font Sizes

```css
/* Small */
--jlu-font-size-sm: 0.75rem;   /* 12px */
--jlu-line-height-sm: 1rem;    /* 16px */

/* Base */
--jlu-font-size-base: 0.875rem; /* 14px */
--jlu-line-height-base: 1.25rem; /* 20px */

/* Large */
--jlu-font-size-lg: 1rem;      /* 16px */
--jlu-line-height-lg: 1.5rem;  /* 24px */

/* XL */
--jlu-font-size-xl: 1.125rem;  /* 18px */
--jlu-line-height-xl: 1.75rem; /* 28px */
```

## Spacing

```css
/* Spacing Scale */
--jlu-space-1: 0.25rem;  /* 4px */
--jlu-space-2: 0.5rem;   /* 8px */
--jlu-space-3: 0.75rem;  /* 12px */
--jlu-space-4: 1rem;     /* 16px */
--jlu-space-5: 1.25rem;  /* 20px */
--jlu-space-6: 1.5rem;   /* 24px */
--jlu-space-8: 2rem;     /* 32px */
--jlu-space-10: 2.5rem;  /* 40px */
--jlu-space-12: 3rem;    /* 48px */
```

## Borders

```css
/* Border Radius */
--jlu-border-radius-sm: 0.25rem;   /* 4px */
--jlu-border-radius: 0.5rem;       /* 8px */
--jlu-border-radius-lg: 0.75rem;   /* 12px */
--jlu-border-radius-full: 9999px;  /* Full */

/* Border Widths */
--jlu-border-width-sm: 1px;
--jlu-border-width-md: 2px;
```

## Shadows

```css
/* Shadow Scale */
--jlu-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
--jlu-shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);
--jlu-shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1);
--jlu-shadow-xl: 0 20px 25px rgba(0, 0, 0, 0.15);
```

## Animationen

```css
/* Transitions */
--jlu-transition-fast: 150ms ease;
--jlu-transition-base: 200ms ease;
--jlu-transition-slow: 300ms ease;

/* Easing */
--jlu-ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
```

## Beispiel: Komponente

```css
/* Card Component */
.jlu-card {
  background: var(--jlu-bg-default);
  border-radius: var(--jlu-border-radius);
  padding: var(--jlu-space-4);
  box-shadow: var(--jlu-shadow-sm);
  transition: box-shadow var(--jlu-transition-base);
}

.jlu-card:hover {
  box-shadow: var(--jlu-shadow-md);
}

/* Button Component */
.jlu-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--jlu-space-2);
  padding: var(--jlu-space-2) var(--jlu-space-4);
  background: var(--jlu-accent);
  color: var(--jlu-text-on-accent);
  border: none;
  border-radius: var(--jlu-border-radius);
  font-size: var(--jlu-font-size-base);
  line-height: var(--jlu-line-height-base);
  cursor: pointer;
  transition: background var(--jlu-transition-fast),
              transform var(--jlu-transition-fast);
}

.jlu-button:hover {
  background: var(--jlu-accent-hover);
}

.jlu-button:active {
  transform: scale(0.98);
}
```

## Best Practices

1. **Semantic Tokens nutzen** — Nicht absolute Werte verwenden
2. **Konsistenz** — Die gleichen Tokens für gleiche Elemente
3. **Kontrast** — Mindestens WCAG AA Kontrast (4.5:1 für Text)
4. **Accessibility** — Theme-Wechsel sollte ohne JS funktionieren
5. **Performance** — CSS-Transitions nutzen (nicht JS)
