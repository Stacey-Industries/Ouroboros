# Wave 40 — Phase A Audit Report

Generated: 2026-04-17. Read-only — no code changes made.

---

## Candidates

### 1. `semantic_match` reason

- **Grep hits:** 4 total across 3 files
  - `src/main/orchestration/contextSelector.ts` — entry `['semantic_match', 0]` in `REASON_WEIGHTS` map (weight zero, comment: "Wave 19: semantic_match removed — no active code path")
  - `src/shared/types/orchestrationDomain.ts` — still a member of the `ContextReasonKind` union type
  - `src/main/orchestration/contextSelector.test.ts` — placeholder test asserting the reason's weight is 0 (`expect(true).toBe(true)`)
- **Live callers:** None. No code path produces a `semantic_match` reason — the `REASON_WEIGHTS` entry exists purely as a tombstone with weight 0. The type union keeps TypeScript happy but no emitter generates this kind.
- **Verdict:** `SAFE_TO_REMOVE`
- **Notes for Phase B:** Remove the `['semantic_match', 0]` row from `REASON_WEIGHTS`, the `'semantic_match'` member from the `ContextReasonKind` union in `orchestrationDomain.ts`, and the placeholder test block. No feature extraction code to delete.

---

### 2. `active_file` / `open_file` reasons

- **Grep hits:** 8 total across 5 files
  - `src/main/orchestration/contextSelector.ts` — both entries in `REASON_WEIGHTS` map with weight 0 each (`['active_file', 0]`, `['open_file', 0]`); ALSO live emitters at lines 115–116: `addCandidate(liveIdeState.activeFile, 'active_file', ...)` and `for (const filePath of liveIdeState.openFiles) addCandidate(filePath, 'open_file', ...)`.
  - `src/main/orchestration/contextSelectorHelpers.ts` — `active_file` referenced in `confidenceFor()`: any candidate with an `active_file` reason is promoted to `high` confidence regardless of score.
  - `src/main/orchestration/contextPacketBuilderSupport.ts` — `active_file` in `TIER2_REASONS` set, which guarantees it at least 25% of the budget. (This is a reference to the *kind string*, not the weight.)
  - `src/shared/types/orchestrationDomain.ts` — both kinds are members of `ContextReasonKind` union.
  - `src/renderer/components/Orchestration/ContextPreview.test.ts` — test fixture uses `kind: 'open_file'`.
- **Live callers:** YES — both reasons have **active emitters** in `contextSelector.ts`. The weights are 0 in `REASON_WEIGHTS`, but these candidates are still emitted, still promoted to `high` confidence in `confidenceFor()`, and `active_file` is still a member of `TIER2_REASONS` (guaranteed budget allocation). Weight-0 + tier-2 is contradictory: files are injected at high confidence but score 0 in additive path. Under the learned ranker this matters less, but the confidence/tier paths are still live regardless.
- **Verdict:** `HAS_LIVE_CALLERS` — the weight being 0 is misleading. The reasons are emitted and consumed by confidence and tier logic. Removal requires coordinated cleanup across `contextSelector.ts`, `contextSelectorHelpers.ts`, `contextPacketBuilderSupport.ts`, and the type union.
- **Notes for Phase B:** Before removing, decide: are `active_file` and `open_file` semantically replaced by `dirty_buffer` + learned ranker? If yes, the emitters at lines 115–116 and the `TIER2_REASONS`/`confidenceFor()` references must all be updated together. Do not remove weight entries alone — that leaves orphaned emitters.

---

### 3. `REASON_WEIGHTS` constant

- **Grep hits:** 7 total, all in `src/main/orchestration/contextSelector.ts`
  - Declaration at line 64: `const REASON_WEIGHTS = new Map<ContextReasonKind, number>([...])`
  - 4 active use sites:
    - Line 103: `addReason(..., REASON_WEIGHTS.get(kind) ?? 0)` — used in the candidate builder for pinned/included/active/open/dirty/etc.
    - Line 134: `REASON_WEIGHTS.get(kind) ?? 32` — for `recent_edit` path
    - Line 146: `REASON_WEIGHTS.get('git_diff') ?? 56` — for git diff path (with AGENT_DIFF_WEIGHT override)
    - Line 177: `REASON_WEIGHTS.get('keyword_match') ?? 26` — keyword match path
    - Line 191: `REASON_WEIGHTS.get('import_adjacency') ?? 22` — import adjacency path
  - `contextSelector.test.ts` — mentions `REASON_WEIGHTS` in a comment only (not imported — not exported)
