# shared/ — Cross-cutting UI primitives

Reusable, theme-aware components used across the renderer. No business logic — pure presentation and UX utilities.

## Key Files

| File                     | Role                                                                                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`               | Barrel export — **does not export** `NotificationCenter` or `ErrorBoundary` (imported directly)                                                                              |
| `Toast.tsx`              | `ToastContainer` + `ToastItemView` — fixed bottom-right stack with slide-in/fade-out CSS animations, auto-dismiss progress bar. Consumes `ToastItem` from `useToast` hook.   |
| `NotificationCenter.tsx` | Dropdown panel of persistent notification history (last 50). Rendered in `TitleBar`, toggled by bell icon. Not barrel-exported — imported directly by `Layout/TitleBar.tsx`. |
| `Skeleton.tsx`           | Shimmer loading placeholders — generic (`SkeletonLine`, `SkeletonBlock`) + domain-specific (`FileTreeSkeleton`, `CodeSkeleton`, `AgentCardSkeleton`).                        |
| `EmptyState.tsx`         | Centered placeholder with SVG icon, title, optional description + action button. Used for empty lists/panels.                                                                |
| `Tooltip.tsx`            | Hover tooltip with configurable position (`top`/`bottom`/`left`/`right`), auto-flip near viewport edges, keyboard-accessible (focus/blur).                                   |
| `Tooltip.helpers.ts`     | Pure positioning math + `cloneElement` wiring — split out to keep Tooltip.tsx under ESLint's 300-line limit.                                                                 |
| `ErrorBoundary.tsx`      | Class-based React error boundary with retry button. `label` prop identifies which section crashed. Not barrel-exported — imported directly by `Layout/InnerAppLayout.tsx`.   |
| `PerformanceOverlay.tsx` | Fixed overlay showing heap, RSS, frame time, IPC latency. Toggled via `Ctrl+Shift+P` (handled in App.tsx). Reads from `usePerformance` hook.                                 |

## Patterns

- **CSS custom properties everywhere** — colors use `var(--bg)`, `var(--text)`, `var(--accent)`, `var(--border)`, etc. Never hardcode hex values.
- **Inline `<style>` injection** — Skeleton and Tooltip inject `@keyframes` into `<head>` at module load (guarded by `document.getElementById` to avoid duplicates). Toast injects its keyframes via a `<style>` element rendered inline.
- **All presentational components are `memo`-wrapped** — Skeleton, EmptyState, Tooltip, Toast all use `React.memo`.
- **No Tailwind in most files** — only ErrorBoundary uses Tailwind classes. The rest use `React.CSSProperties` objects for full theme-variable control.

## Gotchas

- **Two components skip the barrel**: `NotificationCenter` and `ErrorBoundary` are not in `index.ts`. Import them from their files directly. If you add a new shared component, decide whether it belongs in the barrel based on usage breadth.
- **Tooltip uses `cloneElement`** to inject mouse/focus handlers onto its child — the child must accept refs and forward event handlers. Wrapping a child that swallows events will break the tooltip.
- **Skeleton style injection is side-effectful** — importing `Skeleton.tsx` mutates the DOM at module load time. Safe in the browser, but will throw in SSR/Node test environments without `document` polyfill.
