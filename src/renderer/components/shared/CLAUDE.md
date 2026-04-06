<!-- claude-md-auto:start -->
`★ Insight ─────────────────────────────────────`
A few non-obvious things worth capturing here:
- The CSS keyframe injection pattern (style tag with a guard ID) is used by Toast, Skeleton, and Tooltip — it's the established pattern for animations in this shared layer, not an anti-pattern.
- `NotificationCenter` is split across three files by responsibility (component/parts/styles), which is the decomposition convention for heavier shared components.
- `ProviderLogos.tsx` is the only file in the renderer with intentional hardcoded brand colors — it's explicitly exempt from the design token rule.
`─────────────────────────────────────────────────`

# Shared Components — Cross-Feature UI Primitives

Reusable, theme-aware UI components consumed across all feature areas. No feature-specific logic — these are pure presentational primitives.

## Key Files

| File | Role |
|---|---|
| `Toast.tsx` | Fixed-position toast container + individual toast item (icon, message, optional action, progress bar, auto-dismiss) |
| `NotificationCenter.tsx` | Persistent notification panel (history of toasts/events) |
| `NotificationCenter.parts.tsx` | Sub-components for notification rows (typed icon SVGs, expandable rows) |
| `NotificationCenter.styles.ts` | Shared inline style objects for notification center layout |
| `Tooltip.tsx` | Hover tooltip wrapper — positions above by default, flips near viewport edges |
| `Tooltip.helpers.ts` | `computePosition`, `cloneTooltipChild` — viewport collision logic |
| `Skeleton.tsx` | Shimmer loading placeholders (`SkeletonLine`, `SkeletonBlock`, `SkeletonCard`, etc.) |
| `EmptyState.tsx` | Centered empty state with SVG illustration, title, description, optional action button |
| `ErrorBoundary.tsx` | React error boundary for isolating subtree render failures |
| `ProductIcon.tsx` | App icon with configurable size |
| `ProviderLogos.tsx` | Brand SVG logos for AI providers (Anthropic, OpenAI, etc.) |
| `index.ts` | Barrel export — import everything from `@renderer/components/shared` |

## Patterns & Conventions

### CSS Keyframe Injection
Animations are injected via `document.createElement('style')` with a stable `id` guard to prevent duplicates across re-renders. Do not use React `<style>` tags or inline `style` props for keyframes. Follow the same pattern if adding animated components:

```ts
if (typeof document !== 'undefined' && !document.getElementById('__my-anim__')) {
  const s = document.createElement('style');
  s.id = '__my-anim__';
  s.textContent = `@keyframes my-anim { ... }`;
  document.head.appendChild(s);
}
```

### Theme Compatibility
All colors **must** use CSS custom properties (`var(--surface-raised)`, `var(--interactive-accent)`, etc.) — never hardcoded hex or rgb. The pre-commit hook blocks hardcoded colors in renderer files.

**Exception:** `ProviderLogos.tsx` uses canonical brand colors — this is intentional and exempt.

### File Decomposition for Complex Components
Large components split across three files: `.tsx` (component), `.parts.tsx` (sub-components), `.styles.ts` (shared style objects). See `NotificationCenter.*` as the reference.

### Inline SVG Icons
Icons are inlined as JSX — no external SVG files, no icon library. Keeps the bundle predictable and avoids SSR issues.

## Dependencies

- `../../hooks/useToast` — `ToastItem`, `NotificationEntry`, `NotificationProgress`, `ToastType` types consumed by Toast and NotificationCenter
- Design token CSS variables defined in `src/renderer/styles/tokens.css`

## Gotchas

- `Tooltip` uses `position: fixed` and renders at `z-index: 9999` — it escapes any `overflow: hidden` container. `cloneTooltipChild` in `Tooltip.helpers.ts` handles attaching ref forwarding to arbitrary children.
- `Skeleton.tsx` guards `document` access with `typeof document !== 'undefined'` for SSR safety, even though this app doesn't SSR — keep the guard when adding similar injection code.
- `ProviderLogos.tsx` is the **only** place in `src/renderer/` where hardcoded colors are allowed. Don't use it as a model for other components.
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