- **Live callers:** YES — `REASON_WEIGHTS` is the active weight table for the additive scorer path. The learned ranker (`contextClassifier`) overrides the final sort order when `cfg?.learnedRanker === true`, but `REASON_WEIGHTS` still runs first to populate candidate scores used in non-ranker paths and as the tie-break / fallback. The ranker does not replace weight accumulation; it replaces the final sort. `REASON_WEIGHTS` is not the "additive path" as a separate branch — it is integrated into candidate construction, which runs unconditionally.
- **Verdict:** `HAS_LIVE_CALLERS` — `REASON_WEIGHTS` cannot be removed without redesigning how candidates receive their initial scores.
- **Notes for Phase C:** The plan to "delete the additive-weight fallback" needs refinement. The learned ranker overrides ranking, not scoring. `REASON_WEIGHTS` is still used for: (a) assigning initial scores to each reason kind, (b) confidence classification (`confidenceFor`), (c) tier assignment. Phase C should either: keep `REASON_WEIGHTS` for these purposes and only eliminate any explicit non-ranker sort path (which does not appear to exist as a separate branch), or restructure so that weights are reduced to a confidence-only table. Recommend: **scope Phase C to removing the 0-weight dead entries only** (semantic_match, active_file, open_file — done via Phase B) rather than the full table.

---

### 4. `windowSessions` config key

- **Grep hits:** 30+ across 6 files
  - `src/main/configSchema.ts` — defined as a top-level config array of `WindowSession` objects
  - `src/main/config.ts` — typed in `AppConfig` interface
  - `src/main/windowManager.ts` — actively written by `persistWindowSessions()` and read by `restoreWindowSessions()` (both called from main startup)
  - `src/main/session/sessionMigration.ts` — reads `windowSessions` to migrate to `sessionsData`; comment explicitly states the key is "intentionally preserved as a deprecated fallback for two releases per Wave 16 migration plan §4"
  - `src/main/session/sessionStartup.ts` — calls `migrateWindowSessionsToSessions` (which reads `windowSessions`)
  - `src/main/session/sessionMigration.test.ts` — 10+ test cases exercising the migration
- **Live callers:** YES — `windowSessions` is both **written** (by window manager) and **read** (by restore on startup and migration). The migration shim explicitly preserves the key intentionally. `ManagedWindow.projectRoots` is the runtime per-window store; `windowSessions` is the persistence layer for cross-restart restore. Both are active.
- **Verdict:** `REMOVE_WITH_MIGRATION` — The migration path exists (`sessionMigration.ts`), but the key is still actively written by `persistWindowSessions` on every window close/quit. Phase D must: (1) stop writing `windowSessions` from `persistWindowSessions`, (2) keep `restoreWindowSessions` or replace with `sessionsData`-based restore, (3) verify the one-time migration shim has already run for existing users, (4) remove the config key from schema and type.
- **Notes for Phase D:** Check whether `sessionsData` restore is wired and works independently. If `sessionMigration.ts` is already being called and `sessionsData` is the source of truth for window restore, then removing the write path is safe. The migration test suite provides strong coverage.

---

### 5. `panelSizes` localStorage fallback

