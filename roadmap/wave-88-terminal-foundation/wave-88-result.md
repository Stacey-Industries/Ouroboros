---
status: COMPLETED
created: 2026-05-14
updated: 2026-05-14
---

# Wave 88 — Terminal Foundation — Result Brief

First wave of the chat-substrate migration (88 → 91). Goal: bug-sweep the terminal
subsystem, bring the ChatOnly shell's terminal dock to parity with the IDE shell,
and migrate dock resize onto the shared `useResizable` hook — laying the foundation
for Wave 89's stacked-terminal layout and Wave 90's interactive-Claude substrate.

## What shipped

| Phase | Outcome |
|---|---|
| 0 — Scaffolding | Addon manifest (`terminalAddonManifest.ts`) declaring all 9 `@xterm/*` addons with load-order + criticality. `dockPersistenceSchema.ts` scaffolded — later superseded (see Phase 6). |
| 1 — xterm v6 lifecycle | WebGL addon loads AFTER `term.open()` per v6 guidance; `onContextLoss` disposes the addon and falls back to the canvas renderer without remount. `_core` private-API access removed from cell-height calculation (now DOM-based: `element.clientHeight / rows`). |
| 2 — Cleanup regression test | 100-cycle mount/unmount stress test locking down timer + observer teardown discipline. Phase 1's cleanup was already robust; this phase made it regression-proof (9 test cases). |
| 3 — Dock resize unification | `ChatWorkbenchTerminalDock` migrated from the bespoke `useDockResize` (window-level listeners, no pointer capture) to the shared `useResizable` hook, reusing the `terminal` PanelId. Dock height persists via `panelSizes.terminal` (localStorage + electron-store). One-time migration from the legacy `agent-ide:chat-workbench-terminal-dock` key. `useDockResize` deleted. |
| 4 — ChatOnlyTerminalToolBridge | Scoped tool bridge mounted in `ChatWorkbenchShell` — routes `getTerminalOutput` to the dock's active session; returns structured "unavailable in chat-only mode" for file-viewer/file-tree tool calls. Orchestrator-authored acceptance test (10 cases, untouched by implementer) — all passing. |
| 5 — Dock header parity + keybind | New Claude / New Codex buttons + a recording toggle in the dock header (mirrors the IDE shell's `TerminalTabs`). `Ctrl+J` toggles dock collapse (`useTerminalDockKeybind`). Handler logic extracted to `ChatWorkbenchTerminalDock.handlers.ts` for the line limit. |
| 6 — Cleanup | `dockPersistenceSchema.ts` + test deleted — superseded in Phase 3 by the existing `panelSizes.terminal` persistence. This brief written. |

## Manual smoke — PASSED

All three pending phases were smoke-tested against a live dev build:

- **Phase 1 — WebGL fallback:** forced context loss via DevTools `WEBGL_lose_context`. Confirmed: canvas renderer takes over cleanly, buffer line count unchanged across `dispose()` (no remount, no data loss), `screenElement` children `3 → 2` (WebGL canvas removed). No white flash after the Phase 1 flash fix.
- **Phase 3 — dock persistence:** instrumented build confirmed a custom dock height (561px) survives a full app restart via the localStorage round-trip.
- **Phase 4 — tool bridge:** chat agent in a live ChatOnly session correctly read the dock terminal's actual last-command output.

## Bugs found during smoke + fixed in-wave

The smoke pass surfaced four real defects in the wave's own phases — all fixed before Phase 6:

1. **UnicodeGraphemesAddon version string** (`009eb17d`) — Phase 1 set `term.unicode.activeVersion = 'graphemes'`; the addon registers `'15-graphemes'`. Threw on every terminal bootstrap (non-fatal, but the grapheme-aware width provider never activated).
2. **Phase 3 dock-height migration was destructive** (`9e14ed3c`) — `runLegacyDockHeightMigration` ran unconditionally and clobbered any user-set dock height with the stale legacy-key value. Fixed with a non-destructive guard (only apply when `panelSizes.terminal` is still default) + range clamp + unconditional legacy-key consumption.
3. **WebGL context-loss white flash** (`a7522224`) — the browser blanks the GL canvas synchronously on context loss, before `dispose()` removes it. Fixed by hiding the canvas (`display: none`) before `dispose()` so the DOM renderer shows through. No data loss was ever involved — purely the transient blank-canvas window.
4. **Misplaced `eslint-disable` from Phase 3** (folded into `f6ce33ab`) — the migration `useEffect`'s `eslint-disable-next-line` sat on the wrong line and never suppressed the `exhaustive-deps` warning. Replaced with a `useRef` snapshot — the genuinely-correct run-once-on-mount pattern.

## Environmental fix

- **`.stryker-tmp` tailwind exclusion** (`3a5db2be`) — an orphaned 6.3GB Stryker sandbox was being scanned by tailwind v4's auto-source walker; Windows paths inside it parsed as out-of-range Unicode escapes and killed the renderer CSS build. Added a `@source not` directive + `.gitignore` entry; deleted the orphan. Same failure class as Wave 53c / 53k.

## Deferred / follow-ups filed

Three follow-ups filed in `roadmap/follow-ups/` — all pre-existing, none Wave 88 scope:

- `2026-05-13-chatworkbench-integration-tests-missing-toast-provider.md` — two ChatWorkbench integration tests fail (`useToastContext` outside provider); test-setup gap, pre-exists on master.
- `2026-05-13-tailwind-codepoint-and-treesitter-wasm-versions.md` — the tailwind half is fixed (above); the tree-sitter wasm ABI drift (`web-tree-sitter@0.22.6` supports ABI 13-14, `@vscode/tree-sitter-wasm@0.3.1` ships ABI 15) is documented for a future bump.
- `2026-05-14-trace-logging-floods-console.md` — `[trace:agent-record]` / `[trace:ctx-preview]` `log.info` flood (4 sites, 3 files); recommended fix is `log.info → log.debug`. Kept as-is for now — it's live instrumentation for two still-open context-preview bugs.

## Vendor lessons (xterm.js v6 / addons)

- **`@xterm/addon-unicode-graphemes` registers version `'15-graphemes'`**, not `'graphemes'` — verified in the installed package source (`UnicodeGraphemeProvider` sets `this.version = e ? "15-graphemes" : "15"`, grapheme handling enabled by default).
- **WebGL context loss blanks the canvas synchronously** before any JS handler runs. `WebglAddon.dispose()` auto-repaints via `RenderService.setRenderer() → refreshRows()` — but the blank canvas is visible during the dispose window unless hidden first.
- **xterm v6.0.0 has no public cell-size property.** The former `_core._renderService.dimensions` private access was removed; cell height is now derived from the DOM (`element.clientHeight / rows`).
- `querySelector('canvas')` on `term.element` is unambiguous — only `WebglRenderer` appends a `<canvas>` to `screenElement`; the DOM renderer uses divs.

## Wave 89 prerequisite (carried forward)

`useResizable` is currently fixed-edge only. Wave 88 Phase 3 proved the fixed-edge consumer pattern; Wave 89's stacked-terminal layout needs a sibling-stack extension — that extension is Wave 89 Phase 0, not a Wave 88 gap.

## Commits

15 commits on `wave-88-terminal-foundation` off `6b2cacd8` (master). Linear history, no merges.
