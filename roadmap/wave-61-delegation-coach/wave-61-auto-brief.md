# Wave 61 Result Brief

**Status:** ✅ COMPLETED — 2026-04-30 · Released as v2.9.0 · Plan: `roadmap/wave-61-delegation-coach.md` · ADR: `roadmap/decisions/wave-61.md`

**Smoke:** All 14 hook smoke tests across Phase C (6) + Phase D (8) + Phase E (9 new) pass. 49 vitest unit tests across `src/main/delegationCoach/` pass. End-to-end manual sequence verified: pending → taken → taken-success outcome chain joins correctly via `nudgeId` across PreToolUse → PostToolUse(Agent) → SubagentStop. **Live Opus session smoke deferred** — the hook is registered in `~/.claude/settings.json` and will fire on the next Claude Code session; a single confirmed real-session nudge is the post-merge gate before Phase F starts collecting data.

---

## What shipped

### Phase 0a — Housekeeping (model-router auto-retrain disabled)

The model-router retrain pipeline at `src/main/router/retrainTrigger.ts` was firing every 30s indefinitely without progress (the trainer skips when class distribution is degenerate, validation fails because no output file is written, the counter never advances, the loop repeats). Diagnosis was already in the wave plan; this phase shipped the fix.

- Added `routerSettings.autoRetrainEnabled?: boolean` to `RouterSettings` in both `configTypes.ts` and `routerTypes.ts` (optional for backward compat). Default `false`.
- Schema entry in `configSchemaTail.ts` with default `false`.
- `observeDatasetGrowth` short-circuits at observer start when flag is off; `checkAndRetrain` re-checks live (handles runtime toggle).
- `loadRetrainedWeightsIfAvailable` unaffected — pre-existing retrained weights still load.
- Three new unit tests in `retrainTrigger.test.ts` covering disabled / missing / enabled.
- `src/main/router/CLAUDE.md` documents maintenance-only mode and references this wave.

### Phase 0b — ADR

`roadmap/decisions/wave-61.md` captures the six locked decisions, the three open-question resolutions (Q1 no, Q2 skip audit, Q3 no indexing), and the H1 vs H2 pick (H1 chosen) with verification log.

### Phase A — Pattern library + detector

Pure-data subsystem at `src/main/delegationCoach/`. JSON-serializable so the build step can emit it for the hooks side.

- `types.ts` — `ToolCallEvent`, `PatternMatch`, `PatternDefinition`, `PatternTrigger`, `ToolCallMatcher`, `HistoryRequirement`, `EscalationTier`.
- `patterns.ts` — `SEED_PATTERNS` with 5 hand-curated patterns (multi-file scan / symbol chase / test-first violation / test authorship / large read burst). `activePatterns()` filters disabled entries. Header comment lists 5 deferred patterns the simple DSL can't express yet.
- `detector.ts` — pure `detectPatterns(history, current, patterns, opts)` interpreter. `globMatches` exported for tests. `pruneHistory` for hook use. Bash-style glob: basename match when no slash; full-path match otherwise; `*` does not cross `/`; `**` does.
- 43 unit tests across `types.test.ts`, `patterns.test.ts`, `detector.test.ts`.

### Phase B — Storage layer (coachLogger)

Mirrors `src/main/router/routerLogger.ts` line-for-line.

- `coachLogger.ts` — `createCoachLogger(logDir)` returns a `CoachLogger` with `log(entry)` and `close()`. Append-only JSONL at `{userData}/delegation-coach.jsonl`. 10MB rotation with date-stamped renames.
- `CoachLogEntry` schema: `timestamp`, `sessionId`, `nudgeId`, `patternId`, `escalation`, `toolCall`, `outcome`, optional `meta`.
- `CoachOutcome` enum: `'pending' | 'taken' | 'ignored' | 'bypassed'`.
- 6 unit tests including a real >10MB rotation test.

### Phase C — Hook integration (soft-nudge)

The IDE-side build step + the cross-process hook.

