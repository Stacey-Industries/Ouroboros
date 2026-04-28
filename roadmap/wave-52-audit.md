# Wave 52 — Telemetry Surface Audit

Authored 2026-04-27 as Phase A of Wave 52 (Telemetry Parity).

## Methodology

Inventory was built by grepping `src/main/` for the canonical emit verbs (`getTelemetryStore`,
`getOutcomeObserver`, `enqueueTrace`, `recordOutcome`, `recordTrace`, `recordInvocation`, `record(payload)`)
plus the JSONL sink path conventions (`appendFile.*\.jsonl`, references to `~/.ouroboros/telemetry/`,
and helpers in `app.getPath('userData')`). Each match was opened, traced to its callers, and read
end-to-end to confirm whether the emit fires only inside the IDE main process, fires from a hook
script (so already external-capable), or could be relocated to a hook event.

Classification rubric, in priority order:

1. **`global-hookable`** — emit happens inside a hook tap that runs in the IDE main process **but** the
   triggering event already arrives via the global hook script in `assets/hooks/*.mjs`. The hook fires
   for both internal and external sessions today; the only gap (when present) is that the IDE main
   process must be running to receive the named-pipe event. Migration is "let the hook script also
   write JSONL when the IDE pipe is unreachable."
2. **`buffer-via-hook`** — emit is IDE-only today and the data needed is either already in a hook
   payload or computable from `~/.claude/settings.json` + cwd at hook time. Migration is "add a new
   hook script + drain handler" using the Wave 52 Phase B queue infrastructure.
3. **`fundamentally-IDE-only`** — emit observes state that only the IDE main process can see (its
   own subprocess stdout, in-process renderer events, IDE-side orchestration objects). Accept the
   reduction; partial-capture options noted where they exist.

## Summary

| Classification         | Count | Notes                                                                                          |
| ---------------------- | ----: | ---------------------------------------------------------------------------------------------- |
| `global-hookable`      |     6 | Already parity-capable in principle; gap is only "what if IDE pipe is closed when hook fires"  |
| `buffer-via-hook`      |     5 | New hook scripts needed; queue-and-drain pipe                                                  |
| `fundamentally-IDE-only` | 5   | Accepted gaps; orchestration / IDE-side process inspection                                     |

Total emit sites surveyed: **16** distinct surfaces (some are co-located in the same file).

## Emit sites

### 1. `src/main/hooks.ts:250` — `getTelemetryStore().record(rawPayload)`

- **What it logs:** Every hook event the IDE main process receives — `events` table row per
  `pre_tool_use`, `post_tool_use`, `user_prompt_submit`, `session_start`, `session_end`, `agent_start`,
  `agent_end`, `agent_stop`, `task_completed`, etc. Payload includes `toolName`, `toolInput` (redacted),
  `correlationId`, `ideSpawned`.
- **Current sink:** SQLite `events` table via `telemetryStore`.
- **Classification:** `global-hookable`.
- **Why hookable:** The hook script (`assets/hooks/pre_tool_use.mjs`, plus the rest of that family)
  already fires for both internal and external sessions and POSTs the payload to the IDE's named
  pipe (`sendEvent`). Only when the IDE is **not running** is the event lost — `sendEvent` returns
  `false` and the script silently exits 0. Wave 52 closes that gap.
- **Effort:** **S** — extend `assets/hooks/lib/ouroboros.mjs` (`sendEvent` already exists; pair it
  with a JSONL fallback ~80 LOC). Drain handler that re-feeds into `telemetryStore.record()` is
  ~140 LOC. Tests: schema dedup by event recordId. ~250 LOC total.

### 2. `src/main/hooks.ts:252,310` — `getOutcomeObserver().noteToolUseEvent(...)`

- **What it logs:** Memory only — no persistence. Stores most-recent `(eventId, correlationId, ts)`
  per session for a 30 s correlation window, used by `onPtyExit` and `onConflictSignal` to attach
  outcomes to the original tool use.
