<!-- claude-md-auto:start -->

# UsageModal — Claude Code token/cost usage dashboard

Displays token consumption and estimated cost from `~/.claude` local session data. Two independent UI variants live in this directory: an overlay modal and an embedded panel.

## Key Files

| File                     | Role                                                                                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `UsageModal.tsx`         | Overlay modal — fixed-position dialog with backdrop blur, Escape-to-close, loads summary on open. Entry point used from Settings/menu.         |
| `UsagePanel.tsx`         | Embedded panel — tab-based (`Current` / `History`), designed to fill a sidebar or pane slot.                                                   |
| `UsageCurrentTab.tsx`    | Live view — polls `window.electronAPI.usage` every 10s for windowed buckets (5h, weekly, Sonnet 5h) + recent session details.                  |
| `UsageHistoryTab.tsx`    | Historical view — fetches `UsageSummary` per time range (today/7d/30d/all), renders per-session breakdowns with model breakdown table.         |
| `UsageModalSections.tsx` | Presentational components for the **modal** variant — header, range controls, summary cards, session list, model table.                        |
| `UsagePanelShared.tsx`   | Utilities + `StatRow` component for the **panel** variant — formatters, `modelColor`, `modelShortName`, `summarizeModels`, `USAGE_REFRESH_MS`. |
| `usageModalUtils.ts`     | Utilities for the **modal** variant — same formatters plus `getSummaryCards`, `getModelRows`, `getSessionTotalTokens`.                         |
| `index.ts`               | Barrel — exports `UsageModal` only. `UsagePanel` must be imported by path.                                                                     |

## Two Parallel Component Trees

Two independent usage UIs grew separately:

- **Modal path**: `UsageModal` → `UsageModalSections` → `usageModalUtils`
- **Panel path**: `UsagePanel` → `UsageCurrentTab` / `UsageHistoryTab` → `UsagePanelShared`

Both hit `window.electronAPI.usage.getSummary()` but use **separate utility files** with near-identical implementations.

## Patterns

- All top-level components are `memo`-wrapped.
- Styling: CSS custom properties (`var(--bg-secondary)`, `var(--text-muted)`, `var(--border)`) via inline `CSSProperties` — Tailwind only for layout utilities (`flex`, `gap-*`, `px-*`).
- Polling: `UsageCurrentTab` has a local `usePolling` hook running `setInterval` at `USAGE_REFRESH_MS` (10 000 ms). Not exported.
- Data fetching: direct `window.electronAPI.usage.*` calls — no abstraction layer.
- Model colors are hardcoded: Opus → `#c084fc`, Sonnet → `#60a5fa`, Haiku → `#34d399`.

## Gotchas

- **Duplicated formatters**: `formatTokens`, `formatCost`, `formatDate`, `timeAgo`, `modelShortName`, `modelColor`, `getTimeSince` exist nearly identically in both `UsagePanelShared.tsx` and `usageModalUtils.ts`. Changes must be mirrored in both files.
- **Two `TimeRange` type definitions**: one in `usageModalUtils.ts`, one in `UsagePanelShared.tsx`. Structurally identical (`'today' | '7d' | '30d' | 'all'`) but not interchangeable — don't mix imports across the two trees.
- **Barrel gap**: `index.ts` only exports `UsageModal`. Consumers of `UsagePanel` must import it directly (`from '.../UsageModal/UsagePanel'`).
- **Hover via direct style mutation**: `UsageModalSections.tsx` uses `onMouseEnter`/`onMouseLeave` to set `event.currentTarget.style` — bypasses React's virtual DOM. Works, but use Tailwind `hover:` or CSS `:hover` for new code.
- **`getTimeSince` returns `undefined` for `'all'`**: the IPC call omits the `since` field entirely in that case — the backend treats undefined as unbounded.

## IPC Dependencies

| Call                                       | Where used                      |
| ------------------------------------------ | ------------------------------- |
| `usage.getSummary({ since, maxSessions })` | `UsageModal`, `UsageHistoryTab` |
| `usage.getWindowedUsage()`                 | `UsageCurrentTab`               |
| `usage.getSessionDetail(sessionId)`        | `UsageCurrentTab`               |

