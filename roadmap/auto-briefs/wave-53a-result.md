# Wave 53a Result — Telemetry Parity: Migrate Remaining Surfaces

**Status:** ✅ COMPLETED — 2026-04-27
**Version:** v2.9.2 (patch)
**Plan:** `roadmap/wave-53a-plan.md`

---

## What shipped

Wave 53a finishes the telemetry parity work started in Wave 52. Three new surfaces migrated through the queue+drain pipe, plus auto-install so the user never edits `~/.claude/settings.json` by hand again. After this wave, **external Claude Code sessions produce telemetry records that feed the same SQLite store and JSONL sinks as IDE-orchestrated sessions** — the unified corpus Wave 53b's ranker measurement requires.

Five concrete deliverables:

1. **JSONL fallback in `assets/hooks/lib/ouroboros.mjs`** (Phase A). Single highest-leverage edit. When `sendEvent` to the IDE pipe fails (IDE down/unreachable), the hook appends to a `hook-events` queue file. The drain handler routes each captured event by type to its existing IDE-side tap — `telemetryStore.record`, `tapEditProvenance`, `tapGraphUsage`, conflict outcome correlation, terminal session signals. **Six audit surfaces close in one stroke** (#1, #2, #4, #6 conflict half, #12 terminal signals, #18). Write-on-fail, not dual-write — industry-standard fallback pattern, no duplicate I/O when sendEvent succeeds.

2. **Spawn-trace partial via SessionStart** (Phase B). Extends Wave 52's existing `session_start_spawn_cost.mjs` to also emit a `spawn-trace` record with redacted argv + cwdHash. Drain handler feeds `traceBatcher` → `orchestration_traces` table. Drain-side redaction via canonical `redactArgv` so there's a single source of truth for redaction logic. DB-backed dedup (cheaper than upfront-set construction).

3. **UserPromptSubmit hook + post-hoc shadow router** (Phase C). Reclassifies audit row #13 from `fundamentally-IDE-only` to `buffer-via-hook`. Hook captures raw prompt + cwd. Drain handler invokes existing `shadowRouteHookEvent` with two new flags: `postHoc: true` and `weightsVersion: <SHA-256 prefix>`. Live shadow path is byte-identical when the new flags are absent — confirmed by the existing 35 router tests still passing. Live record beats drain record when both exist for the same session.

4. **Operator-facing documentation** (Phase D). `docs/telemetry-parity.md` rewritten to cover all 4 surfaces (Wave 52's spawn-cost + Wave 53a's three) with full inventory table, per-surface dedup policies, schema-mirror discipline, and accepted-IDE-only-gap registry. `roadmap/session-handoff.md` updated. Telemetry subsystem CLAUDE.md gained a schema-mirror gotcha.

5. **Auto-install** (Phase E). `src/main/hookInstallerSettings.ts` programmatically registers the two settings.json hook entries (`session_start_spawn_cost.mjs` for SessionStart and `user_prompt_submit_router_shadow.mjs` for UserPromptSubmit) on every IDE boot. Idempotent additive merge — never duplicates entries, never disturbs the user's own. Atomic write via temp-file + rename. First-install backup. Malformed-file backup as defensive bonus.

## Best-practice resolutions baked in

The audit closed Wave 52 with five open questions. Wave 53a resolved each per industry-standard patterns:

- **Q1 (JSONL fallback semantics):** write-on-fail, not dual-write. Industry standard for pipe+fallback in telemetry — avoids duplicate I/O and dedup work. Telemetry is best-effort by design.
- **Q2 (Post-hoc shadow router):** yes, with `weightsVersion` stamp. Lets analyzers split session-time vs drain-time records. Decision-time matching is the gold standard for shadow routing; post-hoc with newer weights is a *different* signal but useful for forward-looking improvements.
- **Q3 (One-sided context outcomes):** deferred. YAGNI — Wave 53b decides whether the partial signal is worth the maintenance cost.
- **Q4 (Dedup key):** `(sessionId, surface)` default + per-handler override. Each migrated surface picks its policy and documents it.
- **Q5 (`schemaVersion` ownership):** per-surface TS schema file, comment-mirror in hook script, codified discipline in `docs/telemetry-parity.md`.

## Plan deviation

Phase E's brief said "auto-install all four hooks." Reality: only **two** settings.json entries are needed. Phase A's `hook-events` surface piggybacks on existing `pre_tool_use.mjs` etc. (no new entry — the JSONL fallback runs inside `ouroboros.mjs` which the existing hooks already import). Phase B's `spawn-trace` shares Wave 52's existing `session_start_spawn_cost.mjs`. So one SessionStart entry covers both spawn-cost and spawn-trace; one UserPromptSubmit entry covers router-shadow. Two entries, four telemetry surfaces — the surface count differs from the script count.

Other deviations:
- Phase C's `skipLayer3` flag in `routePromptSync` is currently a forward-compat no-op because Layer-3 isn't yet wired to the sync path (per `src/main/router/CLAUDE.md` gotcha — the LLM fallback exists but isn't called from the sync orchestrator). The flag is implemented per the brief; it'll start mattering when Layer-3 lands.
- Phase E added atomic write + backup that the existing `hookInstallerStatusLine.ts` and the older `registerHooksInSettings` don't have. Worth flagging as a possible future hardening of the older code paths (they're now relatively less safe).
- Phase C extracted `src/main/mainTelemetryHandlers.ts` to keep `main.ts` ≤300 lines after registering the fourth handler. Same pattern Wave 52 used (`telemetryDrainStartup.ts`).

## Phase commits (master)

- `fe1c878` — feat(wave-53a): Phase A — JSONL fallback in ouroboros.mjs + multi-sink drain handler
- `610d122` — feat(wave-53a): Phase B — spawn-trace partial via SessionStart
- `d9d4b2e` — feat(wave-53a): Phase C — UserPromptSubmit hook + post-hoc shadow router
- `252bdda` — docs(wave-53a): Phase D — telemetry-parity doc + per-surface schemas
- `ee12b1e` — feat(wave-53a): Phase E — auto-install telemetry hooks via settings.json registry

## Files touched (count)

- 13 new files (3 schema files, 3 drain handlers, 3 corresponding tests, 1 hook script, 1 hook-installer settings module, 1 mainTelemetryHandlers extraction, 1 schema test)
- 9 modified (`ouroboros.mjs`, `session_start_spawn_cost.mjs`, `routerShadow.ts`, `routerTypes.ts`, `routerFeedback.ts`, `orchestrator.ts`, `hookInstaller.ts`, `main.ts`, several existing test fixtures)
- 3 docs (telemetry-parity.md rewrite, session-handoff.md update, src/main/telemetry/CLAUDE.md gotcha addition)

## Verification

| Gate | Result |
|---|---|
| `npx vitest run` (timeout 800) | ✅ 891 files / 9372 passed / 8 skipped / 0 failures |
| `npx tsc --noEmit` | ✅ clean |
| `npm run lint` | ✅ 0 errors (2 pre-existing FileViewer warnings unrelated) |
| `npm run lint:claude-md` | ✅ all CLAUDE.mds within 200-line cap |
| Phase A scoped tests | ✅ 28/28 (hookEventsSchema + hookEventsDrainHandler) |
| Phase B scoped tests | ✅ 15/15 (spawnTraceSchema + spawnTraceDrainHandler) |
| Phase C scoped tests | ✅ 13/13 new + 35/35 existing router tests |
| Phase E scoped tests | ✅ 23/23 |
| Existing 35 router tests | ✅ unchanged behavior on live shadow path |

## Manual smoke (deferred to user)

The wave's runtime smoke requires the user to:
1. Launch the IDE once. Auto-install runs at boot — verify `~/.claude/settings.json` now contains the two new hook entries.
2. Close the IDE.
3. Run an external Claude Code session in any working directory.
4. Re-launch the IDE. The drain runs at startup.
5. Verify records appear (with `ide_session: false` or `postHoc: true` markers) in:
   - `~/.ouroboros/telemetry/mcp-spawn-cost.jsonl` — spawn-cost records
   - `{userData}/.../router-decisions.jsonl` — post-hoc shadow records
   - SQLite `events`, `outcomes`, `orchestration_traces` tables — events from the JSONL fallback drain

No UI surfaces touched, so the wave-process manual smoke gate doesn't apply.

## Subagent observations

All five phases executed with `model: "sonnet"` per the global rule (corrected from prior wave's omission).

- Phases A, B, C, E all stopped mid-tool-loop on the same pattern — adding an import that's not yet referenced triggers the unused-import lint hook before the call site is in place. Resumed via `SendMessage` cleanly each time. Phase D ran clean first try (docs-only, no lint hook conflict).
- Phase C extracted `mainTelemetryHandlers.ts` defensively (300-line cap). Phase E added atomic-write + backup that exceed the existing `hookInstallerStatusLine.ts` discipline.
- Honest disclosure across all phases. No false-success claims.

## Known limitations

- **`skipLayer3` is a forward-compat no-op.** Will activate when Layer-3 wiring catches up.
- **Backup proliferation.** First-install backup runs once per detected "first install"; if the user deletes the backup, a subsequent install creates another. Could add a marker to suppress repeated backups. Minor.
- **No auto-uninstall.** If a hook becomes obsolete in a future wave, the entry stays in settings.json. Manual cleanup. Documented for future hardening.
- **`docs/telemetry-parity.md` is 365 lines** (above the soft 280-320 guideline from the plan). Each section earns its lines; not bloated. No hard cap on `docs/` files.

## Out-of-wave follow-ups

- **Wave 53b** unblocked: original ranker measurement (offline analysis + variant ranker) on the now-unified corpus. Use `weightsVersion` to split session-time vs drain-time shadow records.
- **Codegen hook helper from TS schema** — eliminate the comment-mirror discipline. Schema becomes single source of truth, hook helper generated. Future wave.
- **Lint check for schema mirror drift** — grep hook scripts for the mirror marker, verify against the TS type. Future wave.
- **Hook auto-uninstall** — when a hook is removed in a future wave, automatically clean up its settings.json entry. Currently manual.
- **PostToolUse → file-touched-per-turn** (audit #5 partial signal). Wave 53b decides whether the one-sided signal is worth capturing.
- **Harden existing `hookInstallerStatusLine.ts`** to use the same atomic-write + backup pattern Phase E introduced. Pre-existing weaker pattern.