- **Current sink:** In-memory map; no file or DB write. Outcomes ultimately land in
  `telemetryStore.recordOutcome()` (see §6).
- **Classification:** `global-hookable` (because it is a downstream of #1; once #1 is parity-capable,
  the in-memory bookkeeping happens identically on next IDE launch when the drain replays events).
- **Effort:** Folds into #1 — no separate work.

### 3. `src/main/orchestration/providers/mcpSpawnCostTelemetry.ts:72` — `emitMcpSpawnCost`

- **What it logs:** Per-spawn MCP routing cost: `spawnId`, `routingDecision`, `internalMcpScope`,
  `transport`, `codemodeEnabled`, `mcpConfigBytes`, `serverCount`, `tokenEstimate`, `serversIncluded`.
- **Current sink:** `~/.ouroboros/telemetry/mcp-spawn-cost.jsonl` (open-append-close per record).
- **Classification:** `buffer-via-hook`.
- **Required hook event:** `SessionStart`.
- **Why hookable:** Spawn metadata is determinable from the SessionStart payload (`cwd`, model env)
  plus a small read of the workspace's `.claude/settings.json` to enumerate MCP servers. The
  `routingDecision` distinction (`always` / `task-gated` / `never`) is purely a function of the
  scope config and the prompt's library hints, and the hook can reproduce it (or default to "external"
  and tag accordingly). `mcpConfigBytes` and `serverCount` are computed from the same JSON the hook
  reads.
- **Effort:** **S** — Phase C of Wave 52 already targets this. ~140 LOC hook + ~140 LOC drain handler
  + tests.
- **Risk:** External sessions don't share the IDE's `internalMcpRoutingPolicy` runtime state, so a few
  fields (`routingDecision`, `codemodeEnabled`) are best computed as "what would the IDE have routed
  to given this config" or marked `external` literally. Document at hook contract level.

### 4. `src/main/hooksGraphUsageTap.ts:74` — `tapGraphUsage`

- **What it logs:** Per-PreToolUse for `Grep`/`Read`: tool name, classified shape, args summary,
  `ideSpawned`, `correlationId`. Used to study graph-vs-grep tool selection.
- **Current sink:** `~/.ouroboros/telemetry/graph-usage.jsonl`.
- **Classification:** `global-hookable`.
- **Why hookable:** This tap **already fires for external sessions** because it runs inside the
  `dispatchToRenderer` flow that processes the pipe-delivered hook event. The tap's `ideSpawned`
  field is set from the hook payload itself, not from IDE state. The only gap is again "what if the
  IDE pipe is unreachable" — same as #1.
- **Effort:** Folds into #1's JSONL fallback. The classifier is pure (`classifyShape`) so it can
  also be invoked client-side in the hook script if we want symmetry without the round-trip.
  ~30 LOC of additional drain logic to write into `graph-usage.jsonl` from drained events.

### 5. `src/main/hooksContextOutcome.ts` (`tapContextOutcomeObserver`) → `contextOutcomeWriter.recordOutcome`

- **What it logs:** Per turn: which files were in the context packet vs which were touched by file-
  shaped tools (`used` / `missed` / `unused` classification). Records also carry `decisionId`,
  `toolKind`, etc.
- **Current sink:** `{userData}/context-outcomes-YYYY-MM-DD.jsonl` (Wave 29.5 dated rotation).
- **Classification:** `fundamentally-IDE-only`.
- **Why not hookable:** The packet-vs-touch comparison requires the in-memory `ContextPacket` for the
  current turn, which exists only in `contextPacketBuilder.ts` inside the IDE main process. External
  sessions never produce a packet (they don't use the IDE's context preparation pipeline); they go
  straight from prompt to model.
- **Partial capture:** External sessions could emit "files touched per turn" via PostToolUse hook so
  the missed-vs-used reduces to a one-sided signal. Decide in Wave 53a whether one-sided data is
  useful enough to spec.
