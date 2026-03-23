# CSS Variable Migration Map

## Legacy → Semantic Token Mapping

| Legacy Variable  | Semantic Token            | Tailwind Class                  |
| ---------------- | ------------------------- | ------------------------------- |
| `--bg`           | `--surface-base`          | `bg-surface-base`               |
| `--bg-secondary` | `--surface-panel`         | `bg-surface-panel`              |
| `--bg-tertiary`  | `--surface-raised`        | `bg-surface-raised`             |
| `--text`         | `--text-primary`          | `text-text-semantic-primary`    |
| `--border`       | `--border-default`        | `border-border-semantic`        |
| `--border-muted` | `--border-subtle`         | `border-border-semantic-subtle` |
| `--accent`       | `--interactive-accent`    | `text-interactive-accent`       |
| `--accent-hover` | `--interactive-hover`     | `text-interactive-hover`        |
| `--accent-muted` | `--interactive-muted`     | `bg-interactive-muted`          |
| `--selection`    | `--interactive-selection` | `bg-interactive-selection`      |
| `--focus-ring`   | `--interactive-focus`     | (outline utility)               |
| `--success`      | `--status-success`        | `text-status-success`           |
| `--warning`      | `--status-warning`        | `text-status-warning`           |
| `--error`        | `--status-error`          | `text-status-error`             |
| `--purple`       | `--palette-purple`        | (no Tailwind alias yet)         |
| `--purple-muted` | `--palette-purple-muted`  | (no Tailwind alias yet)         |

## Variables That Do NOT Need Migration

These are already semantic names (same in both systems):

- `--text-primary`, `--text-secondary`, `--text-muted`, `--text-faint`, `--text-on-accent`
- `--surface-base`, `--surface-panel`, `--surface-raised`, `--surface-overlay`, `--surface-inset`
- `--border-default`, `--border-subtle`, `--border-accent`
- `--interactive-accent`, `--interactive-hover`, `--interactive-muted`
- `--status-success`, `--status-warning`, `--status-error`, `--status-info`
- `--tab-*`, `--composer-*`, `--term-*`, `--monaco-bg`, `--chat-user-*`
- `--font-ui`, `--font-mono`, `--font-size-ui`

## Hardcoded Hex → CSS Variable Mapping

| Hex Value                    | Semantic Variable                                 | Context                    |
| ---------------------------- | ------------------------------------------------- | -------------------------- |
| `#3fb950`                    | `var(--status-success)`                           | Success / added indicators |
| `#f85149`                    | `var(--status-error)`                             | Error / deleted indicators |
| `#d29922` / `#fbbf24`        | `var(--status-warning)`                           | Warning indicators         |
| `#58a6ff`                    | `var(--interactive-accent)`                       | Links, accents             |
| `#bc8cff` / `#a78bfa`        | `var(--palette-purple)`                           | Tool badges, special items |
| `#0d1117` / `#0d0d12`        | `var(--surface-base)`                             | Background colors          |
| `#161b22` / `#18181b`        | `var(--surface-panel)`                            | Panel backgrounds          |
| `#1c2128` / `#27272a`        | `var(--surface-raised)`                           | Raised surfaces            |
| `#30363d` / `#3f3f46`        | `var(--border-default)`                           | Borders                    |
| `#e6edf3` / `#fafafa`        | `var(--text-primary)`                             | Primary text               |
| `#8b949e` / `#a1a1aa`        | `var(--text-secondary)`                           | Secondary text             |
| `#484f58` / `#52525b`        | `var(--text-muted)`                               | Muted text                 |
| `rgba(255,255,255,0.05-0.1)` | `var(--surface-raised)` or `var(--border-subtle)` | Subtle highlights          |

## Rules

1. **Replace `var(--bg)` with `var(--surface-base)`** etc. per the mapping above
2. **Replace hardcoded hex values** with the appropriate CSS variable
3. **Do NOT change** theme definition files (`src/renderer/themes/*.ts`)
4. **Do NOT change** `tokens.css` (it defines both systems and the aliases)
5. **Do NOT change** `globals.css` compatibility utilities (`.text-ink`, `.border-surface`, etc.)
6. **Keep fallback patterns** like `var(--accent, #58a6ff)` — just update the var name: `var(--interactive-accent, #58a6ff)`
7. **File icon colors** (`fileIcons.ts`, `fileTypeData.ts`, `Breadcrumb.icons.tsx`) are intentional — these represent file types, not theme colors. Skip them.
8. **Chart/visualization colors** may be intentional — use judgment. If they map to status colors (success/warning/error), migrate them.
