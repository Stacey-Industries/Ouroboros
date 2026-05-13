# Wave 53 Auto-Execution Brief

You are an autonomous Claude Code teammate dispatched at ~05:05 on 2026-04-26 to execute Wave 53. You have a hard stop at **08:45 local** (~3h 40m). The plan is a **draft**, not a contract.

## Your task

Implement Wave 53 (Telemetry Recovery & Router Signal Restoration) end-to-end on a dedicated branch. `roadmap/wave-53-plan.md` is a draft — read it, validate against current code, refine where the draft has drifted, and implement clean code. Cross-reference `roadmap/telemetry-recovery-and-corpus-analysis.md` (the underlying handoff doc this wave implements). Document refinements in your result note.

You are not a script. You are an engineer with the wave plan as input and the codebase as ground truth.

## Independence

You have peer teammates (Wave 46, Wave 48) running in parallel on independent subsystems. **Do not message them.** Do not depend on their work. Your branch must apply cleanly on top of the master HEAD that existed when you started.

## Branch policy

- Branch from current `master` HEAD: `auto/wave-53`.
- Commit per phase: `feat(wave-53): Phase A — <summary>` / `fix(wave-53): ...` / `refactor(wave-53): ...`.
- **DO NOT push, fetch, or merge. DO NOT touch `master`.** All commits stay local on `auto/wave-53`.

## Local config in scope

You inherit the user's `~/.claude/` config:

- **Agent catalog routing**: custom catalog only.
- **Sonnet for subagents**: never `model: "opus"` for subagents. (One-shot exception for you, the teammate, to run Opus medium.)
- **ESLint**: `max-lines-per-function:40`, `complexity:10`, `max-lines:300`, `max-depth:3`, `max-params:4`. Never relax.
- **Test scope**: only `npx vitest run <touched-paths>`. No full suite.
- **Debug-before-fix**: instrument before re-fixing.
- **No secrets**: never log/commit `.env*` values.
- **Memory** (`MEMORY.md`): user on Max subscription, no API key. **Critical for this wave**: per the `project_telemetry_dark_signals` memory, telemetry jsonls are currently **dark for claude-code/codex paths** because instrumentation was built for the anthropic-api path. Wave 53 is the wave that fixes this. Do not assume existing telemetry data is trustworthy — read the code path, not the recorded events.
- **Telemetry SQLite store**: see `reference_telemetry_sqlite.md` memory for DB path, schema, JSON1 query pattern, gating flag.

## Process

1. Read `roadmap/wave-53-plan.md` in full AND skim `roadmap/telemetry-recovery-and-corpus-analysis.md`.
2. Note the feature flag flips: `telemetry.structured` default `false` → `true`; new `telemetry.remote` (default `false`); new `router.shadowMode` (default `true`). Do NOT flip `telemetry.remote` to `true` — that's a separate future wave.
3. Validate the draft against current telemetry code paths. Identify drift, document refinements.
4. Phase by phase: refine slicing if needed → implement → touched tests → typecheck → diff self-review → commit.
5. Per-phase verification:
   - `npx tsc --noEmit -p tsconfig.json` after main-process `.ts` changes
   - `npx vitest run <paths>` for new/modified tests
6. On completion: write `roadmap/auto-briefs/wave-53-result.md` summarizing: phases shipped, flag flips, draft refinements, verification, deferred items, and any signals about whether the dark-events memory entry can now be retired. Commit on the branch.
7. **Hard stop at 08:45 local.** Mid-phase stop → `wip(wave-53): partial — <reason>` + result note.

## Out of scope

- Pushing, fetching, merging
- Modifying `master` or other teammates' files
- Wiring router *enforcement* (Wave 53 restores signals + shadow mode only)
- Flipping `telemetry.remote` to `true` by default
- Editing `~/.claude/`
- Running the full vitest suite

## Special caution: corpus analysis

If the wave plan asks for corpus analysis on historical jsonls: **do NOT include user prompts or response bodies in any committed analysis output.** Redact freeform text. Keep only structural data: counts, model IDs, durations, token counts, event-type distributions. The user's actual conversations must not land in a committed file.

## If genuinely blocked

Write `roadmap/auto-briefs/wave-53-blocked.md` with the precise question, commit on the branch, stop.
