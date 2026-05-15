# Session Handoff — 2026-05-14 (Wave 88 SHIPPED, master CI partial)

**Audience:** the next Claude Code session.

---

## TL;DR

**Wave 88 (Terminal Foundation) is shipped** — merged to master, released as **v2.16.0**, tagged. It's the first wave of the chat-substrate migration (88→91): terminal subsystem bug-sweep + ChatOnly dock parity with the IDE shell + dock resize migrated to the shared `useResizable` hook.

**master CI is still red — but improved.** Wave 88's CI fix (`install.js` step) eliminated the macOS Electron-binary collection failure (146 failed test files → 9). What remains is **pre-existing** and unrelated to Wave 88 (red since before the wave — the previous handoff's "CI green at cut point" was wrong): macOS + Ubuntu share a ~9-file platform-specific failure set, and the Windows job times out. Tracked as a bug.

**Next wave: Wave 89 — ChatOnlyShell Layout Overhaul** (stacked terminals + overlay drawers). Not started.

---

## Wave 88 — what shipped

Released v2.16.0 (commit `ebed5f82`, tag `v2.16.0`). On master.

| Phase | Outcome |
|---|---|
| 0 — Scaffolding | `terminalAddonManifest.ts` (9 `@xterm/*` addons, load-order + criticality). `dockPersistenceSchema.ts` scaffolded then removed in Phase 6 (superseded). |
| 1 — xterm v6 lifecycle | WebGL loads after `term.open()`; `onContextLoss` → canvas fallback, no remount; `_core` private API removed (DOM-based cell height). |
| 2 — Cleanup regression test | 100-cycle mount/unmount stress test. |
| 3 — Dock resize unification | `useDockResize` → shared `useResizable`; height persists via `panelSizes.terminal`; non-destructive legacy-key migration. |
| 4 — `ChatOnlyTerminalToolBridge` | Scoped tool bridge in `ChatWorkbenchShell`; 10-case orchestrator-owned acceptance test. |
| 5 — Dock header parity + keybind | New Claude / New Codex buttons + recording toggle; `Ctrl+J` collapse. |
| 6 — Cleanup | Deleted `dockPersistenceSchema.ts`; result brief. |

Manual smoke passed (phases 1, 3, 4). Mechanical review: PASS (one non-fatal Check-6 flag — no Stryker harness — justified). Full local suite: 1065/1065.

**4 bugs found during smoke, all fixed in-wave:** unicode addon version string, destructive dock-height migration, WebGL white flash, misplaced eslint-disable. See `roadmap/wave-88-terminal-foundation/wave-88-result.md` for the full account.

---

## master CI state — READ THIS before any push