- **Effort:** N/A for parity. ~M if we add the one-sided variant.

### 6. `src/main/telemetry/outcomeObserver.ts:123,144` — `store.recordOutcome` (PTY exit, conflict)

- **What it logs:** `outcomes` row keyed on the `events.id` from #1. `kind:'exit'` carries
  `exitCode`, `durationMs`, `stderrHash`, confidence; `kind:'conflict'` carries `[filePath]`.
- **Current sink:** SQLite `outcomes` table.
- **Classification:** Mixed.
  - **PTY-exit outcomes:** `fundamentally-IDE-only` — the PTY only exists when the IDE main process
    is the parent. External terminal sessions are user-spawned and the IDE never sees their exit.
  - **Conflict outcomes:** `global-hookable` — driven by `tapEditProvenance` which reads
    `post_tool_use` events that already arrive via the hook pipe. Folds into #1.
- **Effort:** Conflict half folds into #1. PTY-exit half is the accepted reduction; document.

### 7. `src/main/telemetry/traceBatcher.ts:108` (via `enqueueTrace`) — `claudeStreamJsonRunner.ts:178,268,276` and `claudeWarmStreamJsonRunner.ts:188`

- **What it logs:** Process-level traces for IDE-orchestrated Claude Code spawns: `kind:'spawn'`
  (argv redacted, cwdHash), `kind:'stdin'` (prompt bytes + 120-char head), `kind:'stdout'` (chunk
  bytes + redacted head, sampled 1-in-10 under load).
- **Current sink:** SQLite `orchestration_traces` table via the trace batcher.
- **Classification:** `fundamentally-IDE-only`.
- **Why not hookable:** Argv, stdin, stdout chunks are visible only because the IDE main process is
  the parent of the spawned `claude` subprocess. External CLI sessions are run by the user's shell;
  no hook event exposes argv or stream chunks. Hook payloads don't include the model's stdout.
- **Partial capture:** SessionStart hook can reproduce "spawn" trace shape (argv, cwdHash) for
  external sessions, since the launch command is implicit. stdin/stdout traces have no analogue.
