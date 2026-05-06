# Session Handoff — 2026-05-06 (post-ship)

**Audience:** the next Claude Code session that starts in this repo. Cole pastes this (or points at it) and you orient from here.

---

## TL;DR

**v2.14.0 shipped.** Wave 82 (chat-only polish bundle) closed 14 of 15 user-reported bugs across rounds 1-5 of smoke walks. Master is at `1d09774`, tag `v2.14.0` pushed. Working tree clean. The one open item from this wave (B2 file-tree heat map) is a standalone follow-up.

---

## Current state

**Branch:** `master`, in sync with `origin/master`.

**Recent ship history:**
```
1d09774 chore(release): v2.14.0 — wave 82 chat-only polish bundle (14/15 closed)
d0a16e5 chore(wave-82): post-smoke cleanup — strip investigation traces, defer B2 heat map
6d842ff docs(handoff): refresh for 2026-05-06 — wave-82 committed, smoke-pending
d7882a9 fix(wave-82): chat-only polish bundle — rounds 1-3 + 82.1 + post-smoke iterations
f545747 chore(release): v2.13.0 — wave 83 Playwright-electron repro harness shipped
```

**Tags pushed:** `v2.14.0` (this wave), `v2.13.0` (wave-83).

**Repo URL note:** push output reported a move from `Stacey-Industries/Ouroboros` to `hesnotsoharry/Ouroboros`. Push and tag-push both succeeded against the old URL via redirect, but if you want to silence the warning, run:
```bash
git remote set-url origin https://github.com/hesnotsoharry/Ouroboros.git
```

---

## What's open after the wave

### B2 — File-tree heat map still broken

Round-5 smoke confirmed colored borders still don't appear after agent edits despite two attempted fixes in wave-82.x. Filed as a standalone follow-up at `roadmap/follow-ups/2026-05-06-file-heat-map-still-broken.md` with:
- Repro steps
- What's been tried (`EDIT_TOOL_NAMES` extension to MCP-style names; `extractFilePath` JSON parse)
- An instrumented investigation plan — the next attempt MUST add temporary `log.info('[heat-map] tool event', …)` and `log.info('[heat-map] extracted path', …)` so you can compare the live tool-name and the extracted path against the file-tree row's lookup key. **Do not propose another fix from code reading.** Per `~/.claude/rules/debug-before-fix.md`, you've burned the two free attempts; instrumentation comes next.

Files involved: `src/renderer/hooks/useFileHeatMap.ts`, `src/renderer/components/FileTree/FileTree.tsx`, plus the row component that applies the colored border.

### Other open follow-ups

`roadmap/follow-ups/outstanding-2026-05-03.md` is the canonical digest of ~100 unique open items across Chat/UI, Telemetry, MCP, Graph, Performance, and prior-wave follow-ups. Triage there before opening a new wave.

The follow-up brief recommends bundling these as upcoming waves:
- **Wave 84**: Cypher engine quality (`labels()`, `p.indexed_at`, multi-label, OPTIONAL MATCH parser) — ~6 graph items
- **Wave 85**: MCP follow-ups bundle (CodeMode user-global servers, prefix-aware corpus re-run, Streamable HTTP migration) — ~5 MCP items

(Slot numbers may shift if Cole picks up the heat-map follow-up first or opens something else.)

### Pre-existing test baselines (not regressions)

Three pre-existing failures preserved through wave-82 — all on the outstanding follow-ups list, not introduced by this wave:
- `TitleBar.menus.test.ts > contains Switch to IDE Shell`
- `ChatWorkbenchFollowThrough.integration.test.tsx > opens utility drawer on OPEN_SUBAGENT_PANEL_EVENT`
- `ChatWorkbenchShell.integration.test.tsx > switches to subagents tab when a subagent-open event fires`

---

## Conventions worth knowing

- **Push policy:** per-wave, not per-phase. Don't push until smoke is signed off. (Recorded in user memory.)
- **Lint hooks:** harness PreToolUse hooks at `assets/hooks/pre_*.mjs` enforce conventional-commits, prettier, ESLint, secrets, and full-tsc-on-push. `--no-verify` is a git-hooks flag and doesn't bypass the harness layer. Run `npx prettier --write` and fix lint violations directly. `OUROBOROS_SKIP_QUALITY_HOOKS=1` only works if set in the parent Claude Code session env, not inline.
- **Test scope during iteration:** prefer the scoped `npm run test:agentchat` / `test:layout` / `test:filetree` etc. over `npm test`. Full suite runs at push-time.
- **Heat map debug rule:** when picking up B2, INSTRUMENT FIRST. The follow-up doc has the exact log statements to add and the repro steps to capture them on.

---

## File map for the wave that just shipped

```
roadmap/wave-82-chat-only-polish-bundle/
├── waveplan-82.md
├── wave-82-decisions.md            — locked ADR (12 decisions)
├── phase-a-audit.md                — wiring matrix
├── phase-e-diagnosis.md            — runtime-bug diagnostic findings
├── wave-82-auto-brief.md           — round 1-2-5 patch log + final status
└── wave-82-handoff.md              — original 2026-05-03 handoff (superseded by ship)

roadmap/wave-82.1-chat-project-binding/
├── waveplan-82.1.md
└── wave-82.1-result.md             — round-3 result + round-4 smoke notes

roadmap/follow-ups/
├── 2026-05-06-file-heat-map-still-broken.md   — B2 standalone follow-up
└── outstanding-2026-05-03.md                  — categorical digest of ~100 open items
```
