<!-- claude-md-auto:start -->
`★ Insight ─────────────────────────────────────`
The existing CLAUDE.md is already solid. Reading the actual source reveals two non-obvious details worth adding: `filterSessions` not only filters sessions but also *trims their toolCalls array* to only matching calls — which means filtered cards show a subset of tool calls, not all of them. And `enrichSessions` is a no-op guard: it only injects `snapshotHash` if the session doesn't already have one, preserving live-event data over disk-restored fallbacks.
`─────────────────────────────────────────────────`

Based on reading the source files, here is the generated CLAUDE.md:

# AgentMonitor — Real-time agent session monitoring dashboard

Displays live and historical Claude Code agent sessions with tool call feeds, timelines, cost tracking, approval dialogs, and session comparison.

## Component Hierarchy

| Component | Role |
|---|---|
| `AgentMonitorManager.tsx` | Top-level orchestrator — wires contexts (`AgentEventsContext`, `ProjectContext`, `ToastContext`), modes, templates, notifications |
| `AgentMonitorManagerContent.tsx` | Mode router — switches between normal view, compare, cost, and multi-session launcher/monitor |
| `AgentMonitorManagerPanels.tsx` | Toolbar, quick actions, compare panels, previous-sessions collapsible, empty state, search |
| `AgentMonitorManagerPanelsParts.tsx` | Primitive UI parts for panels (icons, search input, chevron, etc.) |
| `AgentCard.tsx` | Single session card — manages local UI state (expanded, notes, view toggle), delegates layout to `AgentCardSections` |
| `AgentCardSections.tsx` | Card layout composition — header, body, notes editor, tool views |
| `AgentCardSectionsParts.tsx` | Expanded content, meta row, notes editor, error banner |
| `AgentCardSectionsViews.tsx` | Switches between feed and timeline view inside a card |
| `AgentCardControls.tsx` | Presentational primitives — status badge, progress bar, view toggle, action buttons, duration formatter |
| `AgentCardControlsParts.tsx` | Lower-level card control parts |
| `AgentCardHeaderActions.tsx` | Header action buttons — export, replay, review changes, bookmark |
| `AgentTree.tsx` | Tree view for parent→child agent relationships with collapsible branches |
| `ApprovalDialog.tsx` | Approval queue — keyboard-driven (Y/N/A/Esc), processes one `ApprovalRequest` at a time |
| `ApprovalDialogCard.tsx` / `ApprovalDialogCardParts.tsx` | Approval card UI — tool badge, input preview, approve/reject/always-allow |

## Tool Call Visualization

| Component | Role |
|---|---|
| `ToolCallFeed.tsx` | Chronological feed of tool calls with status icons |
| `ToolCallRow.tsx` | Single tool call row |
| `ToolCallRowHeader.tsx` | Row header — tool name, duration, status indicator |
| `ToolInputPreview.tsx` | Truncated preview of tool input (file paths, commands) |
| `FeedIcons.tsx` | SVG icons keyed by tool type |
| `feedHelpers.ts` | Feed formatting utilities |

## Timeline Visualization

| Component | Role |
|---|---|
| `ToolCallTimeline.tsx` | Gantt-style timeline of tool calls |
| `TimelineBar.tsx` | Individual bar for one tool call |
| `TimelineXAxis.tsx` | Time axis labels |
| `TimelineTooltip.tsx` | Hover tooltip with call details |
| `TimelineLegend.tsx` | Color legend for tool types |
| `timelineHelpers.ts` | Position/width calculations from timestamps |

## Cost Tracking

| Component | Role |
|---|---|
| `CostDashboard.tsx` | Aggregate cost view with charts and session table |
| `CostControls.tsx` | Cost view controls |
| `SummaryCards.tsx` | Token/cost summary cards |
| `SessionTable.tsx` / `SessionTableRow.tsx` | Per-session cost breakdown |
| `DailyChart.tsx` | Daily spending bar chart |
| `AgentSummaryBar.tsx` | Live aggregate bar across all sessions |
| `costCalculator.ts` | `estimateCost()`, `formatCost()`, `formatTokenCount()` — delegates to `@shared/pricing` |
| `costHelpers.ts` | Cost formatting helpers |