- `scripts/build-coach-hook.mjs` — esbuild-bundles `patterns.ts` to JSON; copies the JS detector port to `out/coach-detector.mjs` and `~/.claude/hooks/lib/coach-detector.mjs`. Wired as `npm run build:coach-hook`.
- `scripts/coach-detector-template.mjs` — hand-written 1:1 plain-JS port of `detector.ts`. Updated when `detector.ts` changes.
- `~/.claude/hooks/delegation_coach.mjs` — PreToolUse hook (no matcher; fires every tool call). Reads stdin, prunes session history, runs detector, prints soft-nudge to stdout, appends `pending` JSONL line.
- Subagent self-disable via `OUROBOROS_INTERNAL=1`.
- `COACH_USERDATA_OVERRIDE` and `COACH_STATE_OVERRIDE` env vars for testing.
- Per-OS userData path resolution mirrors Wave 60's standalone logic.
- History persistence at `~/.claude/hooks/state/coach-history-{sessionId}.json`; cooldown at `coach-cooldown-{sessionId}.json`. Both pruned to ≤20 entries / ≤120s window.
- 24h cleanup sweep on each invocation.
- Registered in `~/.claude/settings.json` PreToolUse chain after `pre_tool_use.mjs` and `agent_catalog_enforce.mjs`.
- 6 smoke tests at `scripts/test-coach-hook.mjs`.

### Phase D — Outcome tracking

Joins nudge fires to subsequent subagent dispatches and completion outcomes.

- `~/.claude/hooks/delegation_coach.mjs` — extended to write `coach-pending-{sessionId}.json` (capped at 50 entries / 5min) when a nudge fires.
- `~/.claude/hooks/delegation_coach_post.mjs` — new PostToolUse hook (matcher: `Agent`). Joins recent unjoined pending nudges (within 30s) to the dispatch. Appends `outcome: "taken"` JSONL line. Marks pending entry joined. Writes `coach-dispatch-{sessionId}-{ts}.json` for SubagentStop to consume.
- `~/.claude/hooks/delegation_coach_subagent_stop.mjs` — new SubagentStop hook. Reads most-recent dispatch file for the session, appends `outcome: "taken-success"` or `"taken-failure"`, deletes the dispatch file. Success/failure inferred via the same `error`-field check `agent_end.mjs` uses.
- 8 smoke tests at `scripts/test-coach-hook-d.mjs`.
- `scripts/manual-seq-test.mjs` — full 3-event chain verifier.

### Phase E — Acknowledgment + hard-gate tiers (mechanism only)

Per ADR Decision 3, no patterns are promoted to higher tiers in this wave; this phase ships the mechanism so Phase F can promote individual patterns based on data.

- Hook now partitions matches by tier; soft fires print to stdout, ack/hard fires emit a structured `permissionDecision: 'deny'` deny via `hookSpecificOutput` (mirrors `agent_catalog_enforce.mjs` contract). Hard wins over mixed ack+hard. Soft suggestions appear under a `Soft suggestions also flagged:` heading in escalated reasons.
- Hard-gate fires include the explicit `[delegation-bypass: <reason>]` escape-hatch instruction.
- `~/.claude/hooks/delegation_coach_user_prompt.mjs` — new UserPromptSubmit hook scans message text for the bypass token; updates `~/.claude/hooks/state/coach-bypass-{sessionId}.json`. Bypassed pattern is silent-skipped for the rest of the session.
- `COACH_PATTERNS_OVERRIDE` env var for injecting synthetic ack/hard patterns in tests.
- 9 smoke tests at `scripts/test-coach-hook-e.mjs`.
- Registered the UserPromptSubmit hook in `~/.claude/settings.json`.

### Phase F — Soak + analytics (deferred per design)

No soak data exists yet (the hook just shipped). The analytics recipe is documented in `src/main/delegationCoach/CLAUDE.md` under "Phase F analytics recipe": group by `patternId`, compute fire / take / success rates, promote candidates by take-rate thresholds. Revisit after ≥1 week of real use.

---

## File changes

### Agent IDE repo

