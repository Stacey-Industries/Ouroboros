<!-- claude-md-auto:start -->
A CLAUDE.md already exists at `src/renderer/components/SessionReplay/CLAUDE.md` — and it's comprehensive and accurate. No new file needs to be written.

`★ Insight ─────────────────────────────────────`
The existing CLAUDE.md captures three genuinely non-obvious things: (1) the `TOOL_COLOR` map is intentionally duplicated across three files — not an oversight, (2) step index 0 is always `session_start` which creates an off-by-one when mapping `currentStep` to `session.toolCalls[]`, and (3) `var(--purple)` needs its fallback because it's missing in some themes. These are exactly the kinds of gotchas that cause bugs when someone edits the module cold.
`─────────────────────────────────────────────────`

The file at `src/renderer/components/SessionReplay/CLAUDE.md` already exists and covers everything needed:
- Architecture diagram with the controller/view split
- All three `TOOL_COLOR` duplication callouts
- Playback timer race condition warning
- Step index 0 offset gotcha
- Full key files table and dependency list

No changes needed.
<!-- claude-md-auto:end -->

<!-- claude-md-manual:preserved -->
# SessionReplay — DVR playback for completed agent sessions

Step-through viewer that converts an `AgentSession`'s tool call history into a scrubable timeline with playback controls.

## Key Files

| File                              | Role                                                                                                                                                                                                            |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`                        | `ReplayStep` and `ReplayState` — domain types. Steps are either `session_start` (index 0) or `tool_call` (1..N).                                                                                                |
| `SessionReplayPanelController.ts` | All state + logic in a single hook (`useSessionReplayController`). Owns playback timer, keyboard navigation, step building, and speed cycling. Returns a `SessionReplayController` interface consumed by views. |
| `SessionReplayPanel.tsx`          | Thin shell — wires the controller hook into the layout. Entry point exported from `index.ts`.                                                                                                                   |
| `SessionReplayPanelSections.tsx`  | Composed layout: header, transport bar (play/pause/speed/seek), step list + detail split pane. Also has the export-to-clipboard button.                                                                         |
| `ReplayTimeline.tsx`              | Horizontal scrubber bar — colored segments per tool call, click-to-seek, keyboard left/right support. Lives in the transport bar, not the detail pane.                                                          |
| `StepList.tsx`                    | Sidebar listing all steps with tool badge, label, duration. Auto-scrolls active step into view.                                                                                                                 |
| `StepDetail.tsx`                  | Right pane — shows tool input/output in monospace, session metadata for start step, status badges, cost estimate.                                                                                               |
| `exportSessionReport.ts`          | Generates a Markdown report of the session (task, duration, model, tokens, all steps with input).                                                                                                               |

## Architecture

```
SessionReplayPanel (shell)
├── useSessionReplayController (hook — all state)
└── SessionReplayLayout (view)
    ├── ReplayHeader
    ├── ReplayTransportBar (play/pause/speed/step/export)
    │   └── ReplayTimeline (scrubber — inside transport bar)
    └── split pane
        ├── StepList (sidebar)
        └── StepDetail (main)
```

Controller/view split: the controller hook owns `currentStep`, `playing`, `speed`, and exposes handlers. Views are stateless (except local hover/scroll state).

## Patterns

- **`TOOL_COLOR` map** is duplicated in `StepDetail.tsx`, `StepList.tsx`, and `ReplayTimeline.tsx` — each component defines its own copy. If adding a new tool, update all three.
- **Playback speeds** cycle through `[1, 2, 4, 8]` — defined as `SPEEDS` constant in the controller.
- **Step index 0** is always `session_start`, tool calls start at index 1.
- **Keyboard nav** is scoped to the panel via `panelRef` + `tabIndex={-1}` — arrows step, space toggles play.
- **All styles are inline `React.CSSProperties`** — no Tailwind in this module. Uses CSS custom properties (`var(--bg)`, `var(--accent)`, etc.) for theming.
- **`memo` on leaf components**: `StepDetail`, `ReplayTimeline`, and `StepList` are wrapped with `React.memo` — replay steps rapidly during auto-play.

## Gotchas

- **`TOOL_COLOR` is duplicated** across `StepDetail.tsx`, `ReplayTimeline.tsx`, and `StepList.tsx`. No shared constant exists — update all three when adding a new tool type.
- **`var(--purple)`** uses a fallback (`var(--purple, #a371f7)`) because it is absent from some themes — do not remove the fallback.
- **Playback timer** (`usePlaybackTimer`) runs a `setInterval` scaled by `speed`. It clears on `playing → false` or unmount. Do not add external timers that race with it.
- **Step index 0** is always `session_start`; tool calls start at index 1. This offset matters when mapping `currentStep` to `session.toolCalls[]`.

## Dependencies

- **`AgentMonitor/types`** — `AgentSession`, `ToolCallEvent` (the source data)
- **`AgentMonitor/costCalculator`** — `formatTokenCount`, `estimateCost`, `formatCost` (used in StepDetail)
- No external libraries beyond React
