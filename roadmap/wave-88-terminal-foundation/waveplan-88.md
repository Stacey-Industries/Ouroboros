---
status: COMPLETED
created: 2026-05-13
updated: 2026-05-14
---

# Wave 88 — Terminal Foundation

## Context

First wave of a 3-4 wave migration that moves Ouroboros chat from `claude -p` (headless, stream-json) to embedded interactive `claude` running in an xterm.js PTY. Driver: Anthropic's June 15 2026 Agent SDK credit carve-out makes `-p`-based product chat metered against a separate monthly credit; interactive Claude Code stays on subscription weekly limits. Secondary benefit: escape `-p`'s unstable surface area.

Wave 88 is foundation work — it does NOT change the chat substrate or layout. It fixes terminal-stack bugs, closes the IDE↔ChatOnlyShell parity gap, and replaces the bespoke `useDockResize` with `useResizable` — the latter is a direct prerequisite for Wave 89's dual-stacked-terminal layout (the bespoke handler's `window`-level pointer listeners would collide with the new sibling-pane resizer).

Subsequent waves: 89 (ChatOnlyShell layout overhaul with stacked terminals + overlay drawers), 90 (interactive `claude` substrate swap), 91 (dead-substrate cleanup).

## Goal

A single robust, debugged terminal stack that works identically in IDE shell and ChatOnlyShell. WebGL load order matches upstream `@xterm/xterm` v6 guidance. Private `_core._renderService.dimensions` API access is eliminated. ChatOnlyShell exposes terminal output to the chat agent without breaking Wave 42's IDE-shell-specific architecture. Bottom dock uses the shared `useResizable` hook, eliminating the collision risk for Wave 89.

## Architectural surface assessment

No new surface introduced. Wave 88 modifies the existing PTY+xterm.js+TerminalManager stack: no new IPC channels, no new package boundaries, no new SDK integration. Walking-skeleton phase NOT required.

## Locked decisions

See `wave-88-decisions.md`. Three decisions resolved during planning:

1. **xterm WebGL load order:** load AFTER `term.open()` per v6 upstream guidance (was: load before, per stale CLAUDE.md gotcha).
2. **Cell-dimensions API access:** use `terminal.dimensions.css.cell.{width,height}` public API (was: `term._core._renderService.dimensions` private).
3. **ChatOnlyShell terminal-tool bridge:** build new scoped `ChatOnlyTerminalToolBridge` (was: mount existing `IdeToolBridge` — incompatible per IDE-shell-specific assumptions audit).

## Scope

**In scope:**

- WebGL load-after-open per xterm v6
- Canvas fallback on `onContextLoss`
- Timer-cleanup verification + fix (`resizeDebounceRef`, `osc133GraceTimerRef`)
- Eliminate `_core._renderService.dimensions` in `CommandBlockOverlayBody`
- Audit 4 unflagged addons (`clipboard`, `image`, `unicode-graphemes`, `web-links`)
- ChatOnlyShell dock parity: New Claude/Codex buttons, recording controls, electron-store persistence, `ChatOnlyTerminalToolBridge`, `Ctrl+J` keybind
- Replace `useDockResize` with `useResizable`
- Update root + Terminal CLAUDE.md gotcha entries

**Out of scope:**

- New ChatOnlyShell layout (Wave 89)
- Interactive `claude` substrate (Wave 90)
- Dead-substrate code deletion (Wave 91)
- node-pty prebuilt-multiarch migration (defer until rebuild pain measured)
- Singleton TerminalManager + keep-instance-alive refactor (separate ADR; defer)
- `useResizable` sibling-stack extension (Wave 89 Phase 0)

## Phases

| Phase | Name | Implementer | Notes |
|---|---|---|---|
| 0 | Scaffolding | haiku-implementer | Addon manifest at `src/renderer/components/Terminal/terminalAddonManifest.ts`; dock-height schema fragment at `src/shared/config/dockPersistenceSchema.ts`; verify `useResizable` is importable from a stable location. Internal-only. Pyramid tests. |
| 1 | xterm lifecycle correctness | sonnet-implementer | Load WebGL after `term.open()`; canvas fallback on `onContextLoss`; swap private API to `term.dimensions.css.cell` in `CommandBlockOverlayBody`; load addons through manifest. Update CLAUDE.md gotcha. Internal-only. Trophy tests (UI-heavy). |
| 2 | Timer + listener cleanup | haiku-implementer | Verify and fix cleanup of `resizeDebounceRef`, `osc133GraceTimerRef`, ResizeObserver. Add 100-cycle mount/unmount regression test. Internal-only. Honeycomb tests. |
| 3 | Dock resize unification + persistence migration | sonnet-implementer | Replace `useDockResize` with `useResizable`; migrate dock height from localStorage to electron-store with one-time forward-migration. Internal-only. Honeycomb tests. |
| 4 | ChatOnlyShell terminal tool bridge | sonnet-implementer | Build `ChatOnlyTerminalToolBridge` responding only to `getTerminalOutput` for dock's active session; gracefully ignore file-viewer/file-tree queries. Multi-window query routing via `targetWindowId` (verify in IPC contract) OR active-window fallback. **Cross-boundary** — requires orchestrator-authored failing acceptance test per `~/.claude/rules/orchestrator-owned-acceptance-tests.md`. Honeycomb tests. |
| 5 | ChatOnlyShell parity: dock header actions + keyboard | sonnet-implementer | New Claude / New Codex buttons in `DockHeaderActions`; recording controls; `Ctrl+J` collapse keybind; mirror other IDE keybinds. Internal-only. Trophy tests. |
| 6 | Migration / cleanup | haiku-implementer | Delete old `useDockResize`; remove obsolete localStorage migration code post-migration; update CLAUDE.md files; commit wave result brief. Internal-only. Pyramid tests. |