## Hooks

| Hook | Role |
|---|---|
| `useAgentMonitorModes.ts` | Manages mutually exclusive modes: normal / compare / cost / multi-session. Listens for `agent-ide:open-multi-session` DOM event. |
| `useAgentMonitorTemplates.ts` | Loads and executes agent quick-launch presets |
| `useCompletionNotifications.ts` | Fires desktop notifications via `notificationBuilder.ts` when agents finish |
| `useElapsedSeconds.ts` | Live elapsed time counter for running sessions (display text) |

## Types (`types.ts`)

- **`AgentSession`** — core session model: status, tokens, tool calls, parent linkage, tasks, conversation turns, compactions, permissions, notes, snapshot hash
- **`ToolCallEvent`** — single tool invocation: name, input, duration, status, output, optional `subTools` (nested agent calls)
- **`HookPayload`** — raw NDJSON from Claude Code named-pipe hooks. Event types: `agent_start`, `pre_tool_use`, `post_tool_use`, `agent_end`, `agent_stop`, `session_start`, `session_stop`
- **`TokenUsage`** — token counts from API responses (flat or nested under `usage`)
- **`AgentTask`**, **`ConversationTurn`**, **`CompactionEvent`**, **`PermissionEvent`** — sub-arrays on `AgentSession`

## Key Patterns

- **Heavily memoized**: every component uses `memo()`. Keep prop references stable.
- **Session pipeline**: `filterSessions()` → `enrichSessions()` before rendering. `filterSessions` also trims each session's `toolCalls` to only matching calls — filtered cards show a subset, not all. `enrichSessions` injects `snapshotHash` only if not already set (live data wins over restored disk data).
- **Mutually exclusive modes**: compare, cost, and multi-session modes are mutually exclusive — toggling one resets the others (enforced in `useAgentMonitorModes`). Multi-session has a sub-state: `off` → `launcher` → `monitor`.
- **Two timing hooks**: `useElapsedMs` (in `AgentCardControls`) for smooth progress bars, `useElapsedSeconds` for display text — don't mix them.
- **Cost pricing in shared module**: `costCalculator.ts` delegates to `@shared/pricing` — do not duplicate pricing constants here.
- **DOM events for cross-component routing**: `agent-ide:open-session-replay`, `agent-ide:open-diff-review`, `agent-ide:open-multi-session`.
- **Tree vs flat**: `AgentTree` renders only when sessions have parent-child relationships AND no active filter query.

## Data Flow

```
Claude Code hooks (named pipe)
  → src/main/hooks.ts (IPC bridge)
  → AgentEventsContext (renderer state)
  → AgentMonitorManager (enrichment + filtering + modes)
  → AgentMonitorManagerContent (mode router)
  → AgentCard / AgentTree / CostDashboard / ApprovalDialog
```

## Gotchas

- **Approval keyboard shortcuts are global**: `ApprovalDialog` adds a `window.keydown` listener for Y/N/A/Esc. Listener is disabled while the reject-reason input is focused to prevent conflicts.
- **`internal` flag**: sessions with `internal: true` are spawned by the IDE itself (summarizer, CLAUDE.md generator). Components can use this to suppress them from the main list.
- **`pendingPreCompactTokens` + `failedCompactions`**: compaction events arrive as pre/post pairs; the session holds `pendingPreCompactTokens` until `post_compact` merges them. `failedCompactions` counts unpaired pre-compact events.
- **`SubToolCallEvent`**: nested tool calls on `ToolCallEvent.subTools` — populated when the parent tool is `Agent` or `Task`.
- **`snapshotHash`**: captured at session start (git HEAD), used to diff changes the agent made. Set by `useDiffSnapshots` hook in `AgentMonitorManager`, not by the hooks pipeline.
<!-- claude-md-auto:end -->

<!-- claude-md-manual:preserved -->
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
