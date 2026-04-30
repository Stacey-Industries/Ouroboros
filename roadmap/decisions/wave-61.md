# Wave 61 — ADR: Delegation Coach

**Status:** LOCKED 2026-04-30 by orchestrator + user. Phase 0 housekeeping (Decision 7) shipped same day; remaining phases queued.
**Plan:** `roadmap/wave-61-delegation-coach.md`

---

## Decision 1: Coach lives outside the Electron main process

**Context:** The delegation coach intercepts tool-call decisions made by Opus during a session. Two options for where the interception runs:

- **(a) Inside the Electron main process** — coach observes via the existing IPC stream, injects nudges through the agent-chat bridge.
- **(b) As Claude Code hooks at `~/.claude/hooks/`** — coach runs as a PreToolUse hook, sees every tool call deterministically.

**Pick:** (b) — hooks-based.

**Rationale:** (a) only fires when Opus is running inside the IDE chat. Terminal Claude Code sessions and external sessions would be invisible to it — and those are exactly where the user wants delegation discipline most. Hooks fire for every Claude Code session regardless of front-end. The catalog at `~/.claude/agents/` and the routing rule at `~/.claude/rules/agent-catalog.md` are already global; the coach being global matches that surface.

**Consequences:** Coach logic is split between the agent-ide repo (canonical pattern library, types) and `~/.claude/hooks/` (the hook script + a generated copy of the pattern table). A build step keeps the two in sync. The coach has no direct access to IDE state (window/project/etc.) — it only sees what's in the tool-use stream. Acceptable: the decisions the coach makes don't need IDE state, only tool-use shape.

---

## Decision 2: Pattern library is hand-curated and version-controlled

**Context:** Two options for where the patterns come from:

- **(a) Hand-curated** — explicit table in code, edited by humans, grounded in the user's catalog.
- **(b) Mined from session traces** — auto-discover repeated sequences and surface them.

**Pick:** (a) — hand-curated, stored as `src/main/delegationCoach/patterns.ts`. Auto-discovery is out of wave.

**Rationale:** The point of the coach is to encode catalog discipline that the user explicitly wants enforced. (b) would learn whatever Opus already does — including the lazy patterns we're trying to break. Auto-discovery only becomes useful AFTER we have a baseline coach + outcome data to compare against; that's a follow-up wave.

**Consequences:** Pattern library quality depends on curation. The seed library is 10 entries (in the plan); refinement is data-driven via Phase F analytics. Drift between agent-ide repo and `~/.claude/hooks/lib/coach-patterns.json` is prevented by a build step that generates the JSON from the TS module.

---

## Decision 3: Escalation tiers ship soft-first

**Context:** The plan defines three escalation tiers (soft / acknowledgment / hard-gate). Two rollout strategies:

- **(a) Ship the mechanism for all three; promote individual patterns to higher tiers based on data.**
- **(b) Pick escalation per pattern up-front based on theory.**

**Pick:** (a) — all patterns start as soft-nudge. Phase E ships the acknowledgment + hard-gate mechanisms. No patterns are promoted to higher tiers in this wave; promotion happens in Phase F based on observed take-rate data.

**Rationale:** Wrong-tier escalation is high-friction. A hard-gate on a pattern that has legitimate exceptions blocks real work. Soft-nudges measure whether the suggestion is useful before we commit to enforcing it. Ship the mechanism; let data drive the calibration.

**Consequences:** First cut of the coach is intentionally low-friction. May feel "soft" if Opus ignores all the nudges. That's the data Phase F looks for — patterns with poor take-rate are candidates for promotion OR refinement of the suggestion text. The escape-hatch protocol (`[delegation-bypass: <reason>]`) is implemented in Phase E even though no patterns use hard-gate yet, so it's ready when needed.

---

## Decision 4: Coach self-disables inside subagent sessions

**Context:** When Opus dispatches a subagent (e.g., `sonnet-explorer`), the subagent runs as its own Claude Code process with its own tool-use stream. Should the coach fire on subagent tool calls?

**Pick:** No. Coach short-circuits when running inside a subagent session.

**Rationale:** The whole point of dispatching a subagent is that delegation already happened. Coaching the subagent to delegate further is recursive nonsense (and the harness blocks subagents from spawning sub-subagents anyway). Detection: check `OUROBOROS_INTERNAL=1` env or the harness markers set on subagent processes (the `<SUBAGENT-STOP>` pattern in `using-superpowers.md` is one such marker).

**Consequences:** Coach sees only the orchestrator (top-level Opus) tool calls. Subagent tool calls are invisible to it, which is correct. If subagent behavior ever needs its own coaching layer, that's a separate subsystem with different patterns (e.g., "subagent should call done() instead of looping further").

---

## Decision 5: Storage at `{userData}/delegation-coach.jsonl`

**Context:** Where do nudge events + outcomes get persisted?

**Pick:** Append-only JSONL at `{userData}/delegation-coach.jsonl`. Same shape, location pattern, and rotation policy as `router-decisions.jsonl`. Per-OS path resolves to `%APPDATA%/ouroboros/delegation-coach.jsonl` on Windows, equivalents elsewhere.

**Rationale:** JSONL is the established pattern in this codebase for event streams (router decisions, quality signals, ranker hits, context outcomes). The IDE can read it for analytics; hooks can append to it via plain `fs.appendFile` without IPC. No schema migration story needed because each line is self-describing.

