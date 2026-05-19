# Session Handoff — 2026-05-18 (Wave 94 + Wave 96 shipped; CI verifying; tag + temp-log pending)

**Audience:** the next Claude Code session.

---

## TL;DR

**Wave 94 (Chat-Workbench Completion) + Wave 96 (Renderer↔Main Type Coupling) shipped.** 33 commits pushed to `origin/master` (`82eca66d` → `a88d6b1f`). Wave 94 carries the 5-bug Phase E producer/consumer fix bundle (A-E). Wave 96 piggybacks: 3 phases that unblocked the pre-push `tsc:web` gate by cutting renderer→main type imports.

**CI is in-flight at handoff time.** When CI completes:
1. If green → `git tag v2.19.0 && git push --tags`
2. Append wave-temperature-log entry (HOT — see notes below)
3. `/promote-vendor-lessons 94` (likely no-op)
4. Then Wave 95 is unblocked — 8 phases ready (5 terminal QoL + 3 diff-review UX)

CI watch: `bd0e4g3py` (run id 26067523618) was watched in this session — read its output file or `gh run view 26067523618` on next session.

**If CI is red:** investigate. The pre-push `tsc:web` gate is now passing locally; CI failures are likely unrelated to this wave's changes (Wave 92 left Ubuntu+Windows CI in a known-flaky state per W-93 entries).

---

## Wave 94 — final shipped state

| Phase / commit | What |
|---|---|
| ADR `7830b630` | Locked Decisions 1–5 (`wave-94-decisions.md`) |
| E-test `abc04d66` | Orchestrator-owned acceptance test |
| A `488798ac` | Title-bar surface split |
| B `d4a2f1dc` | Per-project terminal isolation |
| C `00421a7e` | Dock-slot tabs |
| D `d080f92d` | Inner-rail terminals |
| E `1cd6ddce` | Diff-review producer wiring |
| Wrap `7d239949` | Result brief + CHANGELOG + v2.19.0 bump |
| Fixes 1-6 `5d34b9c4`-`3970d6be` | Wave-wrap smoke fixes |
| Fix bundle `b7dede57` | **Phase E bugs A-E** (this session, 5 cascading bugs) |
| Docs `b21028b4` | Wave 95 follow-up docs (3 diff-review UX items) |

## Wave 96 — final shipped state (this session)

| Phase / commit | What |
|---|---|
| Plan | `roadmap/wave-96-shared-types-extraction/waveplan-96.md` |
| A+B+C bundle `a88d6b1f` | Sync `ClaudeCliSettings` in `electron-foundation.d.ts` + redirect `useClaudeCliSettings.ts` and `electron-orchestration.d.ts` to renderer-local / `@shared` sources; fix 6 residual genuine errors (3 caused by Phase A, 3 pre-existing) |

Result: `tsc:web` 0 errors (was 616). `tsc:node` 0 errors. Scoped vitest 68/68 in touched components.

---

## The 5-bug Phase E cascade (for posterity)

`3970d6be`'s "fix" was inert. Lane B B2 instrumentation revealed why, then four more bugs surfaced beneath it. All evidence-grounded from runtime trace, all in one commit (`b7dede57`):

| Bug | Layer | Root cause | Fix |
|---|---|---|---|
| A | Producer | `pre_tool_use.mjs` never set `cwd` in payload; fallback `sessionCwdMap` keyed by IDE PTY IDs, not Claude UUIDs | Hook scripts now include `cwd: process.cwd()` |
| B | Consumer | Binding heuristic only fired on `session_start`; terminal-launched claude doesn't reliably emit it ahead of edits | Extended binding to fire on any TERMINAL_BIND_TRIGGER_TYPES event |
| C | Producer | Stash key used freshly-minted `crypto.randomUUID()` per call; pre and post never matched, stash grew unbounded | Source `tool_use_id` from Claude Code hook stdin; cap stash at 100 entries |
| D | Consumer | Bind-once-per-terminal froze first UUID; subsequent claudes' events filtered out | Rebind on different UUID (`SKIP_SAME_ID` for idempotency) |
| E | Renderer (IPC) | `git:diffReview` ran inside `buildSecureRegister` which validates against workspace roots; terminal claude can be in any project | Extracted to `registerDiffReviewChannel()` outside the security wrapper (read-only, narrowest possible bypass) |

Smoke flow verified end-to-end: terminal-launched claude edits file → producer stashes snapshot → emits `diff_review_ready` → consumer binds UUID via fallback → diff-review panel opens with content.

