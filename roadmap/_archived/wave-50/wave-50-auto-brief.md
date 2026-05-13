# Wave 50 Result — Rule-to-Hook Migration

**Status:** ✅ COMPLETED — 2026-04-27
**Version:** v2.8.2 (patch)
**Plan:** `roadmap/wave-50-plan.md`

---

## What shipped

Three mechanisms to shift rule enforcement from prompt-token cost + judgment-based adherence to deterministic harness-level checks:

1. **Four PreToolUse hooks** in `src/main/hooks/`:
   - `blockSecretWrites` — denies Write/Edit on `.env*` (allows `.env.sample`, `.env.example`, `.env.template`)
   - `blockLockfileEdits` — denies Write/Edit on `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`
   - `blockMinifiedOperations` — denies Read/Edit/Write on `*.min.js`, `*.min.mjs`, `*.min.css`
   - `warnFullTestSuite` — emits IDE-side warning when `npm test` / `npx vitest run` runs without trailing path arg
   Each hook respects a new `hooks.enforcedRules` config so users can disable individually.

2. **Two slash commands** at `~/.claude/commands/`:
   - `/init-safety` — pre-flight checks before generating a CLAUDE.md (was `~/.claude/rules/init-safety.md`)
   - `/claudemd` — canonical CLAUDE.md authoring template (was `~/.claude/rules/project-claude-md-template.md`)
   Soft migration — original rule files **stay in place** for one wave of soak; deletion is an out-of-wave follow-up.

