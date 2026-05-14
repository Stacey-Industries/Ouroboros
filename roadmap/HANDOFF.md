# Session Handoff — 2026-05-13 (Wave 88 in-flight, smoke pending)

**Audience:** the next Claude Code session that picks up Wave 88.

---

## TL;DR

A major architectural pivot has been declared: **chat substrate moves from `claude -p` (headless, stream-json) to embedded interactive `claude` in an xterm.js PTY.** Driver: Anthropic's June 15 2026 Agent SDK credit carve-out makes `-p`-based product chat metered against a separate monthly credit; interactive Claude Code stays on subscription weekly limits. Secondary benefit: escape `-p`'s unstable surface area.

The pivot is a 3-4 wave migration starting with **Wave 88 (Terminal Foundation)**. Plan + ADR + 4 of 6 phases are landed on a fresh branch off master. Phase 5 + Phase 6 remain. Manual smoke is owed before push.

**Active branch:** `wave-88-terminal-foundation` (off master, NOT pushed).

**Do NOT push until manual smoke passes.**

---

## Pre-session reading

1. `roadmap/wave-88-terminal-foundation/waveplan-88.md` — wave plan (canonical 14 sections)
2. `roadmap/wave-88-terminal-foundation/wave-88-decisions.md` — three locked ADR decisions
3. This file

---

## Wave 88 — what's committed

Branch `wave-88-terminal-foundation`. 7 commits ahead of master. Linear history (no merges):

| Commit | Phase | Topic |
|---|---|---|
| `e3f6d547` | Init + 0 | Wave init, plan, ADR, addon manifest + dock schema scaffolding (haiku-implementer) |
| `4c942ebe` | 1 | xterm v6 lifecycle correctness — WebGL load-after-open, canvas fallback on context loss, addon manifest integration, `_core` private API removed, CLAUDE.md gotcha rewritten (sonnet-implementer) |
| `d896acc5` | (ADR fix) | Decision 2 corrected — `terminal.dimensions.css.cell` is NOT in v6.0.0 type defs; shipped DOM calculation (`element.clientHeight / rows`) is the working approach (orchestrator) |
| `3f4e168e` | 2 | Timer + listener cleanup regression test — Phase 1 already had robust cleanup; 9 new test cases lock it down including 100-cycle stress (haiku-implementer) |
| `cdda802e` | 3 | Dock resize unified on `useResizable`; `useDockResize` deleted; dock height persists in electron-store via existing `panelSizes.terminal` key; localStorage one-time migration (sonnet-implementer) |
| `8f60b441` | 4 (test) | Orchestrator-owned acceptance test for `ChatOnlyTerminalToolBridge`, pre-dispatch (orchestrator) |
| `ab7e2a76` | 4 | `ChatOnlyTerminalToolBridge` shipped; mounted in `ChatWorkbenchShell`; CLAUDE.md updated; all 10 orchestrator-owned acceptance tests pass; test file untouched by implementer (sonnet-implementer) |

## Phase status

| Phase | State | Notes |
|---|---|---|
| 0 — Scaffolding | ✅ done | Phase 0 deliverable: `dockPersistenceSchema.ts` ended up superseded by existing `panelSizes.terminal` persistence (discovered in Phase 3) — Phase 6 removes it |
| 1 — xterm lifecycle | ✅ done | Manual smoke pending: force WebGL context loss in devtools, verify canvas fallback (no remount, no blank) |
| 2 — Cleanup regression test | ✅ done | No manual smoke needed (test-only) |
| 3 — Dock resize unification | ✅ done | Manual smoke pending: drag dock divider, restart app, verify persisted height |
| 4 — `ChatOnlyTerminalToolBridge` | ✅ done | Manual smoke pending: chat agent calling `getTerminalOutput` in live ChatOnly session returns dock output (not first-registered fallback) |
| 5 — Dock header parity + keybind | ⏳ NEXT | New Claude / New Codex buttons, recording controls, `Ctrl+J` keybind; audit `chatOnlyCommandFilter.ts` + `CommandPalette` for `Ctrl+J` collision first |
| 6 — Cleanup | ⏳ pending | Remove `dockPersistenceSchema.ts` (superseded by existing `panelSizes.terminal`), remove any other dead code, update CLAUDE.md if needed, write `wave-88-result.md` |

---

## Pending manual smoke checklist (do before push)

Run a local dev session (`npm run dev`) and verify each:

1. **Phase 1 — WebGL load order + canvas fallback**
   - Open ChatOnlyShell + dock → terminal renders crisply (WebGL active)
   - DevTools → simulate WebGL context loss (e.g. `WEBGL_lose_context.loseContext()`) → terminal stays visible, text continues to render via canvas, no remount, no blank flash
   - Open and close the dock 20× → no console warnings about leaked observers or stuck timers

2. **Phase 3 — Dock resize + persistence**
   - Drag the dock divider — smooth resize, no pointer-event glitches, no `window`-listener collisions
   - Restart the app — dock height matches what was set pre-restart
   - Verify localStorage `agent-ide:chat-workbench-terminal-dock` key is gone (one-time migration ran)

3. **Phase 4 — `ChatOnlyTerminalToolBridge`**
   - In ChatOnlyShell with a session in the dock, run a command in the dock terminal
   - Ask the chat agent in the ChatOnly chat surface: "what was the output of my last terminal command?"
   - Agent's reply mentions the actual output (not empty, not stale, not from an unrelated terminal session)
   - Bonus: verify that calling `getOpenFiles` (e.g. via a chat agent prompt referencing open files) gets a structured "unavailable in chat-only mode" signal rather than throwing

If any smoke item fails, file a `roadmap/follow-ups/2026-05-14-wave-88-smoke-{slug}.md` entry; do not push until resolved or explicitly deferred.

---

## What to do next (next session)

### Step 1 — Verify state

```bash
cd "C:/Web App/Agent IDE"
git status                                   # should be clean (.stryker-tmp/ ignored)
git branch --show-current                    # should be wave-88-terminal-foundation
git log --oneline -8                         # 7 wave-88 commits on top of 6b2cacd8 (master)
npm run typecheck                            # should pass
npx vitest run src/renderer/components/Terminal src/renderer/components/Layout/ChatOnlyShell
# (acceptance + cleanup + lifecycle + Phase 4 unit tests, all green)
```

### Step 2 — Run pending manual smokes (Phase 1, 3, 4)

See the checklist above. Don't dispatch Phase 5 until smoke is clean OR follow-ups are filed for any failures.

### Step 3 — Dispatch Phase 5

