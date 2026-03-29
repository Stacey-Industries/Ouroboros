# Renderer Rules (src/renderer/**)

- Browser environment — no Node.js APIs, no `require`, no `fs`, no `path`
- Always use `window.electronAPI` bridge (defined in preload) for IPC
- Two event systems: Electron IPC (via preload) vs DOM CustomEvents (renderer-only) — never mix

## Color & Styling Rules

**NEVER hardcode hex (`#fff`), `rgb()`, or `rgba()` values in components.** Use design tokens instead. The pre-commit hook will block commits with new hardcoded colors in renderer files.

**Token system** (defined in `src/renderer/styles/tokens.css`, registered in `globals.css @theme`):

| Need | Token / Tailwind class |
|------|----------------------|
| Background | `bg-surface-base`, `bg-surface-panel`, `bg-surface-raised`, `bg-surface-overlay`, `bg-surface-inset` |
| Text | `text-text-semantic-primary`, `-secondary`, `-muted`, `-faint`, `-on-accent` |
| Borders | `border-border-semantic`, `-subtle`, `-accent` |
| Interactive | `bg-interactive-accent`, `-hover`, `-muted`, `-selection`, `-focus` |
| Status | `text-status-success`, `-warning`, `-error`, `-info` |
| Status subtle | `bg-status-success-subtle`, `-error-subtle`, `-warning-subtle` |
| Diff | `bg-diff-add-bg`, `bg-diff-del-bg`, `border-diff-add-border`, `border-diff-del-border` |
| Accent subtle | `bg-interactive-accent-subtle` |
| Hover | `bg-surface-hover` |
| Search | `bg-search-match-bg` |
| Scrollbar | `var(--surface-scroll-thumb)`, `var(--surface-scroll-track)` |
| Static (non-themed) | `bg-surface-static`, `text-ink`, `text-accent-blue`, etc. |

**In inline `style={{}}` use `var(--token-name)`.** In `className` use the Tailwind utility.

**Allowed exceptions** (document with a comment if used):
- Brand/logo colors (`ProviderLogos.tsx`, file-type icons) — these are canonical and non-themeable
- Loading screen (`index.tsx`) — renders before the token system initializes
- `rgba(0,0,0,*)` for shadows/scrims — opacity overlays, not semantic colors
- Windows platform colors (e.g. title bar close button `#e81123`)
