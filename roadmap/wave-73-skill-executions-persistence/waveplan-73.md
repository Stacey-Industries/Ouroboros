# Wave 73 — Persist skillExecutions on assistant message

## Status

DRAFT · target v2.8.0 · drafted 2026-05-02.

## Context — why this wave exists

Audit item A8 (`roadmap/audit-verification-pass.md` Section A8) identified that `SkillExecutionRecord[]` is tracked live in the renderer's `AgentEventsContext` reducer (populated by `SKILL_START`/`SKILL_END` actions from hook events) but never written to SQLite alongside the `AgentChatMessageRecord` that anchors the turn. When a chat thread is reopened after the app restarts or after a session ends, the renderer can re-derive skill executions for sessions still in memory — but historical threads opened weeks later lose their skill execution context.

The type shape is already in place: `skillExecutions?: SkillExecutionRecord[]` is declared on `ActiveStreamContext` (line 67, `chatOrchestrationBridgeTypes.ts`) and on `AgentChatMessageRecord` (line 241, `src/shared/types/agentChat.ts`). An inline TODO at `chatOrchestrationBridgeProgress.ts:112–121` describes the three implementation steps verbatim. The gap is purely in the wiring and the database column.

The renderer's `AgentChatDetailsDrawer` currently reads skill executions from live `AgentEventsContext` state (always available for in-flight or recent sessions). After this wave, it will receive `skillExecutions` from the persisted message record on load, falling back to live state only for in-flight turns.

## Goal

After this wave, a chat thread completed today shows its skill executions in the details drawer when reopened in a future session. Existing threads (no skill data captured pre-wave) show an empty list — no regression. The persistence path is entirely main-process: skill records are accumulated on `ActiveStreamContext` via a hook tap, passed through `projectProviderResultToAssistantMessage`, and written to a new `skillExecutions` TEXT column in the `messages` SQLite table.

## Locked decisions (Phase 0 — ADR)

ADR file: `roadmap/wave-73-skill-persistence/wave-73-decisions.md`.

1. Skill records are accumulated in the main process on `ActiveStreamContext.skillExecutions`, not forwarded from the renderer's reducer — this avoids a renderer→main IPC round-trip and keeps persistence deterministic.
2. Skill detection reuses the same `extractSkillInfo` heuristic already used by the renderer dispatcher: `agent_start` payloads whose `taskLabel` starts with "/" identify a skill invocation.
3. The new tap function runs BEFORE the suppression guard in `dispatchToRenderer` so that named-pipe skill sub-agent events are captured even during active synthetic chat sessions.
4. `skillExecutions` is stored as a JSON TEXT column (same pattern as `blocks`, `tokenUsage`) — no new table, no schema version bump needed (column migration is idempotent per existing `applyColumnMigrations` pattern).
5. The renderer's `AgentChatDetailsDrawer` falls back to live `AgentEventsContext` skill data for in-flight turns; persisted data is preferred for completed turns loaded from SQLite.

## Scope

**In scope:**

- New `skillExecutions TEXT` column in the `messages` table via `threadStoreSqliteMigrations.ts` (`migrateV9`)
- New `skillExecutions` field in `INSERT_MESSAGE_SQL` and `runInsertMessage` in `threadStoreSqliteWriters.ts`
- `rowToMessage` updated to parse the new column
- `upsertAssistantMessage` in `chatOrchestrationBridgePersist.ts` updated to include `skillExecutions` in the patch
- New `SCHEMA_SQL` column definition for fresh databases
- `ProjectAssistantMessageArgs.skillExecutions` added to `responseProjector.ts`; `projectProviderResultToAssistantMessage` sets `message.skillExecutions`
- `persistCompletedTurn` passes `ctx.skillExecutions` to the projector
- New `tapSkillExecution` function called from `dispatchToRenderer` (before the suppression guard) and `dispatchSyntheticHookEvent` that accumulates skill records on the matching `ActiveStreamContext`
- Registration mechanism so the bridge's `activeSends` map is accessible to the tap function
- `SCHEMA_VERSION` bumped from 8 to 9 in `threadStoreSqliteHelpers.ts`
- Unit tests covering the tap logic and the projector's new field