## What didn't ship — Wave 95 inbox (8 phases ready)

`roadmap/wave-95-chat-workbench-terminal-qol/waveplan-95.md` lists:

**Original 5 (pre-existing):**
- A: terminal tab rename
- B: scrollback bump
- C: ghost-cursor fix
- D: claude CLI color rendering in terminal
- E: secondary slot collapsed-chrome

**Added today (from Phase E smoke):**
- F: diff-review panel layout (80/20 inverted — CSS bug)
- G: cross-project grouping + attribution in diff-review
- H: Lane B investigation of "wrong edit shown"

All 8 follow-up docs in `roadmap/follow-ups/2026-05-18-*.md`.

## Wave 97 (pre-scheduled)

Full extraction of `ClaudeCliSettings`, `CodexCliSettings`, and other duplicated config slices into `src/shared/types/configSlices.ts`. Also full migration of `src/main/orchestration/types*.ts` (~40 types) into `src/shared/types/orchestrationTypes.ts`. Eliminates the drift risk Wave 96 papered over with the gotcha entry. Larger blast radius — touches `main/configTypes.ts` and all consumers. See Wave 96 plan's ADR for the rationale of deferring.

## Pre-push hook follow-up (informal)

`assets/hooks/pre_push_full_check.mjs` runs `tsc -p tsconfig.web.json` full-project on every push. With Wave 96 it now passes, but the design is fragile: any future cross-boundary import will re-explode the cascade. Consider switching to incremental-diff-only tsc check (industry standard 2026 pattern). File when convenient — not blocking.

## Older open follow-ups (unchanged from prior HANDOFF)

In `roadmap/bugs/`:
- `2026-05-17-chatstatenewpath-dynamic-require-threadstore.md` — OPEN, medium
- `2026-05-17-silent-buildrepoindex-hang-post-graph-ready.md` — TRIAGED, medium
- `2026-05-15-e2e-teardown-hang.md` — still open (Wave 93 carry-over)

In `roadmap/follow-ups/` (not bundled into any wave):
- `2026-05-16-wave-89-tool-bridge-runtime-smoke.md`
- `2026-05-16-wave-89-stacked-dock-integration-test.md`
- `2026-05-16-wave-89-dead-useWorkbenchCompare-hook.md`
- `2026-05-05-electron-renderer-browser-mcp-wiring.md`

---

## Working tree at session-end

```
 M tools/__fixtures__/train-context/test-output-weights.json
```

Pre-existing modification carried throughout the session, untouched. Same one HANDOFF showed at session-start.

---

## Wave 94 + 96 temperature: HOT

Drafted entry for `roadmap/wave-temperature-log.md` (append at wave-end after CI green):

> | W-94 + W-96 (Chat-Workbench Completion + emergency type-coupling unblock) | 2026-05-18 | HOT | Wave 94's Phase E shipped clean per spec (boundary acceptance test passed, 1078 tests green); pain concentrated entirely in post-merge smoke + push tail. Phase E `claude in terminal → diff review` was end-to-end broken: 5 cascading bugs in producer/consumer flow (A: payload.cwd absent; B: consumer bind-once-on-session_start when terminal-launched claude doesn't emit it reliably; C: stash key collision from random UUID per call growing unbounded; D: bind-once-per-terminal race blocking second claudes; E: cross-project pathSecurity blocking Gamify diffs in Agent IDE workspace). Lane B B2→B3 cycle ran TWICE — first fix attempt (`3970d6be`) was inert because the hook stdin doesn't carry `cwd` in the payload (only training data said it did). Instrumentation in 4 files + sonnet-diagnostician → sonnet-implementer x3 → all fixed in one final bundle. Push tail surprise: pre-push `tsc:web` gate found 616 pre-existing TS6307 errors blocking the push (renderer→main type cascade through `configTypes`). Surgical sonnet-architect plan turned out actually surgical (~10 lines, 3 files) — Wave 96 inline. Final result: 33 commits up, Wave 94 + 96 shipped together. Cost: ~6 hours of "this is 5 minutes from done" recurring. Lesson: when 3970d6be's diff was reviewed at wave-wrap, no one instrumented to confirm the fix worked against real Claude Code hook stdin — boundary tests passed because they mocked the payload shape we wished existed, not the shape Claude Code actually emits. Filed: Wave 97 (full shared-types extraction), pre-push hook incremental-check redesign, 3 diff-review UX follow-ups bumped to Wave 95 |

Append above as one row to `wave-temperature-log.md`'s entries table after CI green.