Types: `SessionUsage`, `UsageSummary`, `SessionDetail`, `WindowedUsage`, `UsageAPI` — all from `../../types/electron.d.ts`.

<!-- claude-md-auto:end -->

<!-- claude-md-manual:preserved -->

# UsageModal — Claude Code token/cost usage dashboard

Displays token consumption and estimated cost from `~/.claude` local session data. Two independent UI variants live in this directory.

## Key Files

| File                     | Role                                                                                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `UsageModal.tsx`         | Overlay modal — fixed-position dialog with backdrop blur, Escape-to-close, loads summary on open. Used from Settings/menu.                     |
| `UsagePanel.tsx`         | Embedded panel — tab-based (`Current` / `History`), designed to fill a sidebar or pane slot.                                                   |
| `UsageCurrentTab.tsx`    | Live view — polls `window.electronAPI.usage` every 10s for windowed buckets (5h, weekly, Sonnet 5h) + recent session details.                  |
| `UsageHistoryTab.tsx`    | Historical view — fetches `UsageSummary` per time range (today/7d/30d/all), renders per-session breakdowns.                                    |
| `UsageModalSections.tsx` | Presentational components for the modal variant — header, range controls, summary cards, session list, model table.                            |
| `UsagePanelShared.tsx`   | Utilities + `StatRow` component for the **panel** variant — formatters, `modelColor`, `modelShortName`, `summarizeModels`, `USAGE_REFRESH_MS`. |
| `usageModalUtils.ts`     | Utilities for the **modal** variant — same formatters plus `getSummaryCards`, `getModelRows`, `getSessionTotalTokens`.                         |
| `index.ts`               | Barrel — exports `UsageModal` only. `UsagePanel` must be imported by path.                                                                     |

## Two Parallel Component Trees

Two independent usage UIs grew separately:

- **Modal path**: `UsageModal` → `UsageModalSections` → `usageModalUtils`
- **Panel path**: `UsagePanel` → `UsageCurrentTab` / `UsageHistoryTab` → `UsagePanelShared`

Both hit `window.electronAPI.usage.getSummary()` but use **separate utility files** with overlapping implementations.

## Patterns

- All top-level components are `memo`-wrapped.
- Styling: CSS custom properties (`var(--bg-secondary)`, `var(--text-muted)`, `var(--border)`) via inline `CSSProperties` — Tailwind only for layout utilities (`flex`, `gap-*`, `px-*`).
- Polling: `UsageCurrentTab` has a local `usePolling` hook (not exported) running `setInterval` at `USAGE_REFRESH_MS` (10s).
- Data fetching: direct `window.electronAPI.usage.*` calls — no abstraction layer.
- Model colors are hardcoded: Opus → `#c084fc`, Sonnet → `#60a5fa`, Haiku → `#34d399`.

## Gotchas

- **Duplicated formatters**: `formatTokens`, `formatCost`, `formatDate`, `timeAgo`, `modelShortName`, `modelColor`, `getTimeSince` exist nearly identically in both `UsagePanelShared.tsx` and `usageModalUtils.ts`. Changes must be mirrored in both.
- **Two `TimeRange` type definitions**: one in `usageModalUtils.ts`, one in `UsagePanelShared.tsx`. Structurally identical but not interchangeable — don't mix imports across the two trees.
- **Barrel gap**: `index.ts` only exports `UsageModal`. Consumers of `UsagePanel` must import it directly.
- **Hover via direct style mutation**: `UsageModalSections.tsx` uses `onMouseEnter`/`onMouseLeave` to set `event.currentTarget.style` — bypasses React's virtual DOM. Works, but prefer Tailwind `hover:` or CSS `:hover` for new components.

## IPC Dependencies

| Call                                       | Where used                      |
| ------------------------------------------ | ------------------------------- |
| `usage.getSummary({ since, maxSessions })` | `UsageModal`, `UsageHistoryTab` |
| `usage.getWindowedUsage()`                 | `UsageCurrentTab`               |
| `usage.getSessionDetail(sessionId)`        | `UsageCurrentTab`               |

Types: `SessionUsage`, `UsageSummary`, `SessionDetail`, `WindowedUsage`, `UsageAPI` — all from `../../types/electron.d.ts`.
