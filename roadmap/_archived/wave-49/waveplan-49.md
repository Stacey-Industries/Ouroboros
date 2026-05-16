# Wave 49 — CLAUDE.md Lean Generation + Organic Growth

## Implementation Plan

**Status:** ✅ COMPLETED — 2026-04-27 · Released as v2.8.1 · Result: `roadmap/auto-briefs/wave-49-result.md`
**Version target:** v2.8.1 (patch — generation prompt, hook, lint, docs)
**Feature flags:** new `claudeMdSettings.leanMode` (default `true`), new `claudeMdSettings.maxLines` (default `200`)
**Dependencies:** Wave 48 hook infra, Wave 59 shipped (v2.8.0)
**References:**
- `src/main/claudeMdGenerator.ts`
- `src/main/claudeMdGeneratorSupport.ts`
- `src/main/configSchemaTail.ts` (existing `claudeMdSettings` namespace at line 168+)
- `src/main/hookInstallerCommands.ts` / `src/main/hooksSessionHandlers.ts` (Wave 48 hook infra)
- Anthropic Claude Code docs: "Target under 200 lines per CLAUDE.md file"

---

## Why this wave was revised

The original draft (now superseded) targeted four files claimed to be 30–75% over the 200-line cap. Verification on 2026-04-27 found those files all under cap (88–179 lines) — they were either groomed in waves 41/43 or the original audit was wrong. The "rescue" framing is obsolete.

What still has merit:

- **No lean generation prompt today.** The current `claudeMdGenerator` happily produces 350-line files; nothing constrains it to exclude derivable content. Future generations will repeat the pattern.
- **No organic-growth path.** A gotcha discovered during normal work doesn't get captured unless a human remembers.
- **No size-cap enforcement.** Files can creep past 200 lines without anyone noticing — today's top-N (Terminal 209, ipc-handlers 209, renderer/hooks 205, AgentMonitor 202) are mild but unmonitored.

So Wave 49 reframes from **rescue** to **prevention**: ship the lean prompt, the gotcha-update nudge hook, and the size-cap lint. A small manual trim of the 4 marginal-over files lands in Phase D.

---

## Overview

The repo has 57 CLAUDE.md files (was 51 when the original draft was written). Most are well under 200 lines. The current generation pipeline has no constraints to keep it that way.

Anthropic's guidance: **target under 200 lines per CLAUDE.md file**, longer files reduce adherence. The structural answer is **CLAUDE.md is for tribal knowledge; the codebase graph serves derivable content on demand** (`get_architecture` / `search_graph` / `trace_call_path`). File-role tables, dependency lists, and architecture flows in CLAUDE.md are stale duplicates of what the graph already knows.

Wave 49 ships three mechanisms:

1. **Lean generation prompt** — excludes derivable content by construction; emphasizes the phrase "OMIT rather than speculate" as the primary guardrail. Quotes inline `// NOTE:` / `// WARNING:` / `// DO NOT:` comments as supporting evidence.
2. **Gotcha-update Stop-hook** — passively nudges agents to consider whether a bug-fix session reveals a gotcha worth capturing. Soft enforcement; telemetry tracks follow-through.
3. **Size-cap lint** — `npm run lint:claude-md` fails on any CLAUDE.md over 200 lines. Grandfather marker for files awaiting regeneration.

---

## Implementation review summary

### Confirmed state (2026-04-27)

- ✅ `src/main/claudeMdGenerator.ts` — orchestration loop. Spawns `claude` CLI headless. Model configurable.
- ✅ `src/main/claudeMdGeneratorSupport.ts` — directory discovery, file listing, `buildPrompt`, git-diff stale detection.
- ✅ `src/main/configSchemaTail.ts:168+` — existing `claudeMdSettings` namespace with `enabled`, `triggerMode`, `model`, `autoCommit`. **Phase A extends this, does not create a new namespace.**
- ✅ Wave 48 hook infrastructure: `hookInstallerCommands.ts`, `hooksSessionHandlers.ts` — reusable.
- ❌ No `src/main/hooks/` subdirectory exists — Phase C creates it.
- ❌ No `lint:claude-md` script, no `scripts/claude-md-size-check.ts`, no `docs/claude-md-lifecycle.md`.
- ❌ `src/main/CLAUDE.md` (178 lines) contains a duplicate old-format `# \`src/main/\`` section followed by a newer `# src/main/` section — Phase D trim catches this.