**Out of scope:**

- Skill registry UI — separate concern; deferred
- Skill execution analytics dashboard — future wave
- Hook event schema changes — existing `agent_start`/`agent_end` payloads carry enough signal; if they don't, that's a hook-protocol wave
- Renderer `AgentChatDetailsDrawer` changes — the drawer already consumes `skillExecutions` from the message record per the existing type; no renderer change required
- `persistCancelledTurn` and `persistFailedTurnWithContent` — skills only accumulate on completed turns; partial turn persistence does not carry skill data

## Phases

| Phase | Topic | Implementer | Notes |
|---|---|---|---|
| A | SQLite schema + writers + readers | sonnet-implementer | Add `skillExecutions TEXT` column to schema SQL, `SCHEMA_VERSION` 8→9, `migrateV9`, `INSERT_MESSAGE_SQL`, `runInsertMessage`, `rowToMessage`. Deliverable: column round-trips through insert→read. |
| B | Projector + persistence wiring | sonnet-implementer | Add `skillExecutions` to `ProjectAssistantMessageArgs`; wire through `projectProviderResultToAssistantMessage`; update `upsertAssistantMessage` patch; pass `ctx.skillExecutions` in `persistCompletedTurn`. |
| C | Main-process skill tap | sonnet-implementer | New `tapSkillExecution` in `hooksSkillExecutionTap.ts`; registration function so the bridge's `activeSends` is accessible; call site in `dispatchToRenderer` (before suppression guard) and in `dispatchSyntheticHookEvent`. |
| D | Tests + wrap | sonnet-implementer | Unit tests for tap (skill detection, accumulate start/end, non-skill ignored), projector (new field propagated), SQLite round-trip. Full lint + typecheck. |

### Phase ordering

A → B → C → D (sequential). B depends on A's schema; C depends on B's `ctx.skillExecutions` field being present; D covers all prior phases.

## Risks

| Risk | Mitigation |
|---|---|
| Skill tap runs BEFORE suppression guard — may observe real named-pipe events that should be suppressed for other purposes | Tap only reads `parentSessionId` + `taskLabel` + `sessionId` and accumulates into `activeSends` — it does not forward to renderer, so suppression semantics are unaffected |
| `activeSends` is keyed by `taskId`, not by `sessionId` — lookup by `parentSessionId` must scan all contexts | Scan is O(activeSends.size); at most one active send per thread; cost is negligible |
| `agent_start` `parentSessionId` for skills may be the provider session ID, not the thread ID — lookup would miss | Log and verify at implementation time; both `ctx.sessionId` and `ctx.threadId` must be checked in the tap lookup |
| Column migration runs on every boot per idempotent-migration policy — safe if `hasCol` guard is correct | Pattern is identical to `migrateV6`/`migrateV8`; existing tests cover the guard |
| `skillExecutions` persisted on completed turns only; cancelled/failed turns accumulate records but don't persist them | Acceptable scope; partial-turn persistence is a separate concern; noted as out-of-scope |

## Test coverage by phase

| Phase | Unit | Integration | Notes |
|---|---|---|---|
| A | `threadStoreSqliteWriters.test.ts` — insert with `skillExecutions` round-trips; `rowToMessage` parses JSON; migration is idempotent | n/a | Schema migration tested via existing migration test pattern |
| B | `responseProjector.test.ts` — `projectProviderResultToAssistantMessage` propagates `skillExecutions`; `upsertAssistantMessage` patch carries field | n/a | Persistence wiring tested at unit level |
| C | `hooksSkillExecutionTap.test.ts` — `agent_start` with "/" label accumulates record; `agent_end` updates status; non-skill events no-op; wrong `parentSessionId` no-op | n/a | Tap is pure logic; no IPC needed |
| D | n/a — wrap phase | n/a | Full lint + typecheck; targeted vitest on touched test files |