- **Grep hits:** 15+ across 6 files
  - `src/renderer/components/Layout/useResizable.ts` — `loadSizes()` reads `localStorage.getItem('agent-ide:panel-sizes')` as the primary source on mount; `saveSizes()` writes to **both** localStorage AND electron-store (`panelSizes`). localStorage is read first on init, electron-store is written async on every drag commit.
  - `src/renderer/hooks/useWorkspaceLayouts.ts` — `readCurrentPanelState()` reads `localStorage.getItem('agent-ide:panel-sizes')` to capture current sizes when saving a layout snapshot.
  - `src/main/config.ts` / `src/main/configSchema.ts` — `panelSizes` key defined in electron-store schema with defaults.
  - `src/main/ipc-handlers/configHelpers.ts` — `panelSizes` in allowed config key list.
  - Layout CLAUDE.md — explicitly documents: "Persisted to `localStorage` key `agent-ide:panel-sizes` and `electron-store` key `panelSizes`"
- **Live callers:** YES — localStorage is not a "fallback" here; it is the **primary read path** in `useResizable.loadSizes()`. Electron-store is write-only from the renderer (via IPC). On cold start, `useResizable` initialises from localStorage because electron-store values arrive via async IPC after mount. Both are live and serve different roles.
- **Verdict:** `KEEP` — The dual-persistence is intentional: localStorage provides sync cold-start read (avoids size flash), electron-store provides cross-profile persistence. This is not a "fallback" pattern; it is a complement. Phase E as specified (drop localStorage reads) would cause a panel-size flash on every app launch. Recommend: **close Phase E or redefine** to make electron-store the sync source (which would require a preload-time config read, a non-trivial change). If the goal is just removing the *old* `agent-ide:panel-sizes` key in favour of something from the layout presets system, that is a different task.

---

### 6. `streamingInlineEdit` flag

- **Grep hits:** 15+ across 7 files
  - `src/main/config.ts` — `streamingInlineEdit: boolean` in `AppConfig`
  - `src/main/configSchemaTail.ts` — schema entry, default `false`
  - `src/renderer/types/electron-foundation.d.ts` — in typed config interface
  - `src/renderer/hooks/useStreamingInlineEditFlag.ts` — mirrors `config.streamingInlineEdit` → `window.__streamingInlineEdit__`
  - `src/renderer/hooks/useStreamingInlineEditFlag.test.ts` — full test suite (4 tests)
  - `src/renderer/components/FileViewer/useInlineEdit.ts` — reads `window.__streamingInlineEdit__` at submit time; routes to `useStreamingInlineEdit` path when true
  - `src/renderer/components/Settings/AgentSection.tsx` — toggle in Settings UI (`ToggleSection` bound to `draft.streamingInlineEdit`)
  - `src/main/ipc-handlers/aiStreamHandler.test.ts` — mock returns `true` for `streamingInlineEdit`
- **Live callers:** Both the enabled path (`useStreamingInlineEdit`) and disabled path (bulk `ai:inline-edit`) are present in `useInlineEdit.ts`. The Settings UI exposes the toggle so users can enable it. Default is `false` (disabled-path dominates). The flag is properly wired end-to-end: config → preload → IPC → renderer → `window.__streamingInlineEdit__` → submit routing.
- **Which path is stable:** The **disabled path** (bulk `ai:inline-edit`) is the default and has been stable since Wave 6. The streaming path (`useStreamingInlineEdit`) is the opt-in. Git history on the flag is consistent across CLAUDE.md mentions — the flag has been "wired but not removed" since Phase 8 soak.
- **Verdict:** `SAFE_TO_REMOVE` — sufficient soak time. Phase F: inline the enabled-path (`useStreamingInlineEdit`) unconditionally in `useInlineEdit.ts`, delete the `window.__streamingInlineEdit__` check, delete `useStreamingInlineEditFlag.ts` and its test, remove `streamingInlineEdit` from config schema + AppConfig + types, remove the Settings toggle in `AgentSection.tsx`.
- **Notes for Phase F:** Confirm `useStreamingInlineEdit` hook exists and is fully implemented before inlining. The Settings toggle removal means the `ToggleSection` block in `AgentSection.tsx` must be cleanly excised.

---

### 7. `internalMcp` module

