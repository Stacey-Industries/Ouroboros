<!-- claude-md-auto:start -->

`★ Insight ─────────────────────────────────────`
The file has two sections: an `<!-- claude-md-auto:start/end -->` block (programmatically regenerated) and a `<!-- claude-md-manual:preserved -->` block (hand-written, kept across regenerations). The manual section has a better component tree diagram and clarifies that `ReplayTimeline` lives inside the transport bar — not the detail pane. The auto section adds the `memo` and `tabIndex` gotchas the manual one omits. The merged output should preserve both complementary details.
`─────────────────────────────────────────────────`

The existing CLAUDE.md is well-structured with complementary content in both sections. Here is the generated content that merges the best of both into a clean, non-redundant document:

<!-- claude-md-auto:start -->

# SessionReplay — DVR playback for completed agent sessions

Post-hoc step-through viewer that converts an `AgentSession`'s tool call history into a scrubable timeline with transport controls and per-step detail.

## Files

| File                              | Role                                                                                                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`                        | `ReplayStep` + `ReplayState` — domain types. Steps are `session_start` (index 0) or `tool_call` (1..N).                                                                               |
| `SessionReplayPanelController.ts` | All state + logic in `useSessionReplayController`. Owns playback timer, keyboard nav, step building (`buildReplaySteps`), speed cycling. Returns `SessionReplayController` interface. |
| `SessionReplayPanel.tsx`          | Thin shell — wires the controller hook into the layout. Entry point exported from `index.ts`.                                                                                         |
| `SessionReplayPanelSections.tsx`  | Composed layout: `ReplayHeader`, `ReplayTransportBar` (play/pause/speed/seek/export), split pane wiring.                                                                              |
| `ReplayTimeline.tsx`              | Horizontal scrubber bar — colored segments per tool call, click-to-seek, keyboard left/right. Lives in the transport bar, not the detail pane.                                        |
| `StepList.tsx`                    | Sidebar listing all steps with tool badge, label, duration. Auto-scrolls active step into view.                                                                                       |
| `StepDetail.tsx`                  | Right pane — tool input/output in monospace, session metadata for start step, status badges, cost estimate.                                                                           |
| `exportSessionReport.ts`          | Serializes session to a Markdown report (task, duration, model, tokens, all steps with input).                                                                                        |
| `index.ts`                        | Barrel re-export.                                                                                                                                                                     |

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

Controller/view split: `useSessionReplayController` owns `currentStep`, `playing`, `speed`, and exposes handlers. Views are stateless except for local scroll/hover refs.

Data flow:

```
AgentSession → buildReplaySteps() [useMemo] → ReplayStep[] → controller → view components
```

## Patterns & Conventions

- **Inline style constants**: All `React.CSSProperties` objects are module-level constants (e.g. `TOOL_HEADER_STYLE`, `TRACK_STYLE`). Avoids per-render allocations; keeps JSX readable.
- **`memo` on leaf components**: `StepDetail`, `ReplayTimeline`, and `StepList` are wrapped with `React.memo` — replay steps rapidly during auto-play.
- **CSS custom properties only**: No Tailwind in this directory. Uses `var(--bg)`, `var(--accent)`, `var(--warning)`, `var(--success)`, `var(--border)`, `var(--font-mono)`. Tailwind's scanner doesn't reach inline styles.
- **Keyboard focus**: Panel container (`panelRef`) is `tabIndex={-1}` and receives focus on mount — arrow keys step, space toggles play, without conflicting with the rest of the IDE.
- **Playback speeds**: cycle through `[1, 2, 4, 8]` — defined as `SPEEDS` constant in the controller.

## Gotchas

- **`TOOL_COLOR` is duplicated** across `StepDetail.tsx`, `ReplayTimeline.tsx`, and `StepList.tsx`. No shared constant exists — update all three when adding a new tool type.
- **`var(--purple)`** uses a fallback (`var(--purple, #a371f7)`) because it is absent from some themes — do not remove the fallback.
- **Playback timer** (`usePlaybackTimer`) runs a `setInterval` scaled by `speed`. It clears on `playing → false` or unmount. Do not add external timers that race with it.
- **Step index 0** is always `session_start`; tool calls start at index 1. This offset matters when mapping `currentStep` to `session.toolCalls[]`.

## Dependencies

- **`../AgentMonitor/types`** — `AgentSession` + `ToolCallEvent` are the source data types for the entire feature.
- **`../AgentMonitor/costCalculator`** — `formatTokenCount`, `estimateCost`, `formatCost` used in `StepDetail`.
- No IPC calls — purely derived from session data already in renderer memory.
  <!-- claude-md-auto:end -->
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
| `ReplayTimeline.tsx`              | Horizontal scrubber bar — colored segments per tool call, click-to-seek, keyboard left/right support.                                                                                                           |
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
    └── split pane
        ├── StepList (sidebar)
        └── StepDetail (main)
            └── ReplayTimeline (inside transport bar, not detail)
```

Controller/view split: the controller hook owns `currentStep`, `playing`, `speed`, and exposes handlers. Views are stateless (except local hover/scroll state).

## Patterns

- **`TOOL_COLOR` map** is duplicated in `StepDetail.tsx`, `StepList.tsx`, and `ReplayTimeline.tsx` — each component defines its own copy. If adding a new tool, update all three.
- **Playback speeds** cycle through `[1, 2, 4, 8]` — defined as `SPEEDS` constant in the controller.
- **Step index 0** is always `session_start`, tool calls start at index 1.
- **Keyboard nav** is scoped to the panel via `panelRef` + `tabIndex={-1}` — arrows step, space toggles play.
- **All styles are inline `React.CSSProperties`** — no Tailwind in this module. Uses CSS custom properties (`var(--bg)`, `var(--accent)`, etc.) for theming.

## Dependencies

- **`AgentMonitor/types`** — `AgentSession`, `ToolCallEvent` (the source data)
- **`AgentMonitor/costCalculator`** — `formatTokenCount`, `estimateCost`, `formatCost` (used in StepDetail)
- No external libraries beyond React
