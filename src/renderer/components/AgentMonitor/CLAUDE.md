<!-- claude-md-manual:preserved -->
# AgentMonitor — Real-time agent session monitoring dashboard

Displays live and historical Claude Code agent sessions with tool call feeds, timelines, cost tracking, approval dialogs, and session comparison.

## Architecture

Top-level orchestration flows through `AgentMonitorManager.tsx` (wires contexts, modes, templates, notifications) → `AgentMonitorManagerContent.tsx` (mode router: normal / compare / cost / multi-session) → `AgentMonitorManagerPanels.tsx` (toolbar, search, compare panels, empty state) → `AgentCard.tsx` → layout sub-components.

Tool call visualization: `ToolCallFeed.tsx` (chronological feed) and `ToolCallTimeline.tsx` (Gantt-style view) — controlled by a view-toggle on each card.

Cost tracking: `CostDashboard.tsx` aggregates via `costCalculator.ts`, which delegates all pricing to `@shared/pricing`. Do not duplicate pricing constants here.

## Key Patterns

- **Heavily memoized**: Every component uses `memo()`. Keep prop references stable to avoid re-renders.
- **Session enrichment pipeline**: `filterSessions()` → `enrichSessions()` (adds snapshot hashes) before rendering. `filterSessions` also trims each session's `toolCalls` to only matching calls — filtered cards show a subset.
- **Mutually exclusive modes**: Compare, cost, and multi-session modes are mutually exclusive — toggling one disables others (enforced in `useAgentMonitorModes`). Multi-session has a sub-state: `off` → `launcher` → `monitor`.
- **Two timing hooks**: `useElapsedMs` (in `AgentCardControls`) for smooth progress bars, `useElapsedSeconds` for display text — don't mix them.
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