- **Grep hits:** 25+ across many files
- **Git log (`src/main/internalMcp/`):** Only authorship-era commits (Wave 14 era) — no integration commits in the git log for the module directory itself.
- **Import analysis:**
  - `src/main/main.ts` — **ACTIVELY IMPORTS AND CALLS**: `import { removeFromProjectSettings, startInternalMcpServer } from './internalMcp'`; `startInternalMcp()` is registered in the startup sequence at line 164; `internalMcpStop` variable tracks the server handle; cleanup is called in `beforeQuit`.
  - `src/main/codebaseGraph/mcpToolHandlers.ts` — imports `McpToolDefinition` type from `../internalMcp/internalMcpTypes`
  - `src/main/mcpHost/mcpHostProxy.ts` — imports `findTool`, `getActiveTools` from `../internalMcp/internalMcpTools`; used when `useMcpHost` config flag is on
  - `src/main/mcpHost/mcpHostProxy.test.ts` — mocks `../internalMcp/internalMcpTools`
- **Config flag:** `internalMcpEnabled: boolean` (default `true` in schema). `startInternalMcp()` gates on this flag.
- **Verdict:** `KEEP` — **The module is wired.** The CLAUDE.md "Known Issues" note ("never wired") is stale. `main.ts` imports and calls `startInternalMcpServer` in the app startup sequence (line 164). The `internalMcpEnabled` config flag defaults to `true`. The module is a live, shipped feature. Phase G should be: update CLAUDE.md to remove the "not wired" language and close this tech-debt item.
- **Notes for Phase G:** The `src/main/internalMcp/CLAUDE.md` still says "UNWIRED" at the top — this is incorrect. Update both root CLAUDE.md and `src/main/internalMcp/CLAUDE.md`. No deletion warranted.

---

## Knip report

Full knip output had 100 unused files, 819 unused exports, 5 unused dependencies, 2 unused devDependencies, 9 unlisted dependencies. Below is the subset relevant to the three targeted module paths:

### `src/main/orchestration/`

Knip flagged one file as unused:
- `src/main/orchestration/contextWorker.ts` — flagged as unused file
- `src/main/orchestration/contextWorkerTypes.ts` — flagged as unused file

Knip flagged one unused export in the orchestration router index:
- `src/main/orchestration/providers/anthropicApiAdapter.ts` — flagged as unused file

No other orchestration exports flagged as dead.

### `src/main/research/` (if it exists)

No `src/main/research/` directory found — not a current module path in the codebase. One research-related file appeared in the unlisted dependencies section: `src/main/research/researchSubagent.ts` (references `uuid` which is unlisted). This file itself was not flagged as an unused file by knip, suggesting it has callers.

### `src/main/session/`

No session-module exports flagged as dead by knip. The session module appears fully connected.

### Notable knip findings beyond the target modules

These are recorded for Phase H awareness (not for Phase A action):

**Unused files worth noting:**
- `src/main/orchestration/contextWorker.ts` + `contextWorkerTypes.ts` — Web Worker wrapper, appears unused (no caller imports it)
- `src/renderer/components/Orchestration/` — entire directory (16 files including `OrchestrationPanel.tsx`, task composer, verification summary, history views) flagged as unused files
- `src/renderer/components/Settings/SettingsModal.tsx`, `SettingsModalFrame.tsx`, `SettingsModalParts.tsx` — unused (Settings is now a panel in `CentrePaneConnected`, not a modal)
- `src/renderer/components/primitives/` — all primitive components flagged as unused files
- `src/main/codemode/` — 4 files flagged as unused (executor, mcpClient, proxyServer, typeGenerator)
- `src/renderer/components/UsageModal/` — 5 files flagged as unused
- `src/main/router/` barrel exports — `classifyFeatures`, `reloadWeights`, `extractFeatures`, etc. exported but callers use direct file imports

**Unused dependencies:**
- `@capacitor/android`, `@codemirror/theme-one-dark`, `@dnd-kit/sortable`, `@xenova/transformers`, `remark-gfm`

---

## Known-issues list audit (from CLAUDE.md)

> "Known Issues / Tech Debt" section from `CLAUDE.md` (root), line 184–192.

