# Agent Monitor — Subagent Linkage

Wave 57 added support for nesting subagent sessions under their parent in the
AgentMonitor tree. This document describes how linkage works end-to-end for both
the CLI path and the chat path.

## Feature flag

All subagent-display behaviour is gated on:

```
agentMonitor.subagentDisplay.enabled   (default: false)
```

When this flag is `false`, every enrichment function is a pure no-op — the
AgentMonitor continues to show all sessions flat, exactly as before.

To enable during development or soak testing, open the settings panel and toggle
**Agent Monitor › Show subagent nesting**, or edit `config.json` directly.

## CLI path (spawned sessions)

When a top-level Claude Code terminal session uses the `Task` tool to spawn a
subagent, the CLI emits `pre_tool_use` and `agent_start` hook events via the
named-pipe server (`src/main/hooks.ts`).

**Recording the parent–child mapping:**
`subagentTracker.onTaskToolPreUse` fires on the `pre_tool_use` event. The Task
tool input includes `childSessionId` (fast path). `subagentTracker.recordStart`
stores `{ childSessionId → parentSessionId }`.

**Enriching the `agent_start` payload:**
`enrichAgentStartPayload` (`src/main/hooksAgentStartEnrich.ts`) runs on every
incoming hook payload. When:
- the flag is enabled,
- the event type is `agent_start`,
- `parentSessionId` is not already set, and
- `subagentTracker` has a record for the child session ID,

it returns a new payload object with `parentSessionId` filled in from the
tracker. The original payload is never mutated.

**Renderer state:**
The enriched payload is forwarded to the renderer via `dispatchSyntheticHookEvent`.
The `AGENT_START` reducer in `useAgentEvents.helpers.ts` reads `parentSessionId`
from the action and stores it on the `AgentSession` record. `AgentTree` then
renders child sessions indented under their parent.

## Chat path (Task tool in chat sessions)

When the chat orchestration bridge processes a streaming response and encounters
a Task tool call, `chatOrchestrationBridgeProgressBlocks.ts` calls the functions
in `chatOrchestrationBridgeSubagent.ts`.

**Stable child session IDs:**
Child sessions receive deterministic IDs in the format:

```
chat-sub:{threadId}:{toolCallId}
```

This format ensures that the same Task invocation always maps to the same session
ID regardless of stream replay or reconnect.

**Emission:**
`emitChatSubagentStart(ctx, { toolCallId })` dispatches a synthetic `agent_start`
event with `parentSessionId: ctx.threadId`. `emitChatSubagentEnd(ctx, { toolCallId }, status)`
dispatches a matching `agent_end`.

Both functions are idempotent — repeated calls with the same `toolCallId` are
silently ignored. Idempotence is enforced via `ctx.chatSubagentEmissions`, a
`Map<toolCallId, { started, ended }>` that lives on `ActiveStreamContext`.

`closeOpenSubagents(ctx, status)` is called when the parent stream terminates
(cancel, failure, or reset) to ensure any started-but-not-ended children receive
a closing event.

## Renderer reducer

The renderer reducer (`useAgentEvents.helpers.ts` → `startSession`) resolves
`parentSessionId` in priority order:

1. `action.parentSessionId` — explicit value from the payload (both paths set this).
2. `state.pendingSubagentLinks[sessionId]` — prior `LINK_SUBAGENT` action (fast path).
3. `findTemporalParent` — 30-second timestamp window fallback for sessions where
   no explicit link arrived before `agent_start`.

Once resolved, `parentSessionId` is stored on `AgentSession` and `AgentTree`
renders the hierarchy.

## Known limits

- **Single-level nesting only.** A subagent spawning its own sub-subagents will
  attach those children to the subagent row, but the tree does not recurse beyond
  one visual level in the current UI.
- **Temporal fallback window is 30 seconds.** If a `pre_tool_use` event and the
  corresponding `agent_start` are more than 30 seconds apart (e.g. very slow
  model cold-start), temporal linking fails and the session appears at the top
  level.
- **Chat subagents show start/end only.** The bridge emits `agent_start` and
  `agent_end` for the child session; it does not capture individual tool calls
  made inside the subagent's execution. Sub-tool detail is only available for
  CLI-path sessions via the hook stream.
- **Flag defaults to `false`.** See `roadmap/wave-57-phase-e-decision.md` for the
  soak criteria that must be met before flipping the default to `true`.

## How to disable

Set `agentMonitor.subagentDisplay.enabled` to `false` in settings or in
`config.json`. All linkage code becomes no-ops immediately — no restart required
for the main process; renderer picks up the config change on next event.