## Acceptance criteria

- [ ] `messages` table has a `skillExecutions TEXT` column after migration runs on an existing DB
- [ ] `runInsertMessage` writes `JSON.stringify(msg.skillExecutions)` into the column (null when empty/undefined)
- [ ] `rowToMessage` parses the column back to `SkillExecutionRecord[]`
- [ ] `projectProviderResultToAssistantMessage` sets `message.skillExecutions` when `args.skillExecutions` is non-empty
- [ ] `persistCompletedTurn` passes `ctx.skillExecutions` to the projector args
- [ ] `upsertAssistantMessage` includes `skillExecutions` in the update patch
- [ ] `tapSkillExecution` on `agent_start` with `taskLabel` starting "/" finds the matching `ActiveStreamContext` by `parentSessionId` and pushes a `SkillExecutionRecord` with `status: 'running'`
- [ ] `tapSkillExecution` on `agent_end` finds the context and updates the matching record's `status`, `completedAt`, `durationMs`
- [ ] `tapSkillExecution` is a no-op when `parentSessionId` does not match any active context
- [ ] A chat thread whose assistant turn invoked a skill shows that skill in the details drawer after the thread is reloaded from SQLite
- [ ] Existing threads without skill data load with `skillExecutions: undefined` — no crash, no regression

## Verification

### Per-phase experiential observation

| Phase | Observation point | Path to it | What "working" looks like there |
|---|---|---|---|
| A | Internal — no observation point | n/a | Schema column addition and read-back are DB-internal; no user-facing change in this phase. |
| B | Internal — no observation point | n/a | Projector and persistence wiring are internal; skill data doesn't reach SQLite until Phase C produces records to persist. |
| C | Internal — no observation point | n/a | The tap accumulates records on `ActiveStreamContext` and `persistCompletedTurn` writes them, but verifying the full chain requires a running IDE session with a skill-invoking agent turn — not observable from this implementation context. |
| D | Cole reopens a chat thread that invoked a skill in a prior session → the details drawer shows the skill execution entry | SQLite `messages` row `skillExecutions` column → `rowToMessage` → `AgentChatThreadStore.loadThread` → IPC `agentChat:loadThread` → renderer `AgentChatDetailsDrawer` reads `message.skillExecutions` → drawer renders skill list | Drawer shows the skill name, duration, and status for a completed skill invocation without requiring the original session to be live in memory |

### Data-shape probes

```ts
// After a completed chat turn that invoked a skill, query the messages table:
import Database from 'better-sqlite3';
const db = new Database('<threadsDir>/threads.db');
const row = db.prepare(`SELECT skillExecutions FROM messages WHERE id = 'agent-chat:<sessionId>:assistant'`).get();
const parsed = JSON.parse(row.skillExecutions);
// Expected: [{ skillName: 'some-skill', agentId: '<childSessionId>', status: 'completed', ... }]
console.assert(Array.isArray(parsed) && parsed[0].skillName);
```

## Files the next agent should read first

1. `roadmap/future/skill-executions-persistence.md` — source plan with the three-step inline TODO
2. `roadmap/wave-73-skill-persistence/wave-73-decisions.md` — ADR
3. `src/main/agentChat/chatOrchestrationBridgeTypes.ts` — `ActiveStreamContext` (field already declared at line 67)
4. `src/shared/types/agentChat.ts:225–251` — `AgentChatMessageRecord` (`skillExecutions` field at line 241)
5. `src/shared/types/ruleActivity.ts` — `SkillExecutionRecord` shape
6. `src/main/agentChat/chatOrchestrationBridgeProgress.ts:112–121` — the inline TODO being implemented
7. `src/main/agentChat/chatOrchestrationBridgePersist.ts` — `persistCompletedTurn` and `upsertAssistantMessage`
8. `src/main/agentChat/responseProjector.ts` — `ProjectAssistantMessageArgs` and `projectProviderResultToAssistantMessage`
9. `src/main/agentChat/threadStoreSqliteWriters.ts` — `INSERT_MESSAGE_SQL` and `runInsertMessage`
10. `src/main/agentChat/threadStoreSqliteMigrations.ts` — existing migration pattern
11. `src/main/agentChat/threadStoreSqliteHelpers.ts` — `rowToMessage`, `SCHEMA_VERSION`, `SCHEMA_SQL`
12. `src/main/hooks.ts` — `dispatchToRenderer` (suppression guard location) and `dispatchSyntheticHookEvent`
13. `src/renderer/hooks/useAgentEvents.ruleSkillDispatchers.ts` — `extractSkillInfo` heuristic (reuse in tap)
14. `src/main/hooksSubagentTap.ts` — tap pattern exemplar

