# Wave 49 Result — CLAUDE.md Lean Generation + Organic Growth

**Status:** ✅ COMPLETED — 2026-04-27
**Version:** v2.8.1 (patch)
**Plan:** `roadmap/wave-49-plan.md`

---

## What shipped

Three mechanisms to keep CLAUDE.mds lean and growing organically rather than rotting through neglect:

1. **Lean generation prompt** — future generations exclude file-role tables, subdirectory indexes, dependency lists, and architecture flow diagrams by construction. Inline `// NOTE:`, `// WARNING:`, `// DO NOT:`, `// HACK:`, and `eslint-disable — reason:` comments are extracted from source and injected as supporting evidence. The prompt enforces "OMIT rather than speculate" verbatim and tells the model to leave `## Gotchas` empty when no warnings exist rather than invent.

2. **Gotcha-update Stop-hook** — passively nudges agents on bug-fix-shaped sessions to consider whether the fix reveals a gotcha worth documenting. Triggers when a session both (a) modified existing files (not only adds) and (b) the commit message contains a bug-fix keyword. Does not block session completion; logs structured telemetry regardless of follow-through.

3. **Size-cap lint** — `npm run lint:claude-md` walks the repo and fails on any CLAUDE.md > 200 lines lacking the `<!-- claude-md-grandfathered -->` marker. Wired into pre-commit, but gated on staged CLAUDE.md files only so pre-existing violations (none at wave close) don't block unrelated commits.

A new `docs/claude-md-lifecycle.md` documents the generation / grooming / organic growth / size-cap workflow end-to-end. Five over-cap or duplicated CLAUDE.mds were trimmed by hand (not regenerated) to preserve genuine gotchas while dropping derivable content.

## Plan deviation

Original draft proposed a Phase B that regenerated four CLAUDE.mds claimed to be 30–75% over the 200-line cap. Verification on 2026-04-27 found those files all under cap (88–179 lines) — either groomed in waves 41/43 or the original audit was inaccurate. Phase B was dropped. Wave reframed from "rescue over-budget files" to "prevent future bloat." A small manual trim of today's actual near-cap files folded into Phase D.

## Phase commits (master)

- `ecbbad0` — feat(wave-49): Phase A — lean CLAUDE.md generation prompt + inline warnings extractor
- `5d8944f` — feat(wave-49): Phase C — gotcha nudge hook + size cap lint
- `22f4e5f` — fix(wave-49): gate claude-md size lint on staged files only
- `2f74e10` — docs(wave-49): Phase D — integration test, lifecycle docs, marginal trims
- `f502d0d` — docs(wave-49): drop broken hooks/CLAUDE.md reference

## Files touched (count)

- 11 new files (4 generator modules + tests, 1 hook + test, 1 lint script, 1 integration test, 1 lifecycle doc)
- 12 modified (config schema/types, hook handler, root CLAUDE.md, project docs, 5 trimmed CLAUDE.mds, package.json, pre-commit script, plan doc, session-handoff doc)

## Trim results

| File | Before | After | Method |
|---|---|---|---|
| `src/main/CLAUDE.md` | 178 (duplicated old + new format sections) | 43 | Dedupe — keep newer section, salvage gotchas from older one |
| `src/main/ipc-handlers/CLAUDE.md` | 209 | 57 | Remove auto-section + dependencies table |
| `src/renderer/components/Terminal/CLAUDE.md` | 209 | 54 | Remove duplicate auto-section + file-role table |
| `src/renderer/hooks/CLAUDE.md` | 205 | 48 | Remove auto-section + 45-row file-map table |
| `src/renderer/components/AgentMonitor/CLAUDE.md` | 202 | 40 | Replace component-hierarchy tables with brief narrative |

Most over-cap content was duplicated auto-generated sections (file-role tables that the codebase graph already serves) — gotchas survived intact. The dramatic line reductions reflect how much of the prior content was derivable rather than tribal.

## Verification

| Gate | Result |
|---|---|
| `npx vitest run` | ✅ 864 files / 9069 passed / 8 skipped / 0 failures |
| `npx tsc --noEmit` | ✅ clean |
| `npm run lint` | ✅ 0 errors (2 pre-existing warnings in FileViewerChrome.tsx and HtmlPreview.tsx unrelated to this wave) |
| `npm run lint:claude-md` | ✅ all CLAUDE.mds within 200-line cap, no grandfather markers in repo |

## Manual smoke

Wave touches no UI surfaces (`src/renderer/components/Layout/**` untouched), so the manual smoke gate from `~/.claude/rules/manual-smoke-gate.md` does not apply.

## Out-of-wave follow-ups

- Pre-existing ESLint warnings in `src/renderer/components/FileViewer/{FileViewerChrome,HtmlPreview}.tsx` — sweep them in the next renderer-touching wave.
- `src/main/hooks/` directory has only the gotcha nudge so far; let it gain a CLAUDE.md organically when it grows past 1–2 files.
- Telemetry-driven prompt tuning — measure nudge follow-through and lean-output quality over time; iterate the prompt if either signal looks weak.
- Gotcha extraction from git history — backfill gotchas by mining bug-fix commits (Wave 60+).
- Stricter EXCLUDE-list enforcement via lint regex against file-role table patterns (post-confirmation that the prompt alone is enough).