- **Effort:** ~M for the spawn-only partial migration (add to Phase C's SessionStart hook). Worth
  doing alongside #3 — same hook event, additive payload.

### 8. `src/main/research/preToolResearchOrchestrator.ts:94,190` — `store.recordTrace` (`pre-tool-research-fire`, `pre-tool-research-dryrun`)

- **What it logs:** Per pre-tool decision: `decision`, `library`, `correlationId` (and whether
  research actually ran or was skipped because `preEditDryRunOnly` was set).
- **Current sink:** SQLite `orchestration_traces` table.
- **Classification:** `fundamentally-IDE-only`.
- **Why not hookable:** The research orchestrator fires inside a tap that runs in the IDE main
  process and references in-memory state (`CorrectionStore`, dry-run flag, cache check). Hook
  scripts don't have the cache or correction store; they'd produce a different decision.
- **Partial capture:** A hook-side stub that emits "would-have-considered: library X" for external
  sessions is feasible but the decision wouldn't match the IDE-side decision algorithm — the data
  would be a different signal, not a parity signal.
- **Effort:** Accept reduction.

### 9. `src/main/research/factClaimPauseOrchestrator.ts:125,...` — `store.recordTrace` (`fact-claim-fire`, `fact-claim-skip`, `fact-claim-disabled`)

- **What it logs:** Per fact-claim detection in the agent's text stream: `library`, `confidence`,
  `offset`, `sessionId`. Tracks both pause-fires and skips.
- **Current sink:** SQLite `orchestration_traces`.
- **Classification:** `fundamentally-IDE-only`.
- **Why not hookable:** Fact-claim detection runs against the model's stdout chunks as they stream.
  External sessions' stdout is not visible to any hook. No proxy event captures this.
- **Effort:** Accept reduction.

### 10. `src/main/research/researchSubagent.ts:259` — `store.recordInvocation`

- **What it logs:** Per research subagent invocation: `correlationId`, `topic`, `triggerReason`,
  `hitCache`, `latencyMs`, `artifactHash`.
- **Current sink:** SQLite `research_invocations` table.
- **Classification:** `fundamentally-IDE-only`.
- **Why not hookable:** Research invocations fire from the IDE-side orchestration layer; external
  sessions don't have an in-process research path. Even if they did, `latencyMs` and `hitCache` are
  process-internal observations.
- **Effort:** Accept reduction.

### 11. `src/main/session/sessionLifecycle.ts:14` — `store.record({type:'session.created'|'session.activated'|'session.archived'})`

- **What it logs:** IDE session lifecycle (chat threads / work sessions inside the IDE), not Claude
  Code sessions. Payload: `projectRoot`, `worktree`, `worktreePath`.
- **Current sink:** SQLite `events` table (lifecycle types are cast through `unknown`).
- **Classification:** `fundamentally-IDE-only`.
- **Why not hookable:** "Session" here is the IDE's renderer concept (a chat thread or work tab),
  not a Claude Code CLI session. There's no external analogue and no hook event that fires on it.
- **Effort:** Accept reduction.

### 12. `src/main/router/qualitySignalCollector.ts:182` — `flushAnnotations` (regeneration / correction / abort / git-commit)

- **What it logs:** Quality signals annotating router decisions: `chat_regenerate`,
  `chat_correction`, `terminal_natural_stop`, `terminal_user_abort`, `task_completed`,
  `code_committed`. Signals join back to router decisions by `traceId` / `sessionId`.
- **Current sink:** `{userData}/router-quality-signals.jsonl`.
- **Classification:** Mixed.
  - **`terminal_natural_stop`/`terminal_user_abort`/`task_completed`:** `global-hookable`.
    `trackSessionEnd` is invoked from `hooksSessionHandlers.ts` on session-end / agent-end /
    task-completed events that arrive via the hook pipe. External sessions already deliver these
    events when the IDE is up; only the "IDE not running" gap matters — same fix as #1.
  - **`code_committed`:** `global-hookable` — fires from a 2/5-minute timer after the session-end
    event. Once #1 is parity-capable, the timer fires in the IDE on next launch by replaying the
    session-end event. (Caveat: post-restart drain delay means commits older than ~5 min won't be
    correlated; document.)
  - **`chat_regenerate`/`chat_correction`:** `fundamentally-IDE-only`. `trackChatTurn` is called from
    `chatOrchestrationRequestSupport.ts` — that's the IDE chat path, not external CLI sessions.
    External CLI doesn't have the regen/correction-prefix detection feature at all.
- **Effort:** Terminal signals fold into #1 (no extra LOC beyond the JSONL fallback). Chat signals
  are accepted reduction.

### 13. `src/main/router/routerLogger.ts:79` — `logger.log(entry)` (router decisions)

- **What it logs:** Per chat-prompt routing decision: tier, model, confidence, layer1/2/3 results,
  feature vector, prompt hash. Also `logOverride` records when the user picks a different model
  than the router suggested.
- **Current sink:** `{userData}/router-decisions.jsonl` (rotated to dated file at 10 MB).
- **Classification:** `fundamentally-IDE-only`.
- **Why not hookable:** Routing decisions are made inside `orchestration.ts` for IDE chat sessions
  and `routerShadow.ts` for terminal `user_prompt_submit` events. The latter requires the hook
  pipe — external sessions while the IDE is up already work; external sessions while the IDE is
  down lose the shadow-route. The routing computation also needs the bundled classifier weights
  and Layer-3 LLM client, which the hook doesn't have.
- **Partial capture:** Could add a hook script that captures `user_prompt_submit` payload to JSONL
  for offline shadow-routing during IDE startup drain. That's doable and matches the shadow-route
  pattern. **Recommend doing this** — it converts what is otherwise a fundamentally-IDE-only surface
  into a `buffer-via-hook` one (the hook stores raw prompt + cwd + ts, and IDE-side drain runs the
  router on it post-hoc). Reclassifying contingent on Wave 53a accepting the post-hoc shadow path.
- **Effort:** **M** if we accept post-hoc shadow routing — ~80 LOC hook (just dumps the prompt
  payload), ~250 LOC drain handler that runs the router and writes the resulting decision JSONL.
  Otherwise accept reduction.

### 14. `src/main/router/qualitySignalCollector.ts` (continuation) — git-commit timer state

- Already covered under #12.

### 15. `src/main/orchestration/contextDecisionWriter.ts:133` and `contextOutcomeWriter.ts:143` — `recordDecision` / `recordOutcome`

- **What it logs:** Per file-selection decision (which files context selector picked, what their
  scores were, why) and per-turn outcome (above, #5).
- **Current sink:** `{userData}/context-decisions-YYYY-MM-DD.jsonl`,
  `{userData}/context-outcomes-YYYY-MM-DD.jsonl`.
- **Classification:** `fundamentally-IDE-only`.
- **Why not hookable:** Context selection happens inside `contextPacketBuilder.ts` in the IDE main
  process; external sessions don't run context selection.
- **Effort:** Accept reduction.

### 16. `src/main/research/researchOutcomeWriter.ts:168` and `research/correctionWriter.ts:137` — research outcomes / corrections

- **What it logs:** Research-attributed file touches (accepted/reverted/unknown) and self-correction
  records (when the user corrects an agent's library claim).
- **Current sink:** `{userData}/research-outcomes-YYYY-MM-DD.jsonl`,
  `{userData}/corrections-YYYY-MM-DD.jsonl`.
- **Classification:** `fundamentally-IDE-only`.
- **Why not hookable:** Both are downstream of #10 (research invocations) and the IDE chat correction
  detection path. External sessions don't run either.
- **Effort:** Accept reduction.

### 17. `src/main/perfStartupLog.ts` — IDE startup timings

- **What it logs:** IDE main-process boot timings.
- **Current sink:** `{userData}/startup-timings.jsonl`.
- **Classification:** `fundamentally-IDE-only`. (Listed for completeness; not a parity surface — the
  external CLI has no startup that the IDE measures.)
- **Effort:** N/A.

### 18. `src/main/orchestration/editProvenance.ts:64` — `appendFileSync` per edit

- **What it logs:** Per file edit: agent vs user origin, timestamp, optional `correctionDeltaMs`.
- **Current sink:** `{userData}/edit-provenance.jsonl`.
- **Classification:** `global-hookable`.
- **Why hookable:** `markAgentEdit` / `markUserEdit` are invoked from `tapEditProvenance` which
  runs on hook-pipe-delivered `post_tool_use` events for `Edit`/`Write`/`MultiEdit`. Same pattern
  as #1 — already fires for external sessions when IDE is up, gap is "IDE not running."
- **Effort:** Folds into #1's JSONL fallback. ~20 LOC additional drain logic to feed the recorded
  events into `markAgentEdit` on drain replay.

## Recommended Wave 53a migration order

Group by hook event so each new hook script captures multiple surfaces in one pass.

1. **SessionStart** (already Phase C of this wave): #3 spawn cost. Add #7 spawn-trace partial in
   the same hook — same payload shape, additive fields. Smallest blast radius and Phase C is
   already scoped here.
2. **Hook-pipe JSONL fallback in `assets/hooks/lib/ouroboros.mjs`**: closes the "IDE not running"
   gap for #1, #2, #4, #6 (conflict half), #12 (terminal signals), #18 in one stroke. This is the
   single highest-leverage change in Wave 53a — flip every `global-hookable` row to actual parity.
3. **UserPromptSubmit → router shadow (post-hoc)**: #13 reclassified. Hook captures prompt payload;
   IDE drain runs the router and writes `router-decisions.jsonl` post-hoc. Worth it because router
   feedback loop has been data-starved by exactly this gap.
4. **PostToolUse → file-touched-per-turn (one-sided context outcomes)**: optional extension of #5
   if Wave 53a deems one-sided data useful for the ranker.

Items #5, #8, #9, #10, #11, #15, #16, #17 stay deferred (`fundamentally-IDE-only`).

## Fundamentally-IDE-only gaps

| Surface                                  | Why                                                                  | Partial capture available?                                  |
| ---------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------- |
| PTY-exit outcomes (#6 half)              | PTY only exists when IDE is parent                                   | No                                                          |
| Stream-json stdin/stdout traces (#7 half) | Subprocess stream is invisible to hooks                              | Spawn trace yes (via SessionStart), stdin/stdout no         |
| Pre-tool research traces (#8)            | Decision algorithm needs IDE-side cache + correction store           | Could emit a different signal, not a parity one             |
| Fact-claim traces (#9)                   | Operates on streaming model output                                   | No                                                          |
| Research invocations (#10)               | Research path doesn't exist in external CLI                          | No                                                          |
| Session lifecycle (#11)                  | "Session" is an IDE-renderer concept                                 | N/A — no external analogue                                  |
| Chat regen / correction (#12 half)       | Detection runs in IDE chat orchestration only                        | No                                                          |
| Context decisions/outcomes (#5, #15)     | Context selection runs in IDE main process only                      | One-sided file-touched-per-turn possible (see rec. #4)      |
| Research outcomes / corrections (#16)    | Downstream of #10                                                    | No                                                          |
| Startup timings (#17)                    | Measures the IDE itself                                              | N/A                                                         |

The user-visible cost of these gaps: external-session corpora will under-represent
(a) PTY-shaped failure signals, (b) deep streaming traces, (c) IDE-side context-selection quality,
and (d) research/correction signals. The unified corpus will be closer to representative for
**routing decisions, tool-shape choices, edit provenance, conflict outcomes, terminal session
boundaries, and MCP cost** — which is what Wave 53b's ranker actually needs.

## Open questions

1. **Hook-pipe JSONL fallback semantics.** When the hook script's `sendEvent` to the IDE pipe
   fails, should it (a) write to JSONL and exit, or (b) write to JSONL **and** continue to wait
   for the approval response file (the existing fallback)? Today an unreachable IDE silently
   approves. Option (b) preserves that. Recommend (b); confirm in Wave 53a kickoff.
2. **Reclassifying #13 (router shadow) — is post-hoc shadow routing acceptable?** It changes the
   "shadow at the moment of the prompt" semantic to "shadow on next IDE drain." The decision input
   (prompt + workspace hash) is unchanged but the bundled-weights snapshot may be newer. Wave 53b's
   measurement might or might not care. Flag for the ranker designer.
3. **One-sided context outcomes (#5).** Worth the implementation cost? Need a Wave 53b read on
   whether `files_touched_per_turn` without the `which_were_in_context` half adds enough signal.
4. **Dedup key for migrated surfaces.** Phase C dedups by `recordId` (Wave 52 plan §C). For
   surfaces where the IDE-side and hook-side both fire (internal sessions), the plan calls for
   `(sessionId, surface)` instead. Confirm that's the policy for **all** migrated surfaces, not
   just spawn-cost — and document a per-surface override hatch in `telemetryDrain.ts` for surfaces
   where multiple records per session are legitimate (#4 graph-usage fires N times per session).
5. **`schemaVersion` ownership.** Each surface's record already has fields the IDE sink expects.
   For migrated surfaces, the hook script must produce an identical shape **plus** a `schemaVersion`
   stamp. Recommend codifying in Phase D's `docs/telemetry-parity.md`: each surface declares its
   schema in a single TS file imported by both the drain handler and (transpiled / hand-mirrored)
   the hook helper.