**Consequences:** Storage grows over time. Rotation policy: 10MB per file, keep last 5 (matches `routerLogger.ts`). Coach hooks running outside the IDE process need write permission to the userData directory — verify in Phase C that the path is computable from the hook (probably resolved via env var or a small helper that mirrors the per-OS logic from Wave 60's standalone path resolution).

---

## Decision 6: Housekeeping — kill the model-router auto-retrain loop in this wave

**Context:** The model-router retrain pipeline at `src/main/router/retrainTrigger.ts` is broken in production for the user's usage pattern. Every 30s it triggers a retrain, the trainer skips on insufficient data, validation fails because no output file was written, the counter never advances, and the loop repeats indefinitely. The diagnosis is in the wave plan's Housekeeping section.

Two fix options:

- **H1: Disable auto-retrain by default.** Add `routerSettings.autoRetrainEnabled: boolean` (default `false`). `observeDatasetGrowth` short-circuits when the flag is off. Decision/signal logging continues normally.
- **H2: Advance the counter on clean-skip.** When the trainer exits 0 but no valid output is produced, treat as "trainer skipped due to insufficient data" and call `setLastRetrainCount` anyway. Optionally check stdout for the "Skipping training" marker to confirm.

**Pick:** H1.

**Rationale:** The label generation pipeline is structurally incomplete for this user — `routerExporterHelpers.signalToLabel` only produces _reinforce-current-tier_ and _escalate-one-step_ labels, with no de-escalation path. With the user's all-Opus usage, ~100% of labels are OPUS, the trainer's `MIN_PER_CLASS_SAMPLES = 5` floor will never be reached organically, and even if H2 stops the loop spam, the underlying training pipeline still doesn't produce useful weights. The delegation coach is the active model-selection feature now; the model router's retrain loop has nothing to learn from this user's data. Clean shutoff is more honest than band-aid.

H2 stays available as a follow-up if anyone ever wants the retrain pipeline back on without re-reading the historical context.

**Consequences:**

- New optional config field `autoRetrainEnabled?: boolean` on `RouterSettings` (added to both `configTypes.ts` and `routerTypes.ts`); schema entry in `configSchemaTail.ts`; default `false`. Existing config blobs without the key parse cleanly because the field is optional.
- `observeDatasetGrowth` in `retrainTrigger.ts` reads the flag at observer start AND inside `checkAndRetrain` (live re-check, in case of runtime toggle).
- `loadRetrainedWeightsIfAvailable` is unaffected — pre-existing retrained weights are still loaded if present. Only the future retrain loop is gated.
- `[retrain] triggering retrain` and `[retrain] output weights invalid` log spam stops on next IDE launch.
- `src/main/router/CLAUDE.md` updated to note maintenance-only mode and reference Wave 61.
- Three new unit tests in `retrainTrigger.test.ts` cover (a) flag false → no interval, (b) flag missing → no interval, (c) flag true → interval starts.

**Verification (2026-04-30):**

- Edits applied to `configTypes.ts`, `router/routerTypes.ts`, `configSchemaTail.ts`, `router/retrainTrigger.ts`, `router/CLAUDE.md`, `router/retrainTrigger.test.ts`.
- `npx vitest run src/main/router/retrainTrigger.test.ts` — 16/16 pass (13 existing + 3 new).
- `npx vitest run src/main/configTypes.test.ts src/main/configAppTypes.test.ts` — 26/26 pass.
- `npx tsc --noEmit -p tsconfig.node.json` — clean.

---

## Decision 7: Open-question resolutions (Q1, Q2, Q3 from the wave plan)

### Q1 — Should the coach fire for chat-prompt-level model selection?

**Pick:** No.

**Rationale:** The user has decided "Opus by default." The coach is for sub-operations only — nudging individual tool calls toward the catalog or cheaper tiers. Coaching at the chat-prompt level would be the model router's job, and we've concluded the model router has no signal to optimize for this user (see Decision 6).

**Consequences:** Coach hooks fire on `PreToolUse` events only. There is no chat-prompt entry point. If the user ever wants chat-level model selection, that's a separate subsystem (likely the LLM judge or counterfactual sampler discussed in the wave plan's "Why this wave exists" section).

### Q2 — Should we do the session-trace audit before locking the pattern library?

**Pick:** Skip the audit. Ship the 10-entry seed library from the wave plan; tune from real data in Phase F.

**Rationale:** The audit would extract patterns from theory and recall, not data. Phase F analytics on real soak data is grounded in actual behavior. Shipping the seed library faster gets the data flowing sooner; the audit becomes redundant once a week of real data exists.

**Consequences:** First-cut pattern library may have wrong thresholds or miss patterns the audit would have caught. Phase F is the correction mechanism. If Phase F data shows the seed library is mostly noise, that's a signal to revisit; the wave plan already includes "patterns missing entirely" as a Phase F output.

### Q3 — Hook performance budget; index the pattern table upfront?

**Pick:** No indexing. Linear match over a fixed-size pattern table (≤50 entries) is sufficient.

**Rationale:** A linear scan over 10-50 entries is sub-millisecond. Indexing adds complexity (data structure choice, maintenance when patterns are added/removed) for a payoff that doesn't matter at this scale. Add indexing only if profiling shows it.

**Consequences:** Phase C must measure actual hook latency and record it in the result brief. If the measured p99 exceeds 30ms, revisit. Pattern library can grow to ~50 entries without architectural change; beyond that, revisit.

---

## Cross-references

- Wave plan: `roadmap/wave-61-delegation-coach.md`
- Files touched in Phase 0a: `src/main/configTypes.ts`, `src/main/router/routerTypes.ts`, `src/main/configSchemaTail.ts`, `src/main/router/retrainTrigger.ts`, `src/main/router/retrainTrigger.test.ts`, `src/main/router/CLAUDE.md`
- Related rule: `~/.claude/rules/agent-catalog.md` (the catalog the coach enforces)
- Related rule: `~/.claude/rules/best-practice-spectrum.md` (ADR template)
- Related plan: Wave 60 ADR at `roadmap/decisions/wave-60.md` (format reference)
