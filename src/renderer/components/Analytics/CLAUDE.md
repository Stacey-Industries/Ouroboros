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