| File                                           | Status                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| `src/main/configTypes.ts`                      | Modified (Phase 0a — added `autoRetrainEnabled`)                   |
| `src/main/configSchemaTail.ts`                 | Modified (Phase 0a — schema entry)                                 |
| `src/main/router/routerTypes.ts`               | Modified (Phase 0a — `RouterSettings` + `DEFAULT_ROUTER_SETTINGS`) |
| `src/main/router/retrainTrigger.ts`            | Modified (Phase 0a — flag gate)                                    |
| `src/main/router/retrainTrigger.test.ts`       | Modified (Phase 0a — 3 new tests)                                  |
| `src/main/router/CLAUDE.md`                    | Modified (Phase 0a — maintenance-only mode note)                   |
| `roadmap/decisions/wave-61.md`                 | New (Phase 0b — ADR)                                               |
| `roadmap/wave-61-delegation-coach.md`          | New (planned during pre-wave conversation)                         |
| `src/main/delegationCoach/types.ts`            | New (Phase A)                                                      |
| `src/main/delegationCoach/types.test.ts`       | New (Phase A)                                                      |
| `src/main/delegationCoach/patterns.ts`         | New (Phase A)                                                      |
| `src/main/delegationCoach/patterns.test.ts`    | New (Phase A)                                                      |
| `src/main/delegationCoach/detector.ts`         | New (Phase A)                                                      |
| `src/main/delegationCoach/detector.test.ts`    | New (Phase A)                                                      |
| `src/main/delegationCoach/CLAUDE.md`           | New (Phase A)                                                      |
| `src/main/delegationCoach/coachLogger.ts`      | New (Phase B)                                                      |
| `src/main/delegationCoach/coachLogger.test.ts` | New (Phase B)                                                      |
| `src/main/CLAUDE.md`                           | Modified (Phase A — subsystem map row)                             |
| `scripts/build-coach-hook.mjs`                 | New (Phase C)                                                      |
| `scripts/coach-detector-template.mjs`          | New (Phase C)                                                      |
| `scripts/test-coach-hook.mjs`                  | New (Phase C — 6 smoke tests)                                      |
| `scripts/test-coach-hook-d.mjs`                | New (Phase D — 8 smoke tests)                                      |
| `scripts/test-coach-hook-e.mjs`                | New (Phase E — 9 smoke tests)                                      |
| `scripts/manual-seq-test.mjs`                  | New (Phase D — full sequence verifier)                             |
| `package.json`                                 | Modified (`build:coach-hook` script + version bump v2.9.0)         |
| `roadmap/auto-briefs/wave-61-result.md`        | New (this file)                                                    |

### User home (~/.claude/)

| File                                                 | Status                                          |
| ---------------------------------------------------- | ----------------------------------------------- |
| `~/.claude/hooks/delegation_coach.mjs`               | New (Phase C; extended in D + E)                |
| `~/.claude/hooks/delegation_coach_post.mjs`          | New (Phase D)                                   |
| `~/.claude/hooks/delegation_coach_subagent_stop.mjs` | New (Phase D)                                   |
| `~/.claude/hooks/delegation_coach_user_prompt.mjs`   | New (Phase E)                                   |
| `~/.claude/hooks/lib/coach-patterns.json`            | Generated (Phase C build artifact)              |
| `~/.claude/hooks/lib/coach-detector.mjs`             | Generated (Phase C build artifact)              |
| `~/.claude/settings.json`                            | Modified (Phase C/D/E — three new hook entries) |

---

## Test results

| Suite                                                     | Count                    | Status      |
| --------------------------------------------------------- | ------------------------ | ----------- |
| `src/main/delegationCoach/` (vitest)                      | 49                       | ✅ All pass |
| `src/main/router/retrainTrigger.test.ts`                  | 16 (13 existing + 3 new) | ✅ All pass |
| `src/main/configTypes.test.ts` + `configAppTypes.test.ts` | 26                       | ✅ All pass |
| `scripts/test-coach-hook.mjs` (Phase C)                   | 6                        | ✅ All pass |
| `scripts/test-coach-hook-d.mjs` (Phase D)                 | 8                        | ✅ All pass |
| `scripts/test-coach-hook-e.mjs` (Phase E)                 | 9                        | ✅ All pass |
| `scripts/manual-seq-test.mjs` (E2E join)                  | 1 sequence               | ✅ Pass     |

Pre-existing TS errors in `rulesAndSkillsToggle.test.ts` and `claudeCodeHelpers.ts` were noted by the Phase C agent as out-of-scope (not in files touched by this wave).

---

## Manual smoke gate

The wave plan calls for a real-Opus-session smoke. Mechanics are verified via the 23 hook smokes + the manual sequence script. The single remaining check is **live**: a real Opus session triggering a real nudge from the seed patterns. Ship the merge, run a normal session for 5–10 minutes, confirm at least one entry in `{userData}/delegation-coach.jsonl` AND the nudge text appearing in Opus's next turn. The user signs the smoke checklist below post-merge:

```
## Manual smoke gate (Wave 61)
- [ ] Launched Opus session with the wave's hooks active (any IDE-internal or terminal session works)
- [ ] At least one nudge fired and appeared in Opus's next turn (visible as `[delegation-coach]` prefixed text)
- [ ] {userData}/delegation-coach.jsonl has the corresponding `pending` line
- [ ] No console errors related to delegation_coach.* hooks during the session
- [ ] Smoke signed: ___________ on ___________
```

