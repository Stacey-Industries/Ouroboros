# Wave 53a — Telemetry Parity: Migrate Remaining Surfaces

## Implementation Plan

**Status:** ✅ COMPLETED — 2026-04-27 · Released as v2.9.2 · Result: `roadmap/auto-briefs/wave-53a-result.md`
**Version target:** v2.9.2 (patch — measurement infrastructure expansion; no user-visible behavior change)
**Feature flags:** none new — surfaces use Wave 52's `telemetry.parityQueue.enabled` (default true)
**Dependencies:** Wave 52 ✅ (audit, queue+drain primitives, first migration)
**References:**
- `roadmap/wave-52-audit.md` — surface inventory + classification
- `docs/telemetry-parity.md` — recipe + architecture
- `src/main/telemetry/telemetryQueue.ts` / `telemetryDrain.ts` / `queueRotation.ts` — Wave 52 primitives
- `assets/hooks/lib/telemetryQueueAppend.mjs` — hook-side helper
- `assets/hooks/lib/ouroboros.mjs` — Phase A's edit target
- `src/main/hookInstaller.ts` + `src/main/hookInstallerStatusLine.ts` — Phase E's extension target
- `src/main/router/routerShadow.ts:85 shadowRouteHookEvent` — Phase C's existing entry point
- `src/main/router/orchestrator.ts:36 routePromptSync` — sync routing entry (no Layer-3 needed)

---

## Why this wave matters

Wave 52 shipped the audit and the queue+drain pipe, with one surface migrated as proof. Until the rest land, **external sessions still under-represent the corpora that drive Auto Effort, Auto Model, the context ranker, and research/retrain**. Wave 53b's ranker measurement waits on this wave producing a unified corpus.

Audit's recommended migration order, baked into this plan's phases:

