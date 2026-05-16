# Codex transport architecture — exec-transport removal + app-server pooling/warm-up

**Status:** DEFERRED — preserved for future review; assumption check needed before closing
**Source:** Wave 45 follow-ups (`roadmap/_archived/wave-45-plan.md`)
**Filed:** 2026-05-01 — moved out of NOW-USELESS bucket so the developer can verify what changed before this is permanently dropped

## Why this lives in `deferred/` not closed

These items were originally proposed for closure as NOW-USELESS on the basis that "Codex architecture changed; pooling/warm-up no longer relevant to the current spawn model." The developer wanted these preserved so they can review what actually changed in the Codex stack and confirm the assumption holds before letting the items go. If the assumption is wrong, the work is real and should be filed as a future wave.

## What was deferred

### Wave 45 — Codex exec-transport removal
- **Item:** Remove the Codex exec-transport fallback path once the primary app-server transport showed <1% fallback rate in production
- **Why it was filed:** Wave 45 introduced the app-server transport as the primary; exec-transport was kept as a fallback during soak. The follow-up was to drop the fallback once telemetry confirmed it wasn't being hit
- **Why it was proposed for closure:** The Codex architecture moved on (Codex CLI v0.124+ has its own changes, see the user's existing memory about the CreateProcessAsUserW sandbox bypass); the dual-transport model from Wave 45 may no longer match the current spawn shape

### Wave 45 — App-server process pooling across sessions
- **Item:** Reuse a single Codex app-server process across multiple sessions instead of spawning fresh per session
- **Why it was filed:** Spawning a fresh app-server per session has cold-start cost; pooling would amortize that across sessions
- **Why it was proposed for closure:** If the current spawn model is one-shot per session (like terminal Claude Code), pooling doesn't apply

### Wave 45 — Session warm-up (pre-spawn app-server)
- **Item:** Pre-spawn an app-server before the user sends the first message so the first turn is fast
- **Why it was filed:** Cold-start latency on the first turn was visible during Wave 45 dogfood
- **Why it was proposed for closure:** Same as pooling — depends on whether the current architecture has a long-lived app-server to warm up

## Verification needed before closing

The developer should verify:

1. **Does Codex still use an app-server transport?** Check `src/main/orchestration/providers/codex*.ts` and the related Codex spawn code. If app-server is gone or has been replaced, all three items are moot. If it's still there, the items are real follow-ups.

2. **What's the current spawn shape per Codex session?**
   - One-shot per turn → pooling/warm-up don't apply, exec-transport fallback is also moot
   - Long-lived app-server per session → warm-up matters; pooling matters if multiple sessions can share
   - Pool of app-servers serving many sessions → all three items are live concerns

3. **Is exec-transport still in the codebase?** Grep for it. If it's been removed entirely, the "remove fallback after <1%" item is auto-closed. If it's still there as a fallback path, the question of whether to drop it depends on current telemetry.

## Likely investigation surface

- `src/main/orchestration/providers/codexAppServerProcess.ts` — app-server lifecycle
- `src/main/orchestration/providers/codexExecRunnerHelpers.ts` — exec-transport runner (may or may not still exist)
- `src/main/orchestration/providers/codex*.ts` (general) — current transport selection logic
- `src/main/codex/` if any subsystem-level CLAUDE.md exists — current architecture description
- Memory: `project_codex_sandbox_bypass.md` — confirms Codex CLI v0.124 has its own sandbox issues; may have triggered architecture changes

## Trigger conditions to revisit

Move from `deferred/` to `future/` (or close as NOW-USELESS) once verification answers these:

- **Close as NOW-USELESS** if app-server architecture has been replaced and exec-transport is gone — the items genuinely don't apply anymore
- **File as future wave** if app-server is still primary and the original cold-start / fallback-rate concerns are still observable
- **Re-scope** if the architecture is partially changed — e.g., app-server is still there but transport selection logic is different; the original items might map to a different shape now

## What this is NOT

- Not a current bug — there's no observed regression. This is a deferred-cleanup question.
- Not a Wave 45 reopening — the wave shipped. This is the soak-window follow-up that never closed.
- Not blocked on anything external — verification is a 30-minute code read.

## References

- `roadmap/_archived/wave-45-plan.md` — original Wave 45 plan with these out-of-scope items
- `src/main/orchestration/providers/CLAUDE.md` — provider subsystem map (may describe current Codex transport model)
- `roadmap/follow-ups/follow-ups.md:92-93` — original follow-up list entries
- Memory: `project_codex_sandbox_bypass.md` — Codex CLI v0.124 sandbox context
- Audit: `roadmap/audit-verification-pass.md` Section D items #14–15 (originally NOW-USELESS bucket; reclassified DEFERRED 2026-05-01)