If a hard or acknowledgment pattern ever exists post-Phase-F and one fires during smoke, also verify:

```
- [ ] Bypass token works: include `[delegation-bypass: <reason>]` in a message; same pattern stays silent for the rest of the session
```

---

## Architectural decisions worth surfacing

These are documented in the ADR but worth re-stating for readers of this brief:

1. **Coach lives in hooks, not in Electron main.** Hooks fire for every Claude Code session (terminal, IDE-internal, external). Electron-side IPC interception only works inside the IDE. The user's pain (Opus skipping delegation) happens in all of them.
2. **Pattern library is hand-curated, not learned.** The whole point is to encode catalog discipline the user explicitly wants. Auto-discovery of patterns is a follow-up wave once Phase F has baseline data.
3. **All seed patterns ship as soft.** Wrong-tier escalation is high-friction. Promote based on Phase F data, not theory.
4. **Pattern library duplication is real.** `SEED_PATTERNS` in TS is canonical; the JSON copy at `~/.claude/hooks/lib/coach-patterns.json` is a build artifact. Never edit by hand. The build step is the source of truth.
5. **Detector is stateless; cooldown lives in the caller.** History/cooldown files in `~/.claude/hooks/state/` are session-scoped and pruned aggressively. Detector itself has no module state.
6. **Subagent self-disable is mandatory.** Coaching a subagent to delegate further is recursive nonsense (and harness blocks sub-subagents anyway). `OUROBOROS_INTERNAL=1` env check at hook entry.
7. **Bypass is "silent skip," not "downgrade."** When user/Opus explicitly bypasses a pattern, it's gone from that session entirely. Keeps the analytics signal clean — bypass means "explicitly dismissed."
8. **Model router stays alive but disabled.** The model-router subsystem still serves bundled weights for `routePromptSync()` consumers; only the auto-retrain loop is gated off.

---

## Out-of-wave follow-ups

- **Phase F execution proper.** Run the analytics recipe after ≥1 week of soak. Expected output: ≥1 pattern promoted to acknowledgment OR documented decision that soft-only is sufficient for the seed library.
- **Pattern auto-discovery.** Mining the JSONL for repeated tool-use sequences not in the library — surface as candidates. Wave-sized; do after Phase F.
- **Settings panel for the pattern library.** Per-pattern enable/disable + tier toggle in the IDE settings view. Quality-of-life, not essential.
- **Cross-project pattern library.** Currently global per user. Could be per-project. Defer until needed.
- **Richer trigger DSL.** The 5 deferred patterns (repetitive edit, failed-fix loop, library API research, mass lint cleanup, new module designed in-flight) need richer detection — argument fingerprinting, file-content inspection, content-size checks. Add primitives only when Phase F data shows the gap matters.
- **Per-pattern-id escalation in pending state.** The Phase E bypass detection currently bypasses ALL recent unjoined patterns when a token is seen, not just hard-tier ones. Tightening requires adding `escalation` to the pending JSON shape. Defer until data shows it's needed.
- **`build:coach-hook` in CI/dist.** Currently a manual script. Wiring into `postbuild` would auto-sync `~/.claude/hooks/lib/` after every IDE build. Easy, deferred.
- **Hook latency telemetry.** Phase C agent noted hook latency wasn't measured live. Add a quick perf hook around `detectPatterns` if Phase F shows any slow-fire reports.

---

## What this wave does NOT do

- Not a model router replacement. The model router still runs (with auto-retrain off); the coach is orthogonal.
- Not a learner. No ML, no training, no inference beyond the hand-coded pattern matcher.
- Not a chat-prompt classifier. Coach observes tool calls only. The user's explicit decision "Opus by default for chat" is not second-guessed.
- Not GUI. No settings panel for managing patterns; edits happen in `patterns.ts` and ship via `npm run build:coach-hook`.
- Not telemetry parity. The JSONL is local-only and not piped through the existing telemetry infrastructure. Add piping later if cross-project / cross-device analysis becomes useful.

---

## Why this wave exists (reminder)

User said: _"It tends to be lazy about that, not that it is its fault, it is probably my fault but I am not educated enough on this content yet and it could be years before I precisely know when to use what or when to tell Opus to use what when."_

The delegation coach is the mechanism that compresses "years of knowing when to use what" into pattern-matched nudges. The user doesn't have to learn the catalog; the coach knows it and surfaces it at decision points where Opus would otherwise skip delegation. Phase F + iterative tuning is what makes the coach _useful_; Phases 0–E build the substrate so iteration has somewhere to land.