| Item | Still present? | Evidence | Closed by which wave? |
|---|---|---|---|
| TerminalPane and TerminalManager both render tab bars (double header) | **CLOSED — no longer accurate** | `TerminalManager.tsx` does NOT render `TerminalTabs`. `TerminalManagerContent.tsx` (internal component) renders a tab bar only if used as the outer shell, but in the current wiring `TerminalPane` in `AppLayout` renders `TerminalTabs` and `TerminalManager` renders only the terminal content area (no tab bar). Single header architecture is in place. | Resolved sometime after original report; exact wave unclear |
| Settings modal in App.tsx is inline | **CLOSED** | `App.tsx` has no inline settings modal. `CentrePaneConnected.tsx` uses `SettingsPanel` (lazy-loaded) as a centre-pane view. Settings components in `components/Settings/SettingsModal.tsx` etc. are actually flagged as **unused** by knip. | Closed — panel architecture replaced modal |
| `internalMcp/` module (SSE MCP server) — implemented but never wired into main.ts | **CLOSED — stale** | `main.ts` imports `startInternalMcpServer`, `removeFromProjectSettings` from `./internalMcp` and calls `startInternalMcpServer` in the startup sequence (line 164). `internalMcpEnabled` defaults to `true`. The module is wired and running in production. | Wired (wave not tagged in git for internalMcp itself — appears to have been wired silently) |
| `streamingInlineEdit` feature flag is wired but not removed | **STILL PRESENT** | Confirmed active in config schema, settings UI, and `useInlineEdit.ts` routing. Default is `false`. | Phase F target |
| Background job queue concurrency cap and queue length cap (50) are hardcoded | **Needs separate grep** | Not audited in this phase. Not a Wave 40 target. | Not closed |
| `refs/ouroboros/checkpoints/<threadId>` refs accumulate; GC policy runs lazily | **Needs separate grep** | Not audited in this phase. Not a Wave 40 target. | Not closed |

---

## Recommended Phase order adjustments

Based on the verdicts above:

1. **Phase B** (`semantic_match` removal): Proceed as planned. `SAFE_TO_REMOVE`. But **add** coordinated `active_file` / `open_file` emitter removal to Phase B scope (see candidate 2) — they share the same type union and the emitter cleanup in `contextSelector.ts` lines 115–116 must happen alongside the weight-table cleanup. Do not leave orphaned emitters with dead weights.

2. **Phase C** (`REASON_WEIGHTS`): **Redefine scope**. `REASON_WEIGHTS` is a live, unconditional table used for initial scoring, confidence, and tier classification. The "additive path" is not a discrete code branch — it is integrated into candidate construction that runs regardless of whether the learned ranker is active. Recommend Phase C becomes: "remove dead weight entries (semantic_match, active_file, open_file from the map) and verify confidence/tier correctness after Phase B" rather than deleting the whole table.

3. **Phase D** (`windowSessions`): `REMOVE_WITH_MIGRATION` — safe to proceed but requires care. The write path in `persistWindowSessions` must be cut first, then verify `sessionsData`-based restore is fully wired in `sessionStartup.ts`.

4. **Phase E** (`panelSizes` localStorage): **Recommend closing / redefining.** localStorage is the *primary* sync cold-start read source for `useResizable` — removing it causes a panel-size flash. This is not a dead fallback. If the goal is cleanup, it may not apply here. No action unless the panel architecture is fundamentally restructured.

5. **Phase F** (`streamingInlineEdit`): Proceed. `SAFE_TO_REMOVE`.

6. **Phase G** (`internalMcp`): **Change to CLAUDE.md correction only.** The module is live and wired. Delete the "never wired" language from root CLAUDE.md Known Issues and from `src/main/internalMcp/CLAUDE.md`. No code changes.

7. **Phase H** (knip zero-dead): Proceed with focus on `contextWorker.ts` / `contextWorkerTypes.ts` (genuinely unused), `Orchestration/` component directory (entire subtree appears unused), and `Settings/SettingsModal*.tsx` (superseded by panel architecture). The `primitives/` components and `UsageModal/` subtree also warrant review. Caution on knip false positives for type-only exports.
