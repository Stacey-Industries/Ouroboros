# Session Handoff — 2026-05-06

**Audience:** the next Claude Code session that starts in this repo. Cole pastes this (or points at it) and you orient from here.

---

## TL;DR

Wave 82 (chat-only polish bundle) is **committed locally but not pushed**. Smoke-pending. Wave 83 (Playwright repro harness) shipped as v2.13.0 on 2026-05-05. There are now 2 unpushed commits on master.

When Cole returns, the path is: walk the round-4 smoke checklist, fix anything still broken, then push and tag v2.14.0 (or roll the unfixed items into wave-82.2).

---

## Current state

**Branch:** `master`, 2 commits ahead of `origin/master`. Working tree is clean.

**Recent commits:**
```
d7882a9 fix(wave-82): chat-only polish bundle — rounds 1-3 + 82.1 + post-smoke iterations
39aaf63 roadmap: defer IPC contracts-package formalization to web variant graduation
f545747 chore(release): v2.13.0 — wave 83 Playwright-electron repro harness shipped
```

**Last release:** v2.13.0 (2026-05-05), tag pushed.

---

## What's in `d7882a9`

73 files (+4473/-961). Three layers of work, all in one commit because they're the same bug-fix arc on the chat-only / chat-workbench surface after the Wave 81 (Lexical composer) ship:

