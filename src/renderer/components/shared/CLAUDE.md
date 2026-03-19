<!-- claude-md-auto:start -->

Based on the files I've read, here is the generated CLAUDE.md content:

---

# shared/ — Cross-cutting UI Primitives

Reusable, theme-aware components used across the renderer. No business logic — pure presentation and UX utilities.

## Key Files

| File                     | Role                                                                                                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`               | Barrel export — **does not export** `NotificationCenter` or `ErrorBoundary` (single-consumer; imported directly)                                                                                   |
| `Toast.tsx`              | `ToastContainer` + `ToastItemView` — fixed bottom-right stack with slide-in/fade-out CSS animations and auto-dismiss progress bar. Consumes `ToastItem` / `ToastType` from `../../hooks/useToast`. |
| `NotificationCenter.tsx` | Dropdown of persistent notification history (last 50 entries). Rendered in `TitleBar`, toggled by bell icon. Not barrel-exported — `Layout/TitleBar.tsx` imports it directly.                      |
| `Skeleton.tsx`           | Shimmer loading placeholders — generic (`SkeletonLine`, `SkeletonBlock`) + domain-specific presets (`FileTreeSkeleton`, `CodeSkeleton`, `AgentCardSkeleton`).                                      |
| `EmptyState.tsx`         | Centered placeholder with SVG icon, title, optional description, and optional action button. Used in any list/panel that can be empty.                                                             |
| `Tooltip.tsx`            | Hover/focus tooltip with `top`/`bottom`/`left`/`right` positioning, auto-flip near viewport edges, and a configurable delay.                                                                       |
| `Tooltip.helpers.ts`     | Pure positioning math + `cloneElement` wiring, split from `Tooltip.tsx` to stay under ESLint's line limit. No rendering logic.                                                                     |
| `ErrorBoundary.tsx`      | Class-based error boundary with retry button and optional `label` prop for identifying the crashed section. Not barrel-exported — `InnerAppLayout.tsx` imports it directly.                        |
| `PerformanceOverlay.tsx` | Fixed bottom-left overlay showing heap, RSS, frame time, IPC latency. Toggled via `Ctrl+Shift+P` in `App.tsx`. Reads from `../../hooks/usePerformance`.                                            |

## Patterns

- **CSS custom properties everywhere** — all colors use `var(--bg)`, `var(--text)`, `var(--accent)`, `var(--border)`, etc. Never hardcode hex values.
- **Two `@keyframes` injection strategies** — Skeleton and Tooltip inject styles into `<head>` imperatively at module load (guarded by `document.getElementById` to deduplicate). Toast injects via an inline `<style>` JSX element. Don't mix these patterns within a single file.
- **All presentational components are `memo`-wrapped** — Skeleton, EmptyState, Tooltip, Toast all use `React.memo`. Keep this consistent for new components.
- **Mostly inline `React.CSSProperties`**, not Tailwind — gives full access to CSS custom properties without Tailwind scan restrictions. `ErrorBoundary` is the exception (uses Tailwind for layout classes only).

## Gotchas

- **Two components skip the barrel**: `NotificationCenter` and `ErrorBoundary` are not in `index.ts`. Import them via file paths directly. When adding a new component, only add it to `index.ts` if it has more than one consumer.
- **Tooltip uses `cloneElement`** to inject mouse/focus event handlers onto its child — the child must forward event handlers. Wrapping a child that swallows events (e.g. a disabled button) silently breaks the tooltip.
- **Skeleton's style injection is side-effectful at import time** — it calls `document.createElement` at module load. Safe in Chromium, but will throw in Node/SSR test environments without a `document` polyfill.
- **`NotificationEntry` / `NotificationProgress` / `ToastItem` types all come from `../../hooks/useToast`** — don't redefine them here.

## Consumers

| Component            | Used by                                                |
| -------------------- | ------------------------------------------------------ |
| `ToastContainer`     | `App.tsx` (rendered once at root)                      |
| `NotificationCenter` | `Layout/TitleBar.tsx`                                  |
| `ErrorBoundary`      | `Layout/InnerAppLayout.tsx` (wraps each panel)         |
| `Skeleton.*`         | AgentChat, FileTree, GitPanel (any async-loaded panel) |
| `EmptyState`         | FileTree, AgentChat, GitPanel (empty list states)      |
| `Tooltip`            | TitleBar, ActivityBar, CommandPalette, toolbar buttons |
| `PerformanceOverlay` | `App.tsx` (toggled by `Ctrl+Shift+P`)                  |

<!-- claude-md-auto:end -->

<!-- claude-md-manual:preserved -->

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
