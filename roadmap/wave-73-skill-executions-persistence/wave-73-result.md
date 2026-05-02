# Wave 73 — Result Brief: skill-executions-persistence

## What shipped

Skill execution records are now persisted alongside assistant messages in SQLite and restored on thread reload.

### Phase A — Schema
- `SCHEMA_VERSION` bumped 8 → 9; `messages` table gains `skillExecutions TEXT` (JSON array, nullable)
- `migrateV9` adds the column idempotently to existing databases
- `threadStoreSqliteWriters.ts` serializes `skillExecutions` via `serializeArray` helper; readers deserialize via `parseJsonField`

### Phase B — Projector wiring
- `responseProjector.ts`: `ProjectAssistantMessageArgs` accepts `skillExecutions?`; `applyOptionalFields` copies it onto the message when non-empty
- `chatOrchestrationBridgePersist.ts`: `persistCompletedTurn` passes `ctx.skillExecutions` to the projector; `upsertAssistantMessage` forwards it to the store
- Removed the 10-line inline TODO comment block from `chatOrchestrationBridgeProgress.ts`

### Phase C — Hook tap
- `hooksSkillExecutionTap.ts`: new tap module — detects `agent_start` events whose `taskLabel` starts with `/`, accumulates `SkillExecutionRecord` on the matching `ActiveStreamContext` (lookup by `parentSessionId` against both `sessionId` and `threadId`), updates to `completed`/`failed` on `agent_end`
- `hooks.ts`: `tapSkillExecution` called in `dispatchToRenderer` **before** the suppression guard (so skill events captured during active chat sessions), and added to `runHookTaps` (covers `dispatchSyntheticHookEvent` path)
- `chatOrchestrationBridge.ts`: `registerActiveSends(activeSends)` called in `buildRuntime` so the tap has access to in-flight contexts

## Test coverage

| File | Tests |
|---|---|
| `threadStoreSqliteMigrations.test.ts` | Idempotency + v9 column addition |
| `threadStoreSqliteWriters.test.ts` | Param count + skillExecutions round-trip |
| `responseProjector.test.ts` | propagates / omits skillExecutions |
| `hooksSkillExecutionTap.test.ts` | 9 tests — all branches |

**50 tests pass. Typecheck clean. Lint clean.**

## Gates

- [x] tsc --noEmit: clean
- [x] ESLint all touched files: clean
- [x] vitest (4 test files, 50 tests): all pass
- [x] Smoke gate: N/A (no UI changes)

## Commits

1. `feat(wave-73/phase-a): persist skillExecutions to messages SQLite column`
2. `feat(wave-73/phase-b): wire skillExecutions through projector to persistence`
3. `feat(wave-73/phase-c): wire skill execution tap into hook dispatch`