1. **Wave 82 rounds 1–3** — 15 user-reported bugs (status bar branch, chat row-flash on add/delete, FileViewer toolbar/minimap, image attachments in popover, artifact pane redesign, timeline scroll, etc.). Plan + ADR + audit live in `roadmap/wave-82-chat-only-polish-bundle/`.
2. **Wave 82.1** — chat-project binding rework: workbench `activeProject` is now mirrored into the per-workspace `AgentChatStore`, so `ComposerContextPreview` and `WorkbenchRulesPanel` see the right project. Plus heat map MCP-tool-name extension, minimap track collapse, timeline outer scroll, F4 menu collapse to a single "New Chat". Plan + result brief in `roadmap/wave-82.1-chat-project-binding/`.
3. **Post-2026-05-03 round-4 iterations** — additional fixes on items that were still broken at the close of wave-82.1 round-4 smoke (FileTree, useAgentEvents.* dispatchers/reducers, ProjectContext, FileViewerToolbar/Chrome, useContextPreview). Inline in the same commit.
4. **Lint-debt cleanup folded in** — extracted `chatHistorySidebarCompletions.ts`, `ContextPreview.popover.tsx`, `DockCloseButton`; dropped a stale debug log in FileTree; updated `WorkbenchMenuBar.test.tsx` for the F4 rename (all under-cap now, 0 lint errors, 1 pre-existing FileViewerChrome warning that's on the follow-up list).

Also: gitignored `artifacts/` (wave-83 Playwright repro driver output).

---

## What's still pending — smoke gate

Round-4 smoke (recorded inline in `roadmap/wave-82.1-chat-project-binding/wave-82.1-result.md`) showed several items still broken at the time. Some were attempted in subsequent post-2026-05-03 commits inside `d7882a9`, but **no one has done a fresh smoke walk on the committed state**. Cole owes a round-5 walk before push.

### Round-5 smoke checklist (for Cole)

```
[ ] Open chat-only workbench. Switch rail to Project A, "+ New chat", send a message.
    Switch rail to Project B. The conversation pane should clear (no Project A
    chats visible). Open the rules popover — should show Project B's actual
    rule counts, not 16 user / 0 project (round-4 still failed this).
[ ] In Project B, open the popover — should show Project B's project rules.
[ ] Switch back to Project A — its chats reappear.
[ ] Right-click a chat → Delete. No "No chats yet" flash (C1, regression check).
[ ] Open utility drawer → Activity tab. Outer list scrolls. Expanded session
    content also scrolls (G).
[ ] Open utility drawer → Rules tab. Shows the active project's rules.
[ ] Toggle Minimap on. NO leftover scrollbar / decoration column to the right
    of the minimap. (Round-4 still showed a thin blue bar.)
[ ] Ask Claude in chat to write a test file. Toggle file-tree heat map. Edited
    file shows a colored left-border. Toggle off → border disappears (B2).
[ ] Open a file in the artifact pane → Edit → Exit. All 5 toolbar buttons
    (Edit, Minimap, Blame, Outline, History) remain present. (Round-4 said
    "Still broken, I have to close it or click away and click back for it to
    show again." Instrumentation `[trace:FileViewer]` is in place — if the
    bug repros, capture console lines from before/after the Exit click.)
[ ] File menu → "New Chat" (Ctrl+N). Should create a session and open a
    fresh chat. (F4: was renamed from "New Session" / "New Chat in Active
    Session". Single entry now.)
[ ] No console errors on cold boot or first interaction.

Smoke signed: ___________________ on ___________________
```

### If smoke passes

```bash
git push origin master
# Then bump version
# (electron-vite + electron-builder pick up package.json version)
git tag v2.14.0
git push --tags
```

Update `roadmap/session-handoff.md` (project-level handoff doc — separate from this file) with a one-line entry pointing at wave 82's brief.

### If smoke fails on any item

- Repro the failure in dev (`npm run dev`).
- Find the root cause via code reading + targeted instrumentation. **Do not** propose 3+ fixes on one bug from code reading alone — see `~/.claude/rules/debug-before-fix.md`.
- Apply minimal-surface fix.
- Run scoped tests (`npx vitest run <touched-test>`), then `npx tsc --noEmit`, then `npx eslint <touched files>`.
- If the residual list is small (1–3 items), append commits to master with `fix(wave-82.2):` prefix.
- If the residual list is bigger, open `roadmap/wave-82.2-{slug}/` and treat as a follow-up wave.

---

## Outside this wave

`roadmap/follow-ups/outstanding-2026-05-03.md` is the canonical digest of ~140 (de-duplicated to ~100) open follow-ups across Chat/UI, Telemetry, MCP, Graph, Performance, Wave 61/62/54/57/60, and cross-cutting items. Triage there before opening a new wave.

The follow-up brief recommends bundling these as upcoming waves:
- **Wave 84**: Cypher engine quality (`labels()`, `p.indexed_at`, multi-label, OPTIONAL MATCH parser) — closes ~6 graph items
- **Wave 85**: MCP follow-ups bundle (CodeMode user-global servers, prefix-aware corpus re-run, Streamable HTTP migration) — closes ~5 MCP items

(Those slot numbers may shift if Cole opens a wave-82.2 first.)

---

## Things to know

- **Push policy**: per-wave, not per-phase. Don't push until the wave's smoke is signed off. (User pref, recorded in memory.)
- **Lint hooks**: this repo has Claude Code harness hooks for pre-commit lint, prettier, secrets, conventional-commits, plus PostToolUse hooks for ESLint and test-required after `Write`. Hooks block commits when they fire — don't try `--no-verify`, it's a git-hooks flag and doesn't bypass the harness layer. Run `npx prettier --write` and fix lint violations directly. The escape hatch `OUROBOROS_SKIP_QUALITY_HOOKS=1` only works if set in the parent Claude Code session env, not inline.
- **Test scope during iteration**: prefer scoped vitest scripts (`test:agentchat`, `test:layout`, `test:filetree`, etc.) over `npm test`. Full suite runs at push-time.
- **Three pre-existing baseline test failures** preserved through wave-82 (not regressions): `TitleBar.menus 'Switch to IDE Shell'`, `ChatWorkbenchFollowThrough OPEN_SUBAGENT_PANEL_EVENT`, `ChatWorkbenchShell 'switches to subagents tab'`. All on the outstanding follow-ups list.

---

## File map for this wave

```
roadmap/wave-82-chat-only-polish-bundle/
├── waveplan-82.md             — original plan
├── wave-82-decisions.md       — locked ADR (12 decisions)
├── phase-a-audit.md           — architect deliverable (wiring matrix)
├── phase-e-diagnosis.md       — diagnostic findings for runtime-bug threads
├── wave-82-auto-brief.md      — round 1 + 2 patch log
└── wave-82-handoff.md         — original 2026-05-03 handoff (now superseded)

roadmap/wave-82.1-chat-project-binding/
├── waveplan-82.1.md
└── wave-82.1-result.md        — round-3 result + round-4 smoke notes

roadmap/follow-ups/outstanding-2026-05-03.md   — categorical digest of ~140 open items
```

Source touch-points are in the d7882a9 commit body — reference that for the per-bug breakdown.
