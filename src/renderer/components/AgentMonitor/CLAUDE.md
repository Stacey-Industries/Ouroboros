# AgentMonitor — Real-time agent session monitoring dashboard

Displays live and historical Claude Code agent sessions with tool call feeds, timelines, cost tracking, approval dialogs, and session comparison.

## Component Hierarchy

| Component                        | Role                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `AgentMonitorManager.tsx`        | Top-level orchestrator — wires contexts (`AgentEventsContext`, `ProjectContext`, `ToastContext`), modes, templates, and notifications |
| `AgentMonitorManagerContent.tsx` | Mode router — switches between normal view, compare mode, cost mode, and multi-session launcher/monitor                               |
| `AgentMonitorManagerPanels.tsx`  | Toolbar, quick actions, compare panels, previous-sessions collapsible, empty state, search input                                      |
| `AgentCard.tsx`                  | Single session card — manages local UI state (expanded, notes, view toggle), delegates layout to `AgentCardSections`                  |
| `AgentCardSections.tsx`          | Card layout composition — header, body, notes editor, tool views                                                                      |
| `AgentCardControls.tsx`          | Presentational primitives — status badge, progress bar, view toggle, action buttons, duration formatter                               |
| `AgentCardHeaderActions.tsx`     | Header action buttons — export, replay, review changes, bookmark                                                                      |
| `AgentTree.tsx`                  | Tree view for parent→child agent relationships with collapsible branches                                                              |
| `ApprovalDialog.tsx`             | Approval queue — keyboard-driven (Y/N/A/Esc), processes `ApprovalRequest` one at a time                                               |
| `ApprovalDialogCard.tsx`         | Approval card UI — tool badge, input preview, approve/reject/always-allow buttons                                                     |

## Tool Call Visualization

| Component               | Role                                                   |
| ----------------------- | ------------------------------------------------------ |
| `ToolCallFeed.tsx`      | Chronological feed of tool calls with status icons     |
| `ToolCallRow.tsx`       | Single tool call row                                   |
| `ToolCallRowHeader.tsx` | Row header — tool name, duration, status indicator     |
| `ToolInputPreview.tsx`  | Truncated preview of tool input (file paths, commands) |
| `FeedIcons.tsx`         | SVG icons for tool types                               |
| `feedHelpers.ts`        | Feed formatting utilities                              |

## Timeline Visualization

| Component              | Role                               |
| ---------------------- | ---------------------------------- |
| `ToolCallTimeline.tsx` | Gantt-style timeline of tool calls |
| `TimelineBar.tsx`      | Individual timeline bar            |
| `TimelineXAxis.tsx`    | Time axis labels                   |
| `TimelineTooltip.tsx`  | Hover tooltip with call details    |
| `TimelineLegend.tsx`   | Color legend for tool types        |
| `timelineHelpers.ts`   | Position/scale calculations        |

## Cost Tracking

| Component                                  | Role                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------- |
| `CostDashboard.tsx`                        | Aggregate cost view with charts and tables                                      |
| `CostControls.tsx`                         | Cost view controls                                                              |
| `SummaryCards.tsx`                         | Token/cost summary cards                                                        |
| `SessionTable.tsx` / `SessionTableRow.tsx` | Per-session cost breakdown table                                                |
| `DailyChart.tsx`                           | Daily spending bar chart                                                        |
| `costCalculator.ts`                        | `estimateCost()`, `formatCost()`, `formatTokenCount()` — uses `@shared/pricing` |
| `costHelpers.ts`                           | Cost formatting helpers                                                         |

## Hooks

| Hook                            | Role                                                                                                                          |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `useAgentMonitorModes.ts`       | Manages mutually exclusive modes: normal, compare, cost, multi-session. Listens for `agent-ide:open-multi-session` DOM event. |
| `useAgentMonitorTemplates.ts`   | Loads and executes agent templates (quick-launch presets)                                                                     |
| `useCompletionNotifications.ts` | Fires desktop notifications via `notificationBuilder.ts` when agents finish                                                   |
| `useElapsedSeconds.ts`          | Live-updating elapsed time counter for running sessions                                                                       |

## Types (`types.ts`)

- **`AgentSession`** — Core session model: status, tokens, tool calls, parent linkage, notes, snapshot hash
- **`ToolCallEvent`** — Single tool invocation: name, input, duration, status, output
- **`HookPayload`** — Raw NDJSON from Claude Code hooks (named pipe → IPC bridge). Event types: `agent_start`, `pre_tool_use`, `post_tool_use`, `agent_end`, `agent_stop`, `session_start`, `session_stop`
- **`TokenUsage`** — Token counts from API responses

## Key Patterns

- **Heavily memoized**: Every component uses `memo()`. Keep prop references stable to avoid re-renders.
- **Derived state pattern**: `AgentCard` computes `isRunning`, `displayDuration`, etc. from session + elapsed time via `getAgentCardDerivedState()` — don't duplicate this logic.
- **Mutually exclusive modes**: Compare, cost, and multi-session modes are mutually exclusive — toggling one disables others (enforced in `useAgentMonitorModes`).
- **Session enrichment pipeline**: `filterSessions()` → `enrichSessions()` (adds snapshot hashes) before rendering.
- **DOM events for cross-component communication**: `agent-ide:open-session-replay`, `agent-ide:open-diff-review`, `agent-ide:open-multi-session`.

## Data Flow

```
Claude Code hooks (named pipe)
  → src/main/hooks.ts (IPC bridge)
  → AgentEventsContext (renderer state)
  → AgentMonitorManager (enrichment + filtering)
  → AgentMonitorManagerContent (mode routing)
  → AgentCard / AgentTree / CostDashboard
```

## Gotchas

- **Approval keyboard shortcuts are global**: `ApprovalDialog` adds a `window.keydown` listener for Y/N/A/Esc. Disabled when reject-reason input is focused to prevent conflicts.
- **Tree vs flat rendering**: `AgentTree` is used only when sessions have parent-child relationships AND no active filter query. Otherwise falls back to flat `SessionCardList`.
- **`useElapsedMs` vs `useElapsedSeconds`**: Two different timing hooks — `useElapsedMs` (in `AgentCardControls`) for smooth progress bars, `useElapsedSeconds` for display text. Don't mix them up.
- **Cost pricing lives in `@shared/pricing`**: `costCalculator.ts` re-exports and wraps shared pricing — don't duplicate pricing constants here.
