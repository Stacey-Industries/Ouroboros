# Session Handoff — 2026-05-18 (Wave 94 implementation complete + post-smoke fixes; push gated on Phase E re-test; 28 commits ahead of origin/master)

**Audience:** the next Claude Code session.

---

## TL;DR

**Wave 94 (Chat-Workbench Completion) implementation + post-smoke fix bundle landed locally.** 14 wave commits (`488798ac` → `3970d6be`) plus the prior 14-commit-ahead state = 28 ahead of `origin/master`. All five phases (A–E) shipped per spec; wave-wrap smoke surfaced 6 issues, all Wave-94-attributable ones fixed in this session, 4 pre-existing limitations deferred to Wave 95.

**Push gated on Cole's Phase E re-test in this new session.** Last fix (`3970d6be`) addressed two compound bugs in terminal-launched-claude → diff-review path. Cole has NOT yet confirmed it works end-to-end. Verify with: `claude --dangerously-skip-permissions` in a dock-slot terminal → ask it to Edit a file → confirm the diff-review panel auto-opens.

**If Phase E re-test passes:**
1. `git push` (no lockfile changes pending; pre-push guard will accept).
2. Wait for CI green.
3. `git tag v2.19.0` + push tag.
4. `/promote-vendor-lessons 94` (likely no-op — no new vendor SDK).
5. Flip this HANDOFF.md to Wave 95.
6. Append a one-liner to `roadmap/wave-temperature-log.md`.

**If Phase E re-test fails:** repro, file new bug doc, dispatch sonnet-diagnostician.

---

## Wave 94 — final state

| Phase / commit | What |
|---|---|
| ADR `7830b630` | Locked Decisions 1–5 (`wave-94-decisions.md`) |
| E-test `abc04d66` | Orchestrator-owned acceptance test (`describe.skip`) per boundary phase rule |
| **A** `488798ac` | Title-bar surface split — two distinct toggles, alias-only hook addition |
| **B** `d4a2f1dc` | Per-project terminal isolation — `useProjectTerminals` + provider + schema |
| **C** `00421a7e` | Dock-slot tabs — `DockSlotTabs` + `SlotHeaderRow` |
| **D** `d080f92d` | Inner-rail terminals — context consumption, click-to-promote, slot-choice menu |
| **E** `1cd6ddce` | Diff-review producer wiring — hook script, main tap, renderer hook, settings gate |
| Wrap `7d239949` | Result brief + mechanical review + CHANGELOG [2.19.0] + version bump |
| Fix #1 `5d34b9c4` | Phase B spawn-into-slot — effect-driven attribution (sessions appeared in global pool but filtered out of slot view) |
| Fix #2 `767149e0` | Phase B project-switch swap — provider received stable `projectRoot` instead of rail-selectable `layout.activeProject` |
| Fix #3 `c8adbfee` | Phase B spawn cwd defaults to active project path (not the app's cwd) |
| Fix #4 `dfb8ed58` | Phase A artifact pane uniform header (Wave 89 pivot moved artifact to overlay, Wave-82 "no header" call no longer held) |
| Fix #5 `1ae44fda` | Wave-wrap polish bundle — empty-slot layout, strip-X removal, close-neighbour bug, InnerSidebarTerminals lint cleanup |
| Fix #6 `3970d6be` | Phase E terminal-launched claude — producer cwd source + consumer Claude UUID binding for terminal-spawned sessions |

`/review` verdict on the original wave: FLAG non-fatal (acceptance test was modified by implementer for jsdom docblock — rule-permitted infrastructure fix; mutation score 42.86% on the new Phase B schema, project break threshold 21 not breached). Cleared to merge. See `roadmap/wave-94-chat-workbench-completion/wave-94-mechanical-review.md`.

## Wave 95 — pre-seeded skeleton

**Wave 95 — Chat-Workbench Terminal QoL** at `roadmap/wave-95-chat-workbench-terminal-qol/waveplan-95.md`. Status `PLANNED`, target `v2.19.1` (patch). Fix-sweep bundling the 5 follow-ups surfaced by Wave 94's smoke:

| Phase | Topic | Follow-up |
|---|---|---|
| A | Terminal tab rename (net-new UX) | `2026-05-18-terminal-tab-rename.md` |
| B | Terminal scrollback buffer bump + setting | `2026-05-18-terminal-scrollback-truncated.md` |
| C | Ghost-cursor fix (xterm WebGL/DOM overlap pattern audit) | `2026-05-18-terminal-ghost-cursor-resurfaced.md` |
| D | Claude CLI color/theme rendering in in-app terminal | `2026-05-18-claude-cli-color-rendering-in-terminal.md` |
| E | Secondary slot collapsed-empty chrome clarification | `2026-05-18-secondary-slot-collapsed-chrome.md` |
| F | Wave wrap |  |