### Config-key collision (resolved)

- `claudeMdGeneration` exists as a **string** under `modelSlots` (line 154) — that's the *model ID* for generation jobs.
- `claudeMdSettings` is the **settings object** (line 168+) — the right place to add `leanMode` and `maxLines`.
- **Resolution:** extend `claudeMdSettings`. Leave `modelSlots.claudeMdGeneration` untouched.

### Today's near-cap CLAUDE.mds (Phase D targets)

| File | Lines | Over by |
|---|---|---|
| `src/renderer/components/Terminal/CLAUDE.md` | 209 | +9 |
| `src/main/ipc-handlers/CLAUDE.md` | 209 | +9 |
| `src/renderer/hooks/CLAUDE.md` | 205 | +5 |
| `src/renderer/components/AgentMonitor/CLAUDE.md` | 202 | +2 |

Trim target ≤195 to leave headroom. **Manual review only — do not regenerate.**

---

## Scope

### In-scope

- Lean prompt template that excludes file-role tables, subdirectory indexes, dependency lists, architecture diagrams. Explicit "OMIT rather than speculate" constraint.
- Inline-warnings extraction from source (`// NOTE:`, `// WARNING:`, `// DO NOT:`, `// HACK:`, `eslint-disable — reason:` comments).
- Stop-hook that nudges agent to consider gotcha capture after bug-fix-shaped sessions.
- Size-cap lint with grandfather marker.
- Project-CLAUDE.md gotcha-maintenance rule.
- Marginal trim of the 4 files at 202–209 lines (manual, ≤195 target).
- `docs/claude-md-lifecycle.md`.

### Out-of-scope

- Regenerating any CLAUDE.md (Phase B from the original draft is dropped).
- Changing global `~/.claude/CLAUDE.md`.
- Removing CLAUDE.mds entirely.
- Gotcha extraction from git history backfill (possible Wave 60+).

---

## Architecture

```text
generation (wave 49 onwards)
 ├─ generateForPath(dir)
 │    ├─ collectCodeSamples            (unchanged)
 │    ├─ collectInlineWarnings         ← NEW: scrape // NOTE / // WARNING / // DO NOT
 │    └─ buildPrompt(strategy)         ← REFACTOR: accept lean | legacy template
 │         └─ leanTemplate
 │              ├─ EXCLUDE derivable content
 │              ├─ INCLUDE only non-derivable
 │              └─ OMIT rather than speculate
 └─ writeClaudeMd(dir, result)
       └─ validateSize(<= maxLines)    ← NEW: warn on overshoot

organic growth (wave 49 onwards)
 └─ Stop hook on session end
      ├─ detectBugFixInDiff()
      └─ if fixed → nudge agent (passive)

lint
 └─ npm run lint:claude-md             ← NEW: pre-commit check for size cap
```

**Key design calls:**

- The phrase **"OMIT rather than speculate"** is non-negotiable. Without it, generators fill empty space with invented gotchas.
- The lean prompt explicitly tells the generator to quote inline comments as supporting evidence — anchors gotchas in code, not imagination.
- The Stop-hook is a *nudge*, not enforcement. Over-hooking breeds friction.
- Size-cap lint allows grandfathering via a comment marker (`<!-- claude-md-grandfathered -->`) so we don't break CI on day-one. Add the marker to all current ≤200 files? No — only files that are *over* and not yet groomed need it. Phase D leaves the 4 marginal trims under-cap, so no grandfathering needed at wave close.

---

## Phase A — Lean generation prompt + inline warnings

**Goal:** Future generations produce lean CLAUDE.mds by construction.

### New files