1. **Hook-pipe JSONL fallback in `ouroboros.mjs`** — single highest-leverage edit, closes 6 surfaces (#1, #2, #4, #6 conflict half, #12 terminal signals, #18) in one stroke.
2. **Spawn-trace partial via SessionStart** — small extension of Wave 52's existing hook.
3. **UserPromptSubmit + post-hoc shadow router** — reclassifies #13 from IDE-only to buffer-via-hook.
4. Documentation + per-surface schema discipline.
5. Auto-install for all four hooks (Wave 52's spawn-cost + Wave 53a's three).

Surfaces classified as `fundamentally-IDE-only` in the audit (#5, #7 stream halves, #8, #9, #10, #11, #15, #16, #17) stay deferred. The unified corpus will be representative for **routing decisions, tool-shape choices, edit provenance, conflict outcomes, terminal session boundaries, MCP cost** — which is exactly what Wave 53b's ranker needs.

---

## Implementation review summary — best-practice resolutions

The audit closed with five open questions. Resolved per industry-standard patterns:

| Q | Resolution | Rationale |
|---|---|---|
| Q1 — JSONL fallback semantics | **Write-on-fail** (not dual-write). Hook writes to JSONL **only** when `sendEvent` to the IDE pipe fails. | Industry standard for pipe+fallback in telemetry: avoid duplicate I/O and dedup work. Telemetry is best-effort by design; mid-consumption-crash loss is acceptable. |
| Q2 — Post-hoc router shadow | **Yes, with `weightsVersion` stamp.** Records carry the SHA of classifier weights used. Analyzer can split by weights snapshot. | Standard shadow routing prefers decision-time matching; post-hoc with newer weights is a *different* signal but useful for forward-looking model improvements. Keep both signals separable. |
| Q3 — One-sided context outcomes | **Defer.** Not in 53a scope. | YAGNI. Wave 53b decides whether the partial signal is worth the maintenance cost. |
| Q4 — Dedup key | **`(sessionId, surface)` default + per-handler override.** | Default fits one-record-per-session surfaces. Override hatch handles legitimate multi-record cases (graph-usage fires N times per session). Documented per surface in Phase D. |
| Q5 — `schemaVersion` ownership | **Per-surface TS schema file.** Drain handler imports it. Hook script mirrors the shape in a comment block at the top with strict review on schema changes. | Schema-as-code is industry standard. Hook scripts can't import TS, so hand-mirror with discipline. Future improvement: codegen the helper from the TS schema (separate wave). |

---

## Phase A — JSONL fallback in `ouroboros.mjs` + multi-sink drain handler

**Goal:** Single highest-leverage edit. Closes 6 surfaces by adding a fallback to one shared library function and a drain handler that routes events to multiple downstream consumers.

### New files

| File | ~Lines | Description |
|---|---|---|
| `src/main/telemetry/hookEventsDrainHandler.ts` | ~260 | Drain handler for the `hook-events` surface. Routes each event by `eventType` (`pre_tool_use`, `post_tool_use`, `user_prompt_submit`, `session_start`, `session_end`, `agent_start`, `agent_end`, `agent_stop`, `task_completed`) to its downstream sink: `telemetryStore.record`, `tapEditProvenance.markAgentEdit/markUserEdit`, `tapGraphUsage.tapGraphUsage`, conflict outcome correlation, terminal session signal handler. Validates `schemaVersion === 1`. Honors `(sessionId, eventId)` dedup (override of the default `(sessionId, surface)` because hook events fire N-per-session). |
| `src/main/telemetry/hookEventsDrainHandler.test.ts` | ~280 | Per-event-type routing assertions; dedup; schemaVersion mismatch; unknown event types skipped + logged; mocked downstream sinks. |
| `src/main/telemetry/hookEventsSchema.ts` | ~80 | Per-surface schema file. Exports `HookEventRecord` TS type + `HOOK_EVENTS_SCHEMA_VERSION = 1` constant. Mirror block lives in `ouroboros.mjs` as a comment. |

### Modified files

| File | Change |
|---|---|
| `assets/hooks/lib/ouroboros.mjs` | Extend `sendEvent`: on pipe-write failure (or pipe unreachable), call `appendToTelemetryQueue('hook-events', 1, { eventType, sessionId, eventId, payload })`. **Write-on-fail only** — no JSONL write when sendEvent succeeds. Comment block at top mirrors `HookEventRecord` schema. |
| `src/main/main.ts` (or `telemetryDrainStartup.ts`) | Register `hookEventsDrainHandler` before `runParityQueueDrain`. |

### Subagent briefing (sonnet)

- **Read first:** `roadmap/wave-52-audit.md` rows #1, #2, #4, #6, #12, #18 (the 6 surfaces this phase closes); `assets/hooks/lib/ouroboros.mjs` (full); `src/main/hooks.ts` (where event types route to telemetryStore); `src/main/hooksGraphUsageTap.ts`; `src/main/hooksContextOutcome.ts`; `src/main/orchestration/editProvenance.ts`; `src/main/router/qualitySignalCollector.ts:182`.
- **Write-on-fail, not dual-write.** The fallback only fires when `sendEvent` returns false. If it returns true, the IDE consumed the event and no JSONL write happens.
- **Drain dedup is `(sessionId, eventId)`**, not `(sessionId, surface)`. Hook events fire N-per-session. Use the per-handler dedup override.
- **Multi-sink dispatch.** The drain handler is one function but routes by `eventType`. Each event-type's downstream consumer is the existing tap (`tapEditProvenance`, `tapGraphUsage`, etc.) — drain just calls it. Don't duplicate the tap logic.
- **Schema mirror.** The comment block in `ouroboros.mjs` must match the TS type in `hookEventsSchema.ts`. If they drift, the drain rejects records. Document the discipline in the JSDoc.
- **Test policy: scoped only.** `npx vitest run src/main/telemetry/hookEventsDrainHandler.test.ts`.
- **Lint:** standard rules. Hook helper uses Node built-ins only.
- **Commit:** `feat(wave-53a): Phase A — JSONL fallback in ouroboros.mjs + multi-sink drain handler`

### Acceptance

- [ ] `ouroboros.mjs` writes to queue only when `sendEvent` fails.
- [ ] Drain handler routes 9+ event types to their existing downstream taps.
- [ ] Dedup works on `(sessionId, eventId)` for this surface.
- [ ] Six surfaces in the audit (#1, #2, #4, #6 conflict half, #12 terminal signals, #18) emit on next IDE drain when the IDE was down during the external session.
- [ ] Scoped tests pass; lint + tsc clean.

---

## Phase B — Spawn-trace partial via SessionStart

**Goal:** Small extension of Wave 52's existing `session_start_spawn_cost.mjs`. Add the spawn-trace half of audit #7 (argv + cwdHash) on a new surface; drain feeds it into `traceBatcher`.

### New files

| File | ~Lines | Description |
|---|---|---|
| `src/main/telemetry/spawnTraceDrainHandler.ts` | ~120 | Drain handler for `spawn-trace` surface. Validates `schemaVersion === 1`. Calls `enqueueTrace({ kind: 'spawn', argv: redactArgv(argv), cwdHash, sessionId })` → `orchestration_traces` table. Dedup `(sessionId, surface)` (one spawn = one trace). |
| `src/main/telemetry/spawnTraceDrainHandler.test.ts` | ~120 | Schema validation, traceBatcher call, dedup. |
| `src/main/telemetry/spawnTraceSchema.ts` | ~50 | `SpawnTraceRecord` type + `SPAWN_TRACE_SCHEMA_VERSION = 1`. |

### Modified files

| File | Change |
|---|---|
| `assets/hooks/session_start_spawn_cost.mjs` | After the existing spawn-cost append, also append a `spawn-trace` record with `argv` (from event payload — Claude Code provides launch args), `cwdHash` (SHA of cwd), `sessionId`. Same hook script — additive payload, second `appendToTelemetryQueue` call. |
| `src/main/main.ts` (or telemetry init module) | Register `spawnTraceDrainHandler`. |

### Subagent briefing (sonnet)

- **Read first:** Wave 52's `session_start_spawn_cost.mjs`, `src/main/orchestration/providers/claudeStreamJsonRunner.ts:178` (existing spawn-trace shape via `enqueueTrace`), `src/main/telemetry/traceBatcher.ts`.
- The existing `enqueueTrace` is the canonical spawn-trace shape. Mirror it. Reuse `redactArgv` from `traceBatcher`.
- `cwdHash`: SHA-256 of the cwd. Truncate to first 12 chars for log brevity.
- The hook now writes 2 records per SessionStart (cost + trace). They're separate surfaces; drain processes them independently.
- **Test policy: scoped only.**
- **Commit:** `feat(wave-53a): Phase B — spawn-trace partial via SessionStart`

### Acceptance

- [ ] Hook script appends both spawn-cost and spawn-trace on SessionStart.
- [ ] Drain handler feeds spawn-trace into `traceBatcher` → `orchestration_traces`.
- [ ] Internal sessions still produce both records via the existing IDE-side path AND the hook (drain dedupes).
- [ ] Scoped tests pass; lint + tsc clean.

---

## Phase C — UserPromptSubmit hook + post-hoc shadow router

**Goal:** Reclassify audit #13 from IDE-only to buffer-via-hook. Hook captures raw prompt + cwd; drain calls existing `shadowRouteHookEvent` post-hoc. Records carry `weightsVersion` so analyzer can distinguish session-time vs drain-time decisions.

### New files

| File | ~Lines | Description |
|---|---|---|
| `assets/hooks/user_prompt_submit_router_shadow.mjs` | ~100 | UserPromptSubmit hook. Captures prompt text, cwd, sessionId, ts. Appends to `router-shadow` surface. Never throws. |
| `src/main/router/routerShadowDrainHandler.ts` | ~140 | Drain handler for `router-shadow` surface. Validates `schemaVersion === 1`. Computes `weightsVersion` (SHA of classifier weights file at drain time). Calls `shadowRouteHookEvent({ ...record.payload, postHoc: true, weightsVersion })`. The shadow function writes to `router-decisions.jsonl`; we tag `postHoc: true` and `weightsVersion` in the record so analysis can split corpora. |
| `src/main/router/routerShadowDrainHandler.test.ts` | ~140 | Schema validation, weightsVersion stamping, shadowRouteHookEvent invocation. |
| `src/main/router/routerShadowSchema.ts` | ~50 | `RouterShadowRecord` type + `ROUTER_SHADOW_SCHEMA_VERSION = 1`. |

### Modified files

| File | Change |
|---|---|
| `src/main/router/routerShadow.ts` | Extend `ShadowHookEvent` interface with optional `postHoc?: boolean` and `weightsVersion?: string`. Pass through to the existing log entry shape. **No behavior change for live shadow path.** |
| `src/main/router/orchestrator.ts` | Add a `skipLayer3` option to `routePromptSync` so drain context can run Layer-1 + Layer-2 without LLM dependency. Layer-3 is async-network; drain stays sync. |
| `src/main/main.ts` | Register `routerShadowDrainHandler`. |

### Subagent briefing (sonnet)

- **Read first:** `src/main/router/routerShadow.ts` (full — see existing `shadowRouteHookEvent` at line 85); `src/main/router/orchestrator.ts:36 routePromptSync`; `src/main/router/classifier.ts` (for the weights file path).
- **No Layer-3 in drain.** Add a `skipLayer3` flag to `routePromptSync` and pass it from drain. Live shadow path stays unchanged.
- **`weightsVersion`:** SHA-256 of the classifier weights file (truncated to 12 chars) read at drain time. Captures which weights snapshot made the decision. If weights file is absent, use `'unknown'`.
- **Don't double-emit for internal sessions.** When the IDE is up at session-time, the existing live shadow path emits a record. The hook also fires. Drain dedupes by `(sessionId, surface)` (one prompt = one shadow record). The drain-time record has `postHoc: true`; the live one has `postHoc: false`. If both exist for the same session, dedup keeps the live one (richer signal).
  - Implementation: drain handler reads existing `router-decisions.jsonl` once at init, builds `Set<sessionId>` of session-time entries, skips drain records whose sessionId is in the set.
- **Test policy: scoped only.**
- **Commit:** `feat(wave-53a): Phase C — UserPromptSubmit + post-hoc shadow router`

### Acceptance

- [ ] Hook captures prompt + cwd on every UserPromptSubmit. Never throws.
- [ ] Drain handler invokes `shadowRouteHookEvent` with `postHoc: true` and `weightsVersion`.
- [ ] `routePromptSync` honors `skipLayer3` flag.
- [ ] Internal sessions don't double-emit (live record beats drain record).
- [ ] Scoped tests pass; lint + tsc clean.

---

## Phase D — Docs + accepted-gap registry + per-surface schemas

**Goal:** Document everything that shipped. Codify the schema-mirror discipline. List the accepted IDE-only gaps explicitly.

### New files

None new files in this phase (the schema files live alongside their drain handlers, created in A/B/C).

### Modified files

| File | Change |
|---|---|
| `docs/telemetry-parity.md` | Add sections: "Surfaces shipped this wave" (table — surface name, hook event, drain handler, schema file). "Per-surface schema discipline" (the comment-mirror contract, schema-version policy, drift detection). "Accepted gaps" (table — surface, why IDE-only, what's lost). Replace the "single migrated surface" framing with the full set. |
| `roadmap/session-handoff.md` | Update Wave 53a follow-ups: list the four hooks now auto-installed (Phase E), point at Wave 53b. Note the `weightsVersion` field for ranker analysis. |
| `src/main/telemetry/CLAUDE.md` | Add a "Per-surface schemas" gotcha pointing at the contract. Stay ≤200 lines. |

### Subagent briefing (sonnet)

- **Read first:** Phase A/B/C deliverables, the existing `docs/telemetry-parity.md`.
- The doc is reader-first. Lead with the why, then the what, then the recipe.
- "Accepted gaps" section enumerates audit rows #5, #7 (stream halves), #8, #9, #10, #11, #15, #16, #17 with rationale. Cross-reference the audit.
- The comment-mirror discipline is the key new piece: every hook script's first comment block is the schema mirror; CI/lint can grep for the marker if needed (future improvement).
- **Commit:** `docs(wave-53a): Phase D — telemetry-parity doc + per-surface schemas`

### Acceptance

- [ ] `docs/telemetry-parity.md` covers all 4 migrated surfaces (Wave 52's spawn-cost + Wave 53a's three).
- [ ] Schema-mirror discipline documented.
- [ ] Accepted-gap registry complete with rationale.
- [ ] `lint:claude-md` clean.

---

## Phase E — Auto-install all four hooks

**Goal:** No more manual `~/.claude/settings.json` edits. The IDE registers hooks on next boot.

### New files

| File | ~Lines | Description |
|---|---|---|
| `src/main/hookInstallerSettings.ts` | ~220 | Mirrors `hookInstallerStatusLine.ts` pattern. Exports `registerTelemetryHooksInSettings()`. Idempotently merges hook entries for `SessionStart`, `UserPromptSubmit`, and any other Phase A/B/C events into `~/.claude/settings.json`. Atomic write via temp-file + rename. Backup on first install. |
| `src/main/hookInstallerSettings.test.ts` | ~220 | Idempotent merge (running twice is no-op); doesn't destroy user's existing entries; backup on first install; atomic write semantics; missing-settings.json creates one. |

### Modified files

| File | Change |
|---|---|
| `src/main/hookInstaller.ts` | Call `registerTelemetryHooksInSettings()` from `installHooks()` after the existing `registerStatusLineInSettings()` call. Gated behind existing `autoInstallHooks` config flag (don't add a new flag). |
| `src/main/hookInstallerCommands.ts` | Add command-string builders for the four telemetry hooks. Pattern: `node "<asset-path>/<hook-name>.mjs"` with proper Windows escaping. |

### Subagent briefing (sonnet)

- **Read first:** `src/main/hookInstallerStatusLine.ts` (full — exemplar pattern), `src/main/hookInstaller.ts`, `~/.claude/settings.json` (current shape — read your own to understand the structure).
- **Idempotent merge:** read existing entries, check if our hook command string already present, only append if absent. Compare by full command string match.
- **User entries are sacred.** Never delete, never reorder. Append-only.
- **Atomic write:** write to `settings.json.tmp` → fsync → rename. Crash-safe.
- **Backup on first install:** copy existing `settings.json` to `settings.json.<timestamp>.bak` once. Don't overwrite the backup on subsequent installs.
- **Don't auto-uninstall.** If a hook command is in settings.json that we no longer recognize, leave it. The user might have edited it.
- **Test policy: scoped only.**
- **Commit:** `feat(wave-53a): Phase E — auto-install telemetry hooks via settings.json registry`

### Acceptance

- [ ] All four telemetry hooks register in `~/.claude/settings.json` on next IDE boot.
- [ ] Re-running install is a no-op (idempotent).
- [ ] User's existing entries preserved.
- [ ] Backup created on first install.
- [ ] Atomic write — settings.json never half-written.
- [ ] Scoped tests pass; lint + tsc clean.

---

## Subagent execution model

- **Model:** `model: "sonnet"` on **every** Agent dispatch. No exceptions. The orchestrator (Opus) plans/reviews; subagents (Sonnet) implement. Per `~/.claude/rules/agent-model-selection.md`.
- **Isolation:** sequential on `master`; no worktrees.
- **Test policy:** scoped vitest per phase; orchestrator runs full suite + lint + lint:claude-md at wave close.
- **Commit policy:** one per phase.
- **Push policy:** orchestrator reviews aggregate diff at wave close; single push.

### Phase dispatch order

1. **Phase A** — JSONL fallback + multi-sink drain (foundational; Phase B/C are independent of A but A is the highest-leverage win)
2. **Phase B** — spawn-trace partial via SessionStart
3. **Phase C** — UserPromptSubmit + post-hoc shadow router
4. **Phase D** — docs + per-surface schemas
5. **Phase E** — auto-install

---

## Risks

| Risk | Mitigation |
|---|---|
| `ouroboros.mjs` JSONL fallback fires when it shouldn't (false IDE-down detection). | Write-on-fail strict: only write when sendEvent returns false. Test the success path explicitly. |
| Hook event schema drifts between `ouroboros.mjs` mirror and `hookEventsSchema.ts`. | Phase D codifies the mirror discipline. Drain rejects records with unknown schemaVersion (logged + skipped, not crashed). |
| Post-hoc shadow records analyzed alongside session-time records misleads the analysis. | `weightsVersion` + `postHoc: true` tagging. Wave 53b's analyzer must split. |
| Auto-install corrupts user's `~/.claude/settings.json`. | Atomic write + first-install backup. Idempotent merge. Tests cover the destroy-user-entries failure mode. |
| Subagent stops mid-tool-loop (observed pattern). | Resume via SendMessage. Each phase commit is the recoverable checkpoint. |
| `routePromptSync` `skipLayer3` flag breaks live shadow path. | Live path doesn't pass the flag; default is false; behavior unchanged. Test both paths. |

---

## Acceptance criteria (wave-level)

- [ ] Five phase commits on `master`.
- [ ] `npx vitest run` (timeout 800) — 0 failures.
- [ ] `npx tsc --noEmit` — 0 errors.
- [ ] `npm run lint` — 0 errors.
- [ ] `npm run lint:claude-md` — 0 errors.
- [ ] Manual smoke (orchestrator):
  - [ ] Run external Claude Code session while IDE is closed.
  - [ ] Launch IDE; observe queue files drained.
  - [ ] Verify records appear in `events`, `outcomes`, `orchestration_traces`, `router-decisions.jsonl`, `mcp-spawn-cost.jsonl`, `graph-usage.jsonl` for the external session.
  - [ ] Confirm `~/.claude/settings.json` has the four hook entries auto-registered.
- [ ] Result brief at `roadmap/auto-briefs/wave-53a-result.md`.
- [ ] Status flipped to ✅ COMPLETED.
- [ ] Single push at wave close.

---

## Out-of-wave follow-ups

- **Wave 53b** unblocked: ranker measurement on the now-unified corpus.
- **Codegen hook helper from TS schema** — eliminate the comment-mirror discipline. Schema becomes single source of truth, hook helper is generated. Future wave.
- **Lint check for schema mirror drift** — grep hook scripts for the schema-mirror marker, verify it matches the TS type. Future wave.
- **Hook uninstall** — currently auto-install is one-way. If a hook becomes obsolete, no cleanup. Add to follow-up.
- **PostToolUse → file-touched-per-turn** (audit #5 partial signal). Wave 53b decides.