`sonnet-implementer` with the brief in the waveplan's Phase 5 row. Deliverables:
- `DockHeaderActions` adds New Claude / New Codex buttons (mirror IDE shell's `TerminalTabs`)
- Recording controls in dock header (toggle, indicator) — wires `recordingSessions` / `onToggleRecording` already flowing through the dock
- `Ctrl+J` collapse keybind in ChatOnlyShell — audit `chatOnlyCommandFilter.ts` + `CommandPalette` registrations BEFORE claiming the binding
- Mirror any other IDE-shell terminal keybinds for parity
- Internal-only phase (no orchestrator-owned acceptance test required)
- Trophy test shape (UI-heavy)

Orchestrator commits after gate verification.

### Step 4 — Phase 6 — cleanup

`haiku-implementer` with:
- Delete `src/shared/config/dockPersistenceSchema.ts` (+ its test) — superseded by existing `panelSizes.terminal`
- Sweep for any other dead code identified by earlier phases
- Update root CLAUDE.md if anything else became stale
- Write `roadmap/wave-88-terminal-foundation/wave-88-result.md` summarizing what shipped, what was deferred, vendor lessons captured

### Step 5 — `/review` + push

- `/review 88` (mechanical layer-2 gap check — 6 checks, including Check 5 boundary-phase acceptance test and Check 6 mutation score)
- Manual smoke checklist above must be re-verified at this point if any code changed since the first run
- Resolve any FLAG/FAIL items
- Push: `git push -u origin wave-88-terminal-foundation`
- Open PR, await CI, squash-merge once green
- Tag release if semver applies (likely minor — new architectural surface incoming via Wave 90)

---

## Doctrinal changes this session

Two process improvements landed in `~/.claude/` (orchestrator's global config, not in this repo):

1. **`/specplan` family renamed to `/wave-plan-lite` family.** `specplan` → `wave-plan-lite`, `specplan-draft` → `wave-plan-lite-draft`, `specplan-review` → `wave-plan-lite-review`. The lite variant now enforces the canonical 14-section wave plan structure with ADR scaffolding and canonical artifact path — just without `/wave-plan`'s Sites 1/2/3 validation gates. Cross-references updated in `development-pipeline.md`, `wave-plan.md`, `review.md`, `reviewimpl.md`.
2. **Stale Wave 86 DOM snapshot memory removed.** `project_wave86_dom_snapshot_load_bearing.md` was removed from `~/.claude/projects/.../memory/` because the path it described was retired in Wave 87 Phase 3 (verified in code).

If a future session sees the OLD `/specplan*` commands referenced anywhere, replace with `/wave-plan-lite*`.

---

## Stashed work (preserved, not lost)

The session began on `wave-87-chat-orchestration-cleanup` with ~50 staged files and 13 unstaged modifications, including pre-existing typecheck errors in `chatSendCoordinator*.ts` files (3 errors in HEAD-committed code, 2 in WIP). Rather than build Wave 88 on a red baseline, the entire state was stashed and Wave 88 branched off clean master.

- **Stash:** `stash@{0}` — "pre-pivot WIP: wave-87 chat-orchestration + wave-m5 docs + initial wave-88 attempt on broken branch (2026-05-13)"
- **Wave 87 + wave-m5 commits:** still on `wave-87-chat-orchestration-cleanup` branch (16 local-only commits ahead of `origin/wave-87-chat-orchestration-cleanup`). Untouched. The user may resurrect or abandon at their discretion — the pivot likely supersedes Wave 87's substrate-related goals.

To recover:
- `git checkout wave-87-chat-orchestration-cleanup` — back on the original branch
- `git stash apply stash@{0}` — re-apply WIP

---

## Architectural pivot — bigger picture

Wave 88 is the first wave of a 3-4 wave migration. Subsequent waves:

| Wave | Topic | Status |
|---|---|---|
| **88** | Terminal Foundation — bug sweep + IDE↔ChatOnly parity + useResizable migration | in-flight |
| **89** | ChatOnlyShell Layout Overhaul — stacked terminals (interactive Claude on top, dev shell below) + overlay drawers (utility + artifact panes float full-height over the right portion of both terminals) | not started |
| **90** | Interactive Claude Substrate — drop `-p`, spawn interactive `claude` in top terminal via `spawnClaudePty` with `--permission-mode bypassPermissions`, `--name <title>`; context injection moves from stdin to `UserPromptSubmit` hook via `--settings` flag for per-session scope; recent-sessions rail with cache-expired badge (55-min timer, 1-hour Max-plan TTL) | not started |
| **91** | Cleanup — delete dead chat substrate (`claudeStreamJsonRunner`, warm process manager, `AgentChatWorkspace` subtree, conversation compactor, etc.); slim SQLite to UX-metadata layer; retire active routing code | not started |

Wave 89 has one architectural prerequisite from Wave 88: `useResizable` needs sibling-stack extension (it's currently fixed-edge only). Wave 89 Phase 0 handles that extension; Wave 88 Phase 3 only proved the fixed-edge consumer pattern works.

Wave 90 has critical CLI behavior verified this session:
- `UserPromptSubmit` hook supports `additionalContext` field for prepending IDE context — viable
- `--permission-mode bypassPermissions` is the v1 product default (user is single-user, will revisit if user base grows)
- Max plan auto-gets 1-hour prompt cache TTL → 55-min badge timer (5-min safety buffer)
- `--settings` flag scopes hooks to the spawned session only — IDE-spawned sessions get context injection, user's hand-typed `claude` sessions don't

---

## CI status (when push time comes)

Master's CI was green at the cut point (`6b2cacd8`). Wave 88 changes are renderer + main, no native deps touched. Standard CI matrix should pass once pushed. The pre-existing 80-130 chat-orchestration test failures on the Wave 86/87 path are not present on `wave-88-terminal-foundation` since the branch is off clean master.

---

## Repo entry points (Wave 88)

- Wave plan: `roadmap/wave-88-terminal-foundation/waveplan-88.md`
- ADR: `roadmap/wave-88-terminal-foundation/wave-88-decisions.md`
- Acceptance test (orchestrator-owned, never modify): `src/renderer/components/Layout/ChatOnlyShell/ChatOnlyTerminalToolBridge.acceptance.test.tsx`
- Phase 0 scaffolding: `src/renderer/components/Terminal/terminalAddonManifest.ts`, `src/shared/config/dockPersistenceSchema.ts` (the latter to be removed in Phase 6)
- Result brief (write at Phase 6): `roadmap/wave-88-terminal-foundation/wave-88-result.md`

## Gotchas worth re-reading

- `src/renderer/components/Terminal/CLAUDE.md` — already updated this session with corrected WebGL load order + DOM-based cell-height calculation
- `src/renderer/components/Layout/ChatOnlyShell/CLAUDE.md` — updated to reflect `ChatOnlyTerminalToolBridge` is now mounted (full `IdeToolBridge` remains unmounted)
- `~/.claude/rules/orchestrator-owned-acceptance-tests.md` — Phase 4 followed this rule; future cross-boundary phases (none in remaining Wave 88, but Wave 90 will have them) need the same discipline
