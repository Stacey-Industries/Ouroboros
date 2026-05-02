# Persist `skillExecutions` on assistant message (audit A8)

**Status:** TODO — small focused wave
**Source:** `roadmap/audit-verification-pass.md` Section A8; inline TODO at `src/main/agentChat/chatOrchestrationBridgeProgress.ts:112-121`
**Filed:** 2026-05-02 — A8 closeout

## What's missing

Skill execution records (`SkillExecutionRecord[]`) are tracked in the renderer's `AgentEventsContext` reducer (populated by `SKILL_START` / `SKILL_END` actions from hook events) but never persisted onto the `AgentChatMessageRecord` that lands in SQLite. After a chat thread is closed and re-opened, the renderer can re-derive skill executions from the agent monitor's live state — but only for sessions still in memory. A historical thread reopened weeks later loses its skill execution context.

The TODO comment at `chatOrchestrationBridgeProgress.ts:112-121` is the spec; this wave is implementation.

## Three-step plan (from inline TODO)

1. **Add `skillExecutions?: SkillExecutionRecord[]` to `ActiveStreamContext`** in `chatOrchestrationBridgeTypes.ts`. Initialize empty in `chatOrchestrationBridgeSend.ts`.
2. **Populate it from main-process hook events.** `hooks.ts` already dispatches `agent_start` / `agent_end`. Detect skill-execution signatures (per the renderer's reducer logic) and accumulate records onto the matching `ActiveStreamContext` keyed by session ID.
3. **Pass `ctx.skillExecutions` into `projectProviderResultToAssistantMessage`** and set it on the `AgentChatMessageRecord` before persistence. Update `responseProjector.ts` to handle the new field.

## Acceptance

- A thread completed today shows skill executions in the details drawer when reopened next session
- Existing threads (no skill executions captured pre-wave) show empty list — no regression
- `AgentChatDetailsDrawer.tsx` receives `skillExecutions` from the persisted message rather than from live `AgentEventsContext` (the latter becomes a fallback for in-flight turns only)

## What NOT to pull in

- **Skill registry UI** — separate concern; this wave is persistence only
- **Skill execution analytics dashboard** — could be added later but adds scope
- **Hook event schema changes** — the existing `agent_start` / `agent_end` payloads should carry enough signal; if they don't, that's a hook-protocol wave, not this one

## References

- TODO: `src/main/agentChat/chatOrchestrationBridgeProgress.ts:112-121`
- Renderer reducer: `src/renderer/contexts/AgentEventsContext` (look for `SKILL_START` / `SKILL_END`)
- Persisted shape: `src/shared/types/agentChat.ts:241` (`skillExecutions?: SkillExecutionRecord[]` already declared on the type — just unwired at the persistence layer)
- Audit: `roadmap/audit-verification-pass.md` Section A8