3. **Graph-usage tap fix + adherence analyzer + decision.** Fixed the broken arg-capture in `hooksGraphUsageTap.ts` (was reading at the wrong nesting level — confirmed by Phase B's investigation). Built `scripts/analyze-graph-adherence.ts` walking the 378-file Claude Code session corpus at `~/.claude/projects/C--Web-App-Agent-IDE/`. **Decision: stay log-only at 93.9% adherence** (165 of 174 sessions ≥80% individual adherence; only 6.1% of 4,626 Grep+Read calls were symbol-shaped). Soft rule is working better than expected. `hooks.enforceGraphFirst` config key is reserved for future re-evaluation.

A `roadmap/wave-50-rule-classification.md` audit covers all 23 rules (14 global + 9 project): 16 keep, 4 hook (shipped this wave), 2 slash-command (shipped this wave), 0 delete. A `docs/hook-migration.md` migration guide explains the rule→hook map, rollback path, and how to re-enable `hooks.enforceGraphFirst` if quarterly re-runs of the analyzer flip the decision.

## Plan deviation

Original draft referenced a non-existent `src/main/hooks/graphUsageLogger.ts` (actual file: `src/main/hooksGraphUsageTap.ts` at top-level). Plan also assumed the existing telemetry corpus was usable, but verification found ~81% of entries had `args:{}` due to wrong-nesting arg capture in the Wave 48 tap. Both issues fixed. Phase D was reshaped to consume the much richer Claude Code session JSONL corpus instead of the broken tap output.

Phase C softened from "delete rule files on the same wave they move to slash commands" to "ship slash commands, leave rule files for one wave of soak." Removal becomes a follow-up after the slash commands prove out.

## Phase commits (master)

- `77098fc` — docs(wave-50): Phase A — rule classification audit
- `6fa6744` — feat(wave-50): Phase B — block-secret/lockfile/minified hooks + warn-full-test-suite
- `792f452` — feat(wave-50): Phase D — fix graph tap + adherence analyzer + decision
- `cca26e9` — docs(wave-50): Phase E — integration test + migration guide + doc updates

Phase C touched user-global config only (`~/.claude/commands/`, `~/.claude/CLAUDE.md`) — not version-controlled in this repo.

## Files touched (count)

- 14 new files in the project repo (4 hooks + tests, shared types, classifier + test, analyzer script, integration test, decision doc, raw data archive, migration guide, classification doc)
- 8 modified (config schema/types, hook dispatcher + entry, root CLAUDE.md, architecture doc, session-handoff, plan, graph tap)
- 2 new files in user-global config (slash commands)
- 1 modified user-global file (`~/.claude/CLAUDE.md` pointer)

## Phase D decision detail

| Metric | Value |
|---|---|
| Files scanned | 378 JSONL |
| Sessions with tool calls | 174 |
| Total Grep+Read calls | 4,626 |
| Symbol-shaped | 283 (6.1%) |
| Literal-shaped | 4,343 (93.9%) |
| Sessions ≥80% adherence | 165 (94.8%) |
| Sessions 60–80% | 8 |
| Sessions 40–60% | 1 |
| Sessions <40% | 0 |
| Decision threshold | ≥70% adherence → stay log-only |
| **Decision** | **stay log-only** |

Caveat: the classifier marks any bare-identifier Grep pattern as "symbol-shaped" without distinguishing "find callers of X" (a graph-routing gap) from "find all lines mentioning X" (correct Grep use). 6.1% is therefore an upper bound on actual graph-routing violations.

The decision is data-driven and re-runnable. Re-evaluate quarterly via `npx tsx scripts/analyze-graph-adherence.ts`. Activate `hooks.enforceGraphFirst` if a future run drops below 70%.

## Verification

| Gate | Result |
|---|---|
| `npx vitest run` | ✅ 871 files / 9171 passed / 8 skipped / 0 failures |
| `npx tsc --noEmit` | ✅ clean |
| `npm run lint` | ✅ 0 errors (2 pre-existing warnings in FileViewer files unrelated to this wave) |
| `npm run lint:claude-md` | ✅ all CLAUDE.mds within 200-line cap |
| Phase B hook scoped tests | ✅ 87/87 |
| Phase D classifier tests | ✅ 18/18 |
| Phase E integration test | ✅ 23/23 |

## Manual smoke

The wave touches no UI surfaces (`src/renderer/components/Layout/**` untouched), so the manual smoke gate from `~/.claude/rules/manual-smoke-gate.md` does not apply.

Slash command smoke is implicit — `/init-safety` and `/claudemd` are now visible in Claude Code's available skills list, confirming the commands loaded.

## Known limitations

- **`warnFullTestSuite` is IDE-log-only.** The hook protocol (`pre_tool_use.mjs`) supports `approve`/`reject` but no native warn path. Warnings surface via `log.info` on the IDE side — the agent doesn't see them. To make them agent-visible, surface the warn through stdout in `assets/hooks/pre_tool_use.mjs`. Tracked as a follow-up.
- **`hooks.enforcedRules` has no UI toggle.** Config-only today.
- **Phase D's classifier can't distinguish "find-callers" from "find-mentions".** A callee-aware classifier would require cross-referencing against the codebase graph's symbol table — out of scope for this wave.

## Out-of-wave follow-ups

- **Original rule file deletion.** After Wave 51 confirms `/init-safety` and `/claudemd` invocations are clean, delete `~/.claude/rules/init-safety.md` and `~/.claude/rules/project-claude-md-template.md`.
- **Project-level rule migration.** The 9 `.claude/rules/*.md` files are classified in `wave-50-rule-classification.md` but not converted; a future wave can promote any flagged candidates.
- **`warnFullTestSuite` agent-visible warning.** Small change to `pre_tool_use.mjs`.
- **Quarterly graph-adherence re-run.** `npx tsx scripts/analyze-graph-adherence.ts`. Activate `hooks.enforceGraphFirst` if adherence drops.
- **Hook misfire telemetry.** Measure block-to-retry rate over the next wave; tune messages.
- **User-facing hook toggle UI.** Surface `hooks.enforcedRules` in settings.
- **Callee-aware classifier.** Cross-reference Grep patterns against the graph's symbol table for higher-fidelity adherence numbers.
