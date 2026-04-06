<!-- claude-md-auto:start -->
The existing CLAUDE.md is missing `RouterAnalyticsPanel.tsx`, `AnalyticsDashboardSessions.detail.tsx`, and the `useRouterStats` data path. Here's the corrected content:

---

# Analytics — Claude Code Session Metrics Dashboard

Read-only dashboard that visualizes aggregate and per-session metrics from Claude Code agent runs, plus model-router decision telemetry. Mounted in `InnerAppLayout` as a sidebar/panel view.

## Key Files

| File | Role |
|---|---|
| `AnalyticsDashboard.tsx` | Root component — wires `useSessionAnalytics` + `useRouterStats` to child views, manages selected-session state |
| `AnalyticsDashboardOverview.tsx` | Summary grid (sessions, tokens/edit, retry rate, error rate), tool distribution bar chart, efficiency sparkline (SVG) |
| `AnalyticsDashboardSessions.tsx` | Sortable session history table with expandable row selection |
| `AnalyticsDashboardSessions.detail.tsx` | Session detail panel — token breakdown, file edits by path, tool call timeline, error list |
| `RouterAnalyticsPanel.tsx` | Model router telemetry — tier distribution bars (Haiku/Sonnet/Opus), override rate, layer split (rules/classifier/other) |
| `analyticsDashboardFormatting.ts` | Pure formatting/sorting/color-mapping utilities — no React, no side effects |
| `index.ts` | Barrel export of `AnalyticsDashboard` only |

## Data Flow

```
AgentEventsContext.agents
  → useSessionAnalytics(agents)
      → { sessions: SessionMetrics[], aggregate: AggregateMetrics, toolDistribution: ToolDistributionEntry[] }

useRouterStats()
  → { stats: RouterStatsResult | null }   (IPC: router:getStats)

Both → AnalyticsDashboard → Overview + RouterAnalyticsPanel + Sessions subcomponents
```

All session data is derived — no direct IPC calls from this directory. Types (`SessionMetrics`, `AggregateMetrics`, `ToolDistributionEntry`) are defined in `src/renderer/hooks/useSessionAnalytics.ts`. `RouterStatsResult` is in `src/renderer/types/electron-workspace.ts`.

## Patterns

- **Every component is `memo`-wrapped** with a named function expression — `memo(function ComponentName(...))`. Required for React DevTools display names.
- **Inline interfaces per component** — props interfaces live directly above each component, not in a shared types file.
- **Formatting is fully separated** — `analyticsDashboardFormatting.ts` contains all display-logic: `formatTokens`, `formatDuration`, `timeAgo`, `getToolColor`, `sortSessionMetrics`, sparkline math. Add new formatting here, not inline in components.
- **Color strategy is mixed by intent**: Layout/spacing uses Tailwind classes; semantic colors use `var(--token)` in `style={}` for theme compatibility. `TOOL_COLORS` in the formatting file uses hardcoded hex per tool name — this is intentional (tool colors are fixed, not themeable).

## Gotchas

- **`efficiencyScore === Infinity`** is a valid state (zero file edits → tokens ÷ 0). Render as `--` in the UI and filter these out before sparkline input via `getEfficiencyTrend()`.
- **`normalizeMetricValue()` maps `Infinity` → `MAX_SAFE_INTEGER`** before sort — `Infinity - Infinity = NaN` breaks `Array.sort` comparators silently.
- **Sparkline requires ≥ 2 data points** — `EfficiencySparkline` returns `null` if fewer points exist. It shows the last 20 sessions sorted by `startedAt`.
- **Session table hover uses inline `onMouseEnter/onMouseLeave`** style manipulation rather than Tailwind hover classes — `color-mix()` for the selected-row highlight requires CSS variable support that Tailwind hover variants can't provide.
- **MCP tool colors**: any tool name starting with `mcp__` falls back to `#94a3b8` (slate-400) since the `TOOL_COLORS` map only covers Claude Code's built-in tools.
- **`RouterAnalyticsPanel` renders `null`** when `stats` is null or `totalDecisions === 0` — safe to mount unconditionally.
<!-- claude-md-auto:end -->

<!-- claude-md-manual:preserved -->
# Analytics — Claude Code Session Metrics Dashboard

Read-only dashboard that visualizes aggregate and per-session metrics from Claude Code agent runs. Mounted in `InnerAppLayout` as a sidebar/panel view.

## Key Files

| File                              | Role                                                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `AnalyticsDashboard.tsx`          | Root component — wires `useSessionAnalytics` hook to child views, manages selected-session state                      |
| `AnalyticsDashboardOverview.tsx`  | Summary grid (sessions, tokens/edit, retry rate, error rate), tool distribution bar chart, efficiency sparkline (SVG) |
| `AnalyticsDashboardSessions.tsx`  | Sortable session history table + expandable detail panel (token breakdown, file edits, tool call timeline, errors)    |
| `analyticsDashboardFormatting.ts` | Pure formatting/sorting/color-mapping functions — no React, no side effects                                           |
| `index.ts`                        | Barrel export of `AnalyticsDashboard`                                                                                 |

## Data Flow

```
AgentEventsContext.agents → useSessionAnalytics(agents)
  → { sessions: SessionMetrics[], aggregate: AggregateMetrics, toolDistribution: ToolDistributionEntry[] }
    → AnalyticsDashboard → Overview + Sessions sub-components
```

All data is derived — no IPC calls, no config reads. The hook (`src/renderer/hooks/useSessionAnalytics.ts`) transforms raw agent events into metrics. Types (`SessionMetrics`, `AggregateMetrics`, `ToolDistributionEntry`) are defined there, not here.

## Patterns

- **Every component is `memo`-wrapped** with named function expressions (e.g. `memo(function SummaryCard(...))`) — required by the project's React DevTools convention.
- **Inline interfaces per component** — props interfaces are co-located directly above each component, not in a shared types file. Keep this pattern.
- **No Tailwind color classes** — all colors use CSS custom properties (`var(--text-faint)`, `var(--accent)`, `var(--border)`, etc.) via `style={}` props for theme compatibility. Tailwind is only used for layout/spacing.
- **Tool color mapping** lives in `TOOL_COLORS` (formatting file) — hardcoded hex values keyed by Claude Code tool name. MCP tools (`mcp__*`) fall back to `#94a3b8`.

## Gotchas

- `efficiencyScore === Infinity` is a valid state (zero file edits → infinite tokens-per-edit). Display as `--`, and filter these out before sparkline rendering.
- `normalizeMetricValue()` converts `Infinity` to `MAX_SAFE_INTEGER` for sorting — without this, `Array.sort` breaks on `Infinity - Infinity = NaN`.
- The sparkline needs ≥2 data points to render (returns `null` otherwise). It shows the last 20 sessions only.
- Session table hover uses inline `onMouseEnter/onMouseLeave` style manipulation instead of Tailwind hover classes — this is intentional because the selected-row highlight (`color-mix`) also needs inline styles for CSS variable support.