master CI has been red since `0d6ee197` / `6b2cacd8` (2026-05-13), **before Wave 88**. Do not trust a "CI green" claim without checking `gh run list --branch master` AND `gh run view <id> --json conclusion` (note: `gh pr checks` prints "fail" but exits 0 — don't gate an `&&` chain on it).

Verified state as of run `25888841620` (commit `d77b3a00`):
- **macOS** — Electron-binary collection failure FIXED by `d77b3a00` (`install.js` step in `ci.yml`): went from 146 failed test files → 9. The remaining 9 files / 22 tests are the shared platform-specific set below — macOS is **not** fully green.
- **Ubuntu** — 7 failed files / 20 tests. Same shared platform-specific set as macOS (`nativeWatcher`, `workspaceTrust`, `qualitySignalCollector`, `webPreloadTransport.resume`, `subagent`, `indexingPipelineSupport`, `systemTwoRegistry`, `sessionDispatchHandlers.validatePath`, …). Linux/Mac-specific — pass on Windows-local.
- **Windows** — the Test step **times out after 10 minutes** (`##[error]The action 'Test' has timed out`). Not assertion failures — a CI performance/timeout issue. Separate root cause.
- All tracked in **`roadmap/bugs/2026-05-14-master-ci-ubuntu-windows-failures.md`** (now covers all three platforms) with repro steps. Next CI work item — plausibly a small fix-sweep wave.
- The Windows/Linux lockfile-divergence hypothesis (the Gamify / Contractor-App vendor-gotcha pattern) was **investigated and refuted** — `npm ci` exits 0, no "Missing X from lock file". Don't re-walk that path.

**Process note for the next session:** a merge-on-red happened this wave because `gh pr checks` *prints* "fail" but *exits 0*, so an `&&` chain proceeded into the merge. Gate merges on the explicit `conclusion` field (`gh run view <id> --json conclusion`), never on a chained exit code.

---

## Open follow-ups (filed this wave, none are Wave 88 scope)

In `roadmap/follow-ups/`:
- `2026-05-13-chatworkbench-integration-tests-missing-toast-provider.md` — **RESOLVED** (fixed in the CI hot-patch).
- `2026-05-13-tailwind-codepoint-and-treesitter-wasm-versions.md` — tailwind half fixed; tree-sitter wasm ABI drift (`web-tree-sitter@0.22.6` vs `@vscode/tree-sitter-wasm@0.3.1`) still open.
- `2026-05-14-trace-logging-floods-console.md` — `[trace:agent-record]` / `[trace:ctx-preview]` `log.info` flood; recommended fix `log.info → log.debug` at 4 sites. Small `haiku-implementer` task.
- `2026-05-14-subagent-transcript-panel-dead-code.md` — `SubagentTranscriptPanel` defined but never mounted; decide re-mount vs delete.

In `roadmap/bugs/`:
- `2026-05-14-master-ci-ubuntu-windows-failures.md` — the CI restoration item above.

---

## The 88→91 migration — bigger picture

Wave 88 is wave 1 of 4. Remaining:

| Wave | Topic | Status |
|---|---|---|
| **89** | ChatOnlyShell Layout Overhaul — stacked terminals (interactive Claude on top, dev shell below) + overlay drawers floating full-height over the right portion of both terminals | not started |
| **90** | Interactive Claude Substrate — drop `claude -p`, spawn interactive `claude` in the top terminal via `spawnClaudePty` with `--permission-mode bypassPermissions`; context injection moves from stdin to a `UserPromptSubmit` hook via `--settings`; recent-sessions rail with cache-expired badge | not started |
| **91** | Cleanup — delete the dead `-p` chat substrate (`claudeStreamJsonRunner`, warm process manager, `AgentChatWorkspace` subtree, conversation compactor); slim SQLite to a UX-metadata layer | not started |

**Wave 89 has one prerequisite from Wave 88:** `useResizable` is currently fixed-edge only. Wave 89 Phase 0 must extend it for sibling-stack resize (Wave 88 Phase 3 only proved the fixed-edge consumer pattern).

---

## Stashed work (preserved)

- `stash@{1}` — "pre-pivot WIP: wave-87 chat-orchestration + wave-m5 docs" (the original pre-pivot state).
- `wave-87-chat-orchestration-cleanup` branch — 16 local-only commits, untouched. The pivot likely supersedes Wave 87's substrate goals; user's call whether to resurrect or abandon.

---

## What to do next

1. **Pick up the CI bug** (`roadmap/bugs/2026-05-14-master-ci-ubuntu-windows-failures.md`) — reproduce the Ubuntu + Windows failures in a Linux container, diagnose per-file, fix-sweep. This unblocks a fully-green master — and is the **soft prerequisite** for item 3 below.
2. **OR start Wave 89** — if green-master isn't blocking, Wave 89 Phase 0 is the `useResizable` sibling-stack extension. Run `/wave-plan 89` (or `/wave-plan-lite 89`).
3. **OR run the cross-platform-lockfile + Stryker wave** — this repo's slot in a 3-repo parallel meta-initiative (Gamify + Contractor App running the same in their repos, concurrently). For Agent IDE specifically: adopt the lockfile tooling *preventatively* (no existing divergence here — the lockfile-divergence hypothesis for the CI bug was investigated and refuted — but installing Stryker would create it), do the native-module adapter refactor (`better-sqlite3`, `node-pty`, `@parcel/watcher`, `@node-rs/xxhash`), install Stryker scoped to pure-logic code, wire its CI. Meta-spec + literal kickoff prompt: `C:\Web App\docs\superpowers\specs\2026-05-14-cross-platform-lockfile-stryker-meta.md` → "Handoff — executing this initiative" → Wave 3. Pattern reference: `C:\Web App\Gamify\roadmap\wave-9-cross-platform-lockfile-stryker/`. Pre-wave WSL2 setup is already done. **Soft dependency:** do item 1 (the CI bug) first — the adapter refactor shouldn't build on a red baseline. The heaviest of the three meta-initiative waves; explicitly multi-phase.
4. The small follow-ups (trace-logging `log.debug`, tree-sitter wasm bump, SubagentTranscriptPanel) can be folded into a fix-sweep or picked off individually.

## Vendor knowledge

`/promote-vendor-lessons 88` was run at wave-end — see `<repo>/.claude/vendor-gotchas/` for the xterm v6 gotchas captured this wave (WebGL context-loss canvas-blank timing, `UnicodeGraphemesAddon` version string, no public cell-size property in v6.0.0).