### Phase ordering

Linear: 0 → 1 → 2 → 3 → 4 → 5 → 6. Phase 1 and Phase 2 can theoretically parallelize, but sequential ordering reduces risk for the first wave of the migration.

## Risks

| Risk | Mitigation |
|---|---|
| WebGL load-after-open surfaces theme-pickup race in v6 | Phase 1 spike: verify v6 `webgl.activate(term)` semantics in vendor docs before committing |
| `terminal.dimensions` is undefined before `open()` | Null-check guard in `CommandBlockOverlayBody`; verified pattern in v6 docs |
| Removing an unused addon breaks an invisible consumer | Phase 1: confirm via grep + git log before removing any addon from `package.json` |
| Multi-window routing for `ChatOnlyTerminalToolBridge` ambiguous in IPC contract | Phase 4 acceptance test exercises multi-window scenario; verify `targetWindowId` carry in `electron-agent-chat.d.ts` before implementing routing |
| `useDockResize` removal breaks Wave 89 prerequisite if `useResizable` isn't sibling-extensible | Out of Wave 88 scope (sibling extension is Wave 89 Phase 0); Wave 88 only proves fixed-edge consumer pattern |
| Keybind collision (`Ctrl+J` already bound in ChatOnlyShell) | Phase 5: audit `chatOnlyCommandFilter.ts` + `CommandPalette` registrations before claiming binding |

## Test coverage by phase

| Phase | Unit | Integration | Notes |
|---|---|---|---|
| 0 | yes | n/a | Type-only — addon manifest entries, schema fragment shape |
| 1 | partial | yes | Visual + manual smoke: open terminal in both shells, force WebGL context loss, observe canvas fallback |
| 2 | yes | yes | 100-cycle mount/unmount regression in vitest |
| 3 | yes | yes | Resize behavior + persistence round-trip |
| 4 | yes | yes | Cross-boundary acceptance test (orchestrator-authored) + multi-window scenario |
| 5 | yes | yes | DOM event simulation + manual keybind verification |
| 6 | yes | n/a | Cleanup verification |

## Acceptance criteria

- [ ] WebGL addon loads AFTER `term.open()` in `useTerminalSetup.lifecycle.ts` per xterm v6 guidance
- [ ] WebGL `onContextLoss` falls back to canvas renderer without remount; verified by devtools-induced context loss
- [ ] No `console.warn` fires on terminal mount in production build
- [ ] `CommandBlockOverlayBody` uses `term.dimensions.css.cell.{width,height}` exclusively; no `_core` access remains
- [ ] All 4 audited addons in `package.json` have documented purpose in `terminalAddonManifest.ts` OR have been removed
- [ ] `useDockResize` deleted; both shells consume `useResizable`
- [ ] Dock height persists in electron-store; localStorage value cleared post-migration
- [ ] Mount/unmount × 100 regression test passes with no leaked timers or observers
- [ ] ChatOnlyShell dock exposes New Claude, New Codex, recording controls
- [ ] `Ctrl+J` toggles dock collapse in ChatOnlyShell
- [ ] `ChatOnlyTerminalToolBridge` responds to `getTerminalOutput` from chat agent; gracefully ignores file-viewer / file-tree queries
- [ ] Cross-boundary acceptance test (Phase 4) passes — orchestrator-authored, untouched by implementer
- [ ] CLAUDE.md WebGL gotcha entry matches actual code
- [ ] `npm run validate` passes (typecheck + format + lint + test)
- [ ] `npm run mutation:test` passes Check 6 (mutation score ≥ 40%)
- [ ] Manual smoke: open both shells, force WebGL context loss, resize dock, exercise all parity features — no regressions

## Verification

### Per-phase experiential observation