| File | ~Lines | Description |
|---|---|---|
| `src/main/claudeMdGeneratorLeanPrompt.ts` | ~200 | Builds the lean prompt template from inputs: dir path, inline warnings, dir size category. |
| `src/main/claudeMdGeneratorLeanPrompt.test.ts` | ~160 | Snapshot tests for prompt shape at varied input sizes. |
| `src/main/claudeMdGeneratorInlineWarnings.ts` | ~140 | Extracts `// NOTE:`, `// WARNING:`, `// DO NOT:`, `// HACK:`, `eslint-disable — reason:` from `.ts/.tsx` files in a dir. Returns structured list `{ file, line, kind, text }`. |
| `src/main/claudeMdGeneratorInlineWarnings.test.ts` | ~120 | Coverage for each comment-kind, edge cases (empty dir, nested comments, multi-line warnings). |

### Modified files

| File | Change |
|---|---|
| `src/main/claudeMdGenerator.ts` | Route generation through lean prompt when `claudeMdSettings.leanMode === true`. Inject inline warnings into prompt context. |
| `src/main/claudeMdGeneratorSupport.ts` | Refactor `buildPrompt` to accept a `strategy: 'lean' \| 'legacy'` parameter. Default `'lean'`. |
| `src/main/configSchemaTail.ts` | Extend existing `claudeMdSettings` (line 168+) with `leanMode: boolean` (default `true`) and `maxLines: number` (default `200`). |
| `src/main/configTypes.ts` | Add the two fields to the corresponding TS interface. |

### Subagent briefing (Phase A — sonnet-implementer)

- **Read first:** `claudeMdGenerator.ts`, `claudeMdGeneratorSupport.ts`, the existing `claudeMdSettings` block in `configSchemaTail.ts:168+`, and 2–3 current CLAUDE.mds (e.g., `src/main/CLAUDE.md`, `src/renderer/components/Terminal/CLAUDE.md`) to see what "too much" looks like today.
- **Schema:** extend `claudeMdSettings`, do **not** create a new `claudeMdGeneration` object — that name is taken by the model-slot string at line 154.
- **Prompt template MUST include:**
  - Explicit EXCLUDE list: file-role tables, subdirectory indexes, import/export dependency lists, architecture flow diagrams.
  - Explicit INCLUDE list: gotchas (load-bearing patterns, design decisions with rationale, "don't refactor this" warnings).
  - The phrase **"OMIT rather than speculate"** verbatim.
  - Target size: under 150 lines (headroom under 200-line cap).
  - Directive to quote inline warnings as supporting evidence.
- **Do NOT** have the prompt say only "be concise" — models will reformat derivable content into tighter tables, not exclude it.
- **Test policy:** scoped vitest only (`npx vitest run src/main/claudeMdGenerator*.test.ts`). Do NOT run the full suite — orchestrator does that at wave close.
- **Commit:** `feat(wave-49): Phase A — lean CLAUDE.md generation prompt`

### Acceptance

- [ ] `claudeMdGeneratorInlineWarnings` extracts all five comment kinds from a fixture dir.
- [ ] Lean prompt fixture outputs target ≤150 lines (sample with a small fixture dir).
- [ ] Prompt contains "OMIT rather than speculate" verbatim.
- [ ] `claudeMdSettings.leanMode` and `.maxLines` available; defaults `true` / `200`.
- [ ] Scoped tests pass.
- [ ] No new ESLint violations (`max-lines-per-function: 40`, `complexity: 10`, `max-lines: 300`).
- [ ] Commit lands.

---

## Phase C — Gotcha nudge hook + size-cap lint

**Goal:** Organic growth + cap enforcement. (Phase B from the original draft is dropped — see "Why this wave was revised".)

### New files

| File | ~Lines | Description |
|---|---|---|
| `src/main/hooks/gotchaUpdateNudge.ts` | ~180 | Stop-hook handler. Inspects session diff; if it contains a bug-fix pattern (commit message keywords + modifications to existing files), prompts the agent to consider documenting the gotcha. Passive — does not block session completion. |
| `src/main/hooks/gotchaUpdateNudge.test.ts` | ~160 | Trigger-classification tests: bug-fix-shaped sessions trigger; greenfield sessions don't. |
| `scripts/claude-md-size-check.ts` | ~100 | Walks repo; flags any CLAUDE.md > `claudeMdSettings.maxLines` lacking the `<!-- claude-md-grandfathered -->` marker. Exit 1 on violations. |

### Modified files

