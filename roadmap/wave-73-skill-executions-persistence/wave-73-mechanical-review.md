# Wave 73 review — mechanical gap check (re-run after phase-e fix)

**Inputs resolved:**
- Plan: `roadmap/wave-73-skill-executions-persistence/waveplan-73.md`
- Diff range: `7cd42e2..HEAD` (5 commits: phase-a through phase-e)
- Source files touched: 10 (agentChat/* × 6, hooks.ts, hooksSkillExecutionTap.ts, chatOrchestrationBridge.ts, AgentChatConversation.tsx)
- Graph: FALLBACK (graph MCP unavailable — grep + import-following throughout)
- Run timestamp: 2026-05-02T19:25:00Z

---

## Check 1: Forward-trace

**Change sites traced: 8**
**Paths reaching production consumer: 8**
**Paths flagged as dead: 0**

Symbols traced:
- `registerActiveSends` — production caller: `chatOrchestrationBridge.ts:224` (`buildRuntime`)
- `tapSkillExecution` — production callers: `hooks.ts:256` (`dispatchToRenderer`, before suppression guard) and `hooks.ts:306` (`runHookTaps`, covers `dispatchSyntheticHookEvent`)
- `serializeArray` — called by `runInsertMessage` (production write path)
- `migrateV9` — called by `applyColumnMigrations` (production boot path)
- `skillExecutions` on `ProjectAssistantMessageArgs` — consumed by `applyOptionalFields` → `message.skillExecutions` set → `runInsertMessage` serializes to SQLite
- `skillExecutions` write path: `persistCompletedTurn` → projector → `runInsertMessage` → SQLite `skillExecutions TEXT` column
- `skillExecutions` read path: `applyOptionalJsonFields` → `rowToMessage` → `loadThread` IPC → `thread.activeThread.messages`
- `useActiveSkillExecutions` (modified) — now accepts `messages` param; reads live `AgentEventsContext` first, falls back to `lastAssistant?.skillExecutions` from loaded thread; passed to `AgentChatDetailsDrawer` → `SkillHistorySection` render

Full end-to-end chain (fallback trace):
`tapSkillExecution` → `ctx.skillExecutions` on `ActiveStreamContext` → `persistCompletedTurn` → `projectProviderResultToAssistantMessage` → `runInsertMessage` (SQLite) → `applyOptionalJsonFields` (read-back) → IPC `agentChat:loadThread` → `thread.activeThread.messages` → `useActiveSkillExecutions` fallback → `AgentChatDetailsDrawer` → `SkillHistorySection` renders skill list for historical threads.

The dead-value gap from the prior run (phase-e) is resolved: `AgentChatConversation.tsx:62` now passes `thread.activeThread?.messages` to enable the persisted fallback for sessions no longer in live state.

---

## Check 2: Plan universal-quantifier cross-reference

**Universals found in plan: 3**
**Universals where diff covers all instances: 3**
**Universals flagged as narrowed: 0**

1. "both `ctx.sessionId` and `ctx.threadId` must be checked in the tap lookup" → `findContextByParent` line 37: `ctx.sessionId === sessionId || ctx.threadId === sessionId`. ✓
2. "every `migrateVN` is idempotent (guarded internally by `hasCol`)" → `migrateV9` uses `if (!hasCol(c, 'skillExecutions'))` guard. ✓
3. "Skills only accumulate on completed turns" — scope constraint, not a deliverable quantifier; no coverage check required.

---

## Check 3: Export audit

**New exports added: 2**
**Exports with production consumers: 2**
**Exports flagged as dead: 0**

- **`registerActiveSends`** at `hooksSkillExecutionTap.ts:24` — imported and called at `chatOrchestrationBridge.ts:4,224`. Production consumer: `buildRuntime` (invoked on every bridge creation). ✓
- **`tapSkillExecution`** at `hooksSkillExecutionTap.ts:99` — imported at `hooks.ts:43`; called at lines 256 and 306. Production consumers: live hook dispatch path and synthetic hook dispatch path. ✓

---

## Verdict

**PASS**

All three checks ran clean. Check 1 traces all 8 change sites to production consumers, including the full write→SQLite→read→render chain; the phase-e fix connects the persisted `skillExecutions` field to `AgentChatDetailsDrawer` for historical thread loads. Check 2 found 3 universal-quantifier statements, all fully covered. Check 3 found 2 new exports, both with production callers in non-test files.