| Phase | Observation point | Path to it | What "working" looks like there |
|---|---|---|---|
| 0 | Internal — no observation point | n/a | n/a |
| 1 | Terminal pane in ChatOnlyShell dock | xterm Terminal constructor → loadAddon(WebglAddon) post-open → term.open() → canvas paint → visible terminal | Terminal renders text crisply with WebGL-accelerated rendering; forcing context loss via devtools shows uninterrupted text rendering (canvas fallback active) |
| 2 | Terminal pane in ChatOnlyShell dock after open/close cycles | useTerminalSetupCleanup unmount → clearTimeout(resizeDebounceRef) → observer.disconnect() → no leaked handles | Opening and closing the dock 20× in a dev session produces no console warnings about leaked observers or stuck timers |
| 3 | Bottom terminal dock in ChatOnlyShell | useResizable drag handler → setDockHeight → electron-store write → dock re-render | Dragging the dock divider smoothly resizes; height persists across app restart; no console errors |
| 4 | Chat agent reply in ChatOnlyShell | Chat agent issues getTerminalOutput → ipcRenderer query → ChatOnlyTerminalToolBridge handler → terminalControl.activeId → terminalRegistry.getTerminalLines(activeId) → reply text | Agent's reply mentions the actual output of the user's last terminal command (not an empty or stale response) |
| 5 | Dock header in ChatOnlyShell | Ctrl+J keybind → useWorkbenchMenuEvents handler → setDockVisible(false) → ChatWorkbenchTerminalDock unmount | Dock collapses on Ctrl+J; clicking New Claude in the header opens a new claude session in a new dock tab |
| 6 | Internal — no observation point | n/a | n/a |

### Data-shape probes

```bash
# Verify no _core access remains in renderer (Phase 1)
grep -r "_core" src/renderer/components/Terminal/
# Should return zero matches after Phase 1

# Verify useDockResize is gone (Phase 3 or 6)
grep -r "useDockResize" src/renderer/
# Should return zero matches

# Verify dock height moved to electron-store (Phase 3)
grep -r "dockHeight" src/main/configSchema*.ts
# Should return the schema fragment entry
```

## Files the next agent should read first

1. `roadmap/wave-88-terminal-foundation/wave-88-decisions.md` — locked decisions (xterm v6 load order, public API, ChatOnly bridge replacement)
2. `src/renderer/components/Terminal/useTerminalSetup.lifecycle.ts` — primary Phase 1 modification site
3. `src/renderer/components/Terminal/CommandBlockOverlayBody.tsx` — private API access site to eliminate
4. `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchTerminalDock.tsx` — Phase 3 + Phase 5 site
5. `src/renderer/components/Layout/IdeToolBridge.tsx` — IDE-shell reference (do NOT mount in ChatOnly; build new scoped equivalent instead)
6. `src/renderer/components/Layout/useResizable.ts` — Phase 3 consumer pattern reference
7. `package.json` — current `@xterm/*` and `node-pty` versions

## Note to the implementer

This wave is foundation work for the chat-substrate migration. The temptation will be to "improve" terminal architecture beyond what's scoped — singleton TerminalManager refactor, keep-instance-alive pattern, node-pty prebuilt swap. Resist all of these. They are out of scope and have separate ADR or wave assignments. The acceptance criteria are the contract: hit them, leave the rest.

Phase 4 is the only cross-boundary phase. Per `~/.claude/rules/orchestrator-owned-acceptance-tests.md`, the orchestrator authors the failing acceptance test BEFORE dispatching Phase 4's implementer. The test exercises: (a) chat agent calling `getTerminalOutput` from ChatOnlyShell returns the dock's actual output; (b) chat agent calling `getOpenFiles` returns a structured "unavailable" response; (c) multi-window scenario doesn't cross-leak. The implementer cannot modify the test file.

Before declaring a phase complete, restate the observation point from the Verification table in your own words and describe what you actually observed there. If you could not observe it directly — no live IDE, no triggered chat session, no rendered panel — say so explicitly. Do not substitute "tests pass" for runtime observation. Tests passing at the unit boundary is necessary but not sufficient.

## Orchestrator dispatch checklist

1. Verify `wave-88-decisions.md` exists at canonical path with the three locked decisions filled in.
2. Phase 0 → `haiku-implementer` with scaffolding brief; gate: typecheck green, addon manifest covers all addons in `package.json`.
3. Phase 1 → `sonnet-implementer` with WebGL/private-API/CLAUDE.md brief; gate: terminal renders in both shells, context-loss smoke passes.
4. Phase 2 → `haiku-implementer` with cleanup brief; gate: 100-cycle mount/unmount test green.
5. Phase 3 → `sonnet-implementer` with `useResizable` swap + persistence migration brief; gate: dock resize + persistence round-trip; old `useDockResize` deleted.
6. Phase 4 → orchestrator authors failing acceptance test FIRST; then `sonnet-implementer` with `ChatOnlyTerminalToolBridge` brief and the test path; gate: orchestrator-owned acceptance test passes.
7. Phase 5 → `sonnet-implementer` with parity brief; gate: keybind + buttons + recording all functional in ChatOnly.
8. Phase 6 → `haiku-implementer` for cleanup; gate: no dead code, CLAUDE.md current.
9. Wave wrap: full `npm run validate` + `npm run mutation:test` + `/review` mechanical gap-check + manual smoke gate. Update `roadmap/HANDOFF.md`. Append entry to `roadmap/wave-temperature-log.md`.