| File | Change |
|---|---|
| `CLAUDE.md` (project root) | Add "Gotcha maintenance rule" section: when an agent discovers a non-obvious constraint during work, append a line to the nearest subsystem `## Gotchas` before completing. Format: `- **<topic>**: <rule>. Reason: <why>.` |
| `src/main/hookInstallerCommands.ts` | Add Stop-event entry pointing at the new nudge hook. |
| `src/main/hooksSessionHandlers.ts` | Route Stop events through `gotchaUpdateNudge.evaluate`. |
| `package.json` | Add `lint:claude-md` script: `tsx scripts/claude-md-size-check.ts`. |
| `.husky/pre-commit` (or pre-commit script chain) | Wire `npm run lint:claude-md` into pre-commit. |

### Subagent briefing (Phase C — sonnet-implementer)

- **Read first:** `hookInstallerCommands.ts`, `hooksSessionHandlers.ts`, Wave 48's `graphUsageLogger.ts` for the "passive structured-log nudge" pattern.
- The nudge is **passive**: emit a structured message + telemetry entry, do NOT block session completion or stash work.
- **Detection heuristic:** session changed existing files (not only adds), AND commit message contains `fix`, `bug`, `issue`, `gotcha`, `regression`, or similar. Over-trigger is acceptable — the agent can dismiss.
- Size-cap lint allows grandfather marker so the wave doesn't break CI on day-one. Phase D's trim brings the 4 near-cap files under, so we should NOT need any grandfather markers in the repo at wave close. If lint fails on something unexpected, surface it — do not auto-add markers.
- The gotcha rule in project CLAUDE.md is **prescriptive**: "MUST append before completing the task."
- **Test policy:** scoped vitest only.
- **Commit:** `feat(wave-49): Phase C — gotcha nudge hook + size cap lint`

### Acceptance

- [ ] Stop-hook fires and emits a structured nudge for bug-fix-shaped sessions.
- [ ] Hook records a telemetry entry regardless of agent follow-through.
- [ ] `npm run lint:claude-md` exits 1 on any CLAUDE.md > 200 lines without grandfather marker.
- [ ] Project CLAUDE.md contains the gotcha-maintenance rule.
- [ ] `lint:claude-md` runs in pre-commit.
- [ ] Scoped tests pass.
- [ ] No new ESLint violations.
- [ ] Commit lands.

---

## Phase D — Integration test, docs, marginal trim

**Goal:** End-to-end coverage; new doc; bring all current CLAUDE.mds under cap.

### New files

| File | ~Lines | Description |
|---|---|---|
| `src/main/claudeMdGeneration.integration.test.ts` | ~220 | Runs lean generation against a test-fixture dir; asserts output shape and ≤150 lines. |
| `docs/claude-md-lifecycle.md` | ~220 | How CLAUDE.mds are generated, groomed, and grown. The gotcha rule. When to regenerate vs trim. |

### Modified files

| File | Change |
|---|---|
| `src/renderer/components/Terminal/CLAUDE.md` (209 → ≤195) | Manual trim — collapse redundant sections, remove derivable file-role rows. |
| `src/main/ipc-handlers/CLAUDE.md` (209 → ≤195) | Manual trim. |
| `src/renderer/hooks/CLAUDE.md` (205 → ≤195) | Manual trim. |
| `src/renderer/components/AgentMonitor/CLAUDE.md` (202 → ≤195) | Manual trim. |
| `src/main/CLAUDE.md` (178) | Dedupe — file currently has both an old-format and new-format section. Consolidate. Stay under 200. |
| `CLAUDE.md` (project root) | Update "Known Issues / Tech Debt" — drop CLAUDE.md size items as they're addressed. Add pointer to `docs/claude-md-lifecycle.md`. |
| `docs/architecture.md` | Update CLAUDE.md section to reflect lean-by-default. |
| `roadmap/session-handoff.md` | Note the grooming workflow for future near-cap files. |

### Subagent briefing (Phase D — sonnet-implementer)