## Note to the implementer

This wave closes a narrow, well-specified gap. The type declarations are already in place — `ActiveStreamContext.skillExecutions` and `AgentChatMessageRecord.skillExecutions` both exist. The work is entirely plumbing: a DB column, a tap function, and connecting four call sites. Resist any temptation to restructure the renderer's `AgentChatDetailsDrawer` or the hook event pipeline beyond what the plan specifies.

The trickiest part is the tap's lookup: `parentSessionId` in a real `agent_start` hook event will be the provider session ID (the Claude Code UUID), not the thread ID. The `ActiveStreamContext` stores both: `ctx.sessionId` (provider session, set from `created.session.id`) and `ctx.threadId`. The tap must check both when scanning `activeSends`. Log the lookup result at `debug` level so future debugging is possible without instrumentation.

Before declaring a phase complete, restate the observation point from the Verification table in your own words and describe what you actually observed there. If you could not observe it directly — no live IDE, no triggered chat session, no rendered panel — say so explicitly. Do not substitute "tests pass" for runtime observation. Tests passing at the unit boundary is necessary but not sufficient.

## Orchestrator dispatch checklist

1. Verify ADR file exists at `roadmap/wave-73-skill-persistence/wave-73-decisions.md` before dispatching any implementer.
2. **Phase A** — dispatch `sonnet-implementer`. Deliverable: `threadStoreSqliteHelpers.ts` schema SQL + `SCHEMA_VERSION` bump + `SCHEMA_SQL` column; `threadStoreSqliteMigrations.ts` `migrateV9`; `threadStoreSqliteWriters.ts` `INSERT_MESSAGE_SQL` + `runInsertMessage` + `UPSERT` if needed; `rowToMessage` parse. Gate: `npx vitest run src/main/agentChat/threadStoreSqliteWriters.test.ts` passes with new test cases.
3. **Phase B** — dispatch `sonnet-implementer`. Deliverable: `responseProjector.ts` `ProjectAssistantMessageArgs.skillExecutions`; `projectProviderResultToAssistantMessage` sets field; `chatOrchestrationBridgePersist.ts` `persistCompletedTurn` passes `ctx.skillExecutions`; `upsertAssistantMessage` patch includes field. Gate: `npx vitest run src/main/agentChat/responseProjector.test.ts` passes; typecheck clean.
4. **Phase C** — dispatch `sonnet-implementer`. Deliverable: new `src/main/hooksSkillExecutionTap.ts` with `registerActiveSends`, `tapSkillExecution`; `hooks.ts` calls `tapSkillExecution` before suppression guard in `dispatchToRenderer` and after `runHookTaps` in `dispatchSyntheticHookEvent`; `chatOrchestrationBridge.ts` calls `registerActiveSends` on bridge creation. Gate: `npx vitest run src/main/hooksSkillExecutionTap.test.ts` passes.
5. **Phase D (wrap)** — dispatch `sonnet-implementer`. Full lint (`npx eslint src/main/agentChat/ src/main/hooksSkillExecutionTap.ts`), full typecheck (`npx tsc --noEmit`), targeted vitest on all touched test files. Run `/review 73`. Smoke gate: n/a (not UI-bearing per wave scope).
6. Remove the inline TODO comment at `chatOrchestrationBridgeProgress.ts:112–121` in the Phase B or C commit.