All A–E independent → free to parallelize. Phase B is the quickest win.

## Out-of-scope orchestrator-applied repair

`~/.claude.json` had invalid JSON (extra trailing brace at byte 46076) preventing `claude` CLI from launching in in-app terminals. Repaired by orchestrator with backup at `~/.claude.json.bak-<timestamp>`. Not Wave 94 — Cole's system state. Not committable.

---

## Older open follow-ups (not bundled into Wave 95)

In `roadmap/bugs/`:
- `2026-05-17-chatstatenewpath-dynamic-require-threadstore.md` — OPEN, medium. Wave 86 chunker bug; failed first-attempt fix documented. Recommend Lane B with Path C in the bug doc (refactor `threadStore.ts` to lazy-init `agentChatThreadStore`).
- `2026-05-17-silent-buildrepoindex-hang-post-graph-ready.md` — TRIAGED, medium. Diagnostic plan in doc — instrument `buildRepoIndexSnapshot` + `orchestration/contextWorker.ts`.
- `2026-05-15-e2e-teardown-hang.md` — still open (Wave 93 carry-over).

In `roadmap/follow-ups/` (not Wave 95):
- `2026-05-16-wave-89-tool-bridge-runtime-smoke.md`
- `2026-05-16-wave-89-stacked-dock-integration-test.md`
- `2026-05-16-wave-89-dead-useWorkbenchCompare-hook.md`
- `2026-05-05-electron-renderer-browser-mcp-wiring.md`

In `roadmap/wave-94-chat-workbench-completion/wave-94-result.md`'s "Follow-ups created" section:
- Right-click "Move session between slots" in InnerSidebarTerminals (Phase D scope deferral).
- `ChatOnlyTerminalToolBridge.activeDockSessionId` derivation cleanup (could read from `useProjectTerminalsContext` instead of separate useState).
- `ChatOnlyTitleBar.test.tsx` workbench-mode integration coverage (defaultProps omits onToggleRail).
- `useProjectTerminalsContext()` FALLBACK vs throw policy reconsideration.
- Pre-commit hook same-line `// hardcoded:` requirement gotcha (undocumented in renderer rules CLAUDE.md — add if it bites a third time).

---

## Working tree at session-end

Pre-existing modifications carried throughout the session, untouched:
- `roadmap/follow-ups/2026-05-05-electron-renderer-browser-mcp-wiring.md`
- `tools/__fixtures__/train-context/test-output-weights.json`

Working tree otherwise clean.

---

## Session-specific lessons (worth not repeating)

1. **Boundary acceptance tests catch the consumer contract — they DON'T catch scope-shrinkage.** Wave 94 Phase E's first implementer correctly made the acceptance test pass for the renderer side, then EXPLICITLY DEFERRED the producer side (touch points 1, 2, 6) as "follow-ups." The acceptance test passed (5/5) because it only exercised the renderer-side mock contract. The orchestrator caught it from the DONE report's transparent enumeration ("deferred touch points 1/2/6"). Two layers, both required: the test catches contract divergence, the DONE-report review catches scope divergence.

2. **Phase B-style state isolation needs USER-OBSERVABLE end-to-end tests, not just hook contract tests.** Phase B's tests passed because they tested `buildSlotSessionList` with pre-populated `projectState[slotKey]`. They never exercised the spawn-then-see-it flow. Cole found the bug in 30 seconds of smoke. The added regression test ("spawn appears in slot AND becomes active") is the contract that should have shipped originally.

3. **Wave-wrap smoke surfaces what tests don't.** 6 wave-94-relevant issues surfaced in 15 minutes of Cole's smoke walk, on top of 1078 passing test cases. The smoke gate isn't ceremony — it's the missing layer.

4. **Producer/consumer namespace mismatches are silent failures.** Phase E's terminal-launched bug was a Claude session UUID vs IDE PTY session ID namespace mismatch. The producer dropped events because the cwd lookup missed; the consumer rejected events because the claudeSessionId binding never happened. Each side independently failed silently. Need explicit logging at namespace boundaries when shipping cross-process correlation.

5. **Pre-commit hook same-line `// hardcoded:` requirement.** The renderer pre-commit color check requires the suppress marker on the same line as the offending hex/rgba, not the line above. Bit twice this session. Add to `.claude/rules/renderer.md` if it bites a third time.

---

## Vendor knowledge

`/promote-vendor-lessons 94` — likely no-op. No new vendor SDK touched (xterm and node-pty pre-existing; Stryker pre-existing from Wave 92). The follow-up Wave 95 will touch xterm.js more deeply (scrollback config, WebGL audit, theme palette) — may produce vendor lessons then.