- **Read first:** the 4 over-cap files, `src/main/CLAUDE.md`, current `docs/architecture.md` CLAUDE.md section.
- **Trim discipline:** preserve gotchas, design decisions, and inline-warning quotes. **Drop** file-role tables, subdirectory indexes, dependency lists, architecture flow diagrams — these are graph-derivable.
- For `src/main/CLAUDE.md`: it has `# \`src/main/\`` (old format with extensive file-map tables) followed by `# src/main/` (newer format). Keep the newer one; salvage any unique gotchas from the old before deletion.
- Do NOT regenerate any file. Manual edits only.
- Integration test: spin a temporary fixture dir, invoke lean generation through the in-process function (no real `claude` CLI spawn — mock the spawn), assert output ≤150 lines and contains "## Gotchas".
- **Test policy:** scoped vitest. Orchestrator runs full suite at wave close.
- **Commit:** `docs(wave-49): Phase D — integration test, lifecycle docs, marginal trims`

### Acceptance

- [ ] All 5 trimmed/deduped files ≤195 lines.
- [ ] No CLAUDE.md in repo > 200 lines without grandfather marker.
- [ ] `lint:claude-md` passes clean.
- [ ] `claudeMdGeneration.integration.test.ts` passes.
- [ ] `docs/claude-md-lifecycle.md` covers generation / grooming / organic growth / size cap.
- [ ] Project CLAUDE.md tech-debt section updated.
- [ ] Commit lands.

---

## Subagent execution model

- **Model:** `sonnet` (catalog: `sonnet-implementer` for all three phases)
- **Isolation:** sequential on `master`, no worktree (low blast radius — generation pipeline + new dir + docs)
- **Test policy:** scoped vitest per phase; orchestrator runs full suite + lint + lint:claude-md at wave close
- **Commit policy:** conventional commits, one per phase
- **Push policy:** orchestrator (this session) reviews aggregate diff and pushes once after wave close — NOT per phase
- **Scope discipline:** phase agents may NOT touch files outside their stated scope. Do NOT regenerate any CLAUDE.md. Do NOT modify global `~/.claude/CLAUDE.md`.

### Phase dispatch order

1. **Phase A** — lean prompt + inline warnings (foundation)
2. **Phase C** — gotcha hook + size-cap lint (independent of A — could run parallel, but per current async-block rule we run sequential)
3. **Phase D** — integration test + docs + marginal trims (depends on A and C)

---

## Risks

| Risk | Mitigation |
|---|---|
| Lean prompt produces too-skeletal output that loses real value. | Integration test asserts presence of `## Gotchas` and the inline-warning quotes. Iterate the prompt before merging if quality is poor. |
| Generator invents gotchas despite "OMIT rather than speculate". | Fixture test uses a dir with no inline warnings — expect empty `## Gotchas`. Fail if invented content appears. |
| Stop-hook over-nudges and becomes annoying. | Conservative trigger heuristic. Telemetry tracks nudge-vs-follow-through; tune in a follow-up if needed. |
| Size-cap lint breaks existing CI immediately. | Phase D's trim brings all current near-cap files under. Grandfather marker is available as escape hatch but unused at wave close. |
| Manual trims accidentally drop genuine architectural content. | Each trim is a separate file under one Phase-D commit, reviewable. Orchestrator review before push. |
| Agents ignore the gotcha-maintenance rule. | Telemetry will reveal follow-through rate. Wave 60+ can convert to enforcement if soft rule isn't sufficient. |

---

## Acceptance criteria (wave-level)

- [ ] Three phase commits on `master`.
- [ ] `npx vitest run` (timeout 360) — 0 failures.
- [ ] `npx tsc --noEmit` — 0 errors.
- [ ] `npm run lint` — 0 errors.
- [ ] `npm run lint:claude-md` — 0 errors, no grandfather markers in repo.
- [ ] All CLAUDE.md files ≤200 lines.
- [ ] Result brief at `roadmap/auto-briefs/wave-49-result.md` with smoke notes.
- [ ] Status flipped to ✅ COMPLETED in this plan.
- [ ] Single push at wave close.

---

## Out-of-wave follow-ups

- **Gotcha extraction from git history** — backfill gotchas by mining bug-fix commits.
- **Lint rule: disallow derivable content** — stricter regex enforcement of the EXCLUDE list against file-role table patterns.
- **Subsystem-aware generation** — haiku for small dirs, sonnet for complex ones, opus rarely.
- **Telemetry-driven prompt tuning** — measure nudge follow-through and lean-output quality over time; iterate.
