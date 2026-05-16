# Wave 57 Phase E — Soak Decision

## Status: Soak Pending

The implementation is complete (Phases A–D committed). The `agentMonitor.subagentDisplay.enabled` flag defaults to `false` pending soak validation.

## What was implemented

- **Phase B (CLI path):** `hooks.ts` now enriches child `agent_start` payloads with `parentSessionId` read from `subagentTracker`, so CLI-spawned subagents appear nested under their parent in the AgentMonitor tree.
- **Phase C (Chat path):** `chatOrchestrationBridgeSubagent.ts` emits synthetic `agent_start`/`agent_end` events when the chat path uses the Task tool, using stable child IDs of the form `chat-sub:{threadId}:{toolCallId}`.
- **Phase D (Renderer):** Confirmed the reducer and `AgentTree` already handle `parentSessionId` correctly; extracted `isLiveSession` predicate to helpers; added reducer integration tests.
- **Phase E (Integration test + docs):** End-to-end integration test covering both paths without Electron; decision document; subsystem docs; removed Phase A diagnostic `console.warn`.

## Soak criteria (for default flip to `true`)

- Zero observed cases of subagent rendering failure
- Zero observed cases of duplicate child emission on chat path
- Zero observed regressions on AgentTree flat-mode display
- At minimum: one chat-path turn that uses subagents + one CLI-path session that uses Task

## Soak observations

_Fill in after soak period completes._

| Date | Scenario | Result | Notes |
|------|----------|--------|-------|
| — | — | — | Pending |

## Decision

**Current decision: Keep flag at `false`. Soak not yet complete.**

To flip: change `agentMonitor.subagentDisplay.enabled` default in `src/main/configSchemaTailExt2.ts` from `false` to `true` once soak criteria above are met.
