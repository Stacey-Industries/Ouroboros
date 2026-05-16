# Wave 27 — Subagent UX
## Implementation Plan

**Version target:** v1.8.1 (patch)
**Feature flag:** `agentic.subagentUx` (default `true`)
**Dependencies:** Wave 26 (profile abstraction), Wave 21 (cost dashboard)

---

## Phase breakdown

| Phase | Scope | Key files |
|-------|-------|-----------|
| A | Subagent tracker — main-process lifecycle, IPC, live count + cost rollup | `subagentTracker.ts` (new), IPC |
| B | SubagentPanel transcript view + "Open subagent chat" link + sidebar status chip | `SubagentPanel.tsx` (new), `ToolCallCard.tsx` |
| C | Cancellation + cost dashboard integration (parent + child rollup) | `subagentTracker.ts` cancel, `UsageDashboard` rollup |

## Feature flag

`agentic.subagentUx` (default `true`). When off, legacy agent-cards view only.

## Risks

- Cancellation race — subagent mid-tool-call gets cancelled → parent sees error; treat as normal tool failure.
- Transcript size on long runs → virtualize via `@tanstack/react-virtual` (already installed).

## Acceptance

- Click subagent tool-call card → full transcript opens inline
- Live subagent count chip in session sidebar
- Cancel action terminates subagent; parent continues gracefully
- Cost dashboard shows parent + subagent rollup within 1% of actual
