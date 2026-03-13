# Fix Plan — Post-Review Cleanup (March 2026)

## Status: Batch 1 + Batch 2 COMPLETE. Deferred items remain.

## Overview

17 features across 5 waves reviewed. 8 complete, 9 partial. This plan addresses all identified issues organized by execution batch.

### Completion Log
- **Batch 1** (11 fixes): ALL DONE. Build clean.
  - 1A: Context preload bridge — already existed (false positive from review)
  - 1B: `detail.path` → `detail.filePath` — fixed
  - 1C: audioRef → audioCtxRef — fixed
  - 1D: `command?: string` optional — fixed
  - 1E: normalizePath Windows detection — fixed
  - 1F: Sparkline Y-axis inversion — fixed
  - 1G: Dead code (App.tsx onOpenSettings, costCalculator fallbacks) — removed
  - 1H: Dead code (FILE_READ_TOOLS, os import, lineText) — removed
  - 1I: `lsp:diagnostics` → `lsp:diagnostics:push` — renamed
  - 1J: col forwarding to FileViewer — added
  - 1K: dispatchCommandEvent wired via IPC — done
- **Batch 2** (3 fixes): ALL DONE. Build clean.
  - 2A: useIdeToolResponder mounted in InnerApp with stub callbacks
  - 2B: useCommandBlocks + CommandBlockOverlay + BlockNavigator wired into TerminalInstance
  - 2C: git:createSnapshot now stages + commits with [Ouroboros Snapshot] label

---

## Batch 1 — Mechanical Fixes (No Design Decisions, Parallelizable)

### Fix 1A: Context Builder missing preload bridge [4B] — CRASH
- **File**: `src/preload/preload.ts`
- **Action**: Add `contextAPI` object with `scan` and `generate` invoke wrappers, include in `exposeInMainWorld`
- **Risk**: Low — purely additive wiring

### Fix 1B: Tooltip open-file property mismatch [2B]
- **File**: `src/renderer/components/Terminal/TerminalInstance.tsx` ~line 1262
- **Action**: Change `{ path: filePath }` to `{ filePath: filePath }` in `handleTooltipOpenFile`'s CustomEvent dispatch
- **Risk**: None — one-line property rename

### Fix 1C: Dead `audioRef` leaking AudioContext [3A]
- **File**: `src/renderer/contexts/ApprovalContext.tsx` ~line 32, 47
- **Action**: Replace dead `audioRef` with `audioCtxRef = useRef<AudioContext | null>(null)`. Guard AudioContext creation with `if (!audioCtxRef.current)` so only one is created
- **Risk**: Low

### Fix 1D: `McpServerConfig.command` non-optional [3B]
- **Files**: `src/renderer/types/electron.d.ts` ~line 970, `src/main/ipc-handlers/mcp.ts` ~line 21, `src/renderer/components/Settings/McpSection.tsx` `formToConfig`
- **Action**: Make `command` optional (`command?: string`), omit key in `formToConfig` when empty string
- **Risk**: Low

### Fix 1E: `normalizePath` always lowercases [3D]
- **File**: `src/renderer/hooks/useFileHeatMap.ts` ~line 40
- **Action**: Replace `typeof process !== 'undefined' || navigator.platform?.startsWith('Win')` with `navigator.platform?.startsWith('Win')` or `process.platform === 'win32'`
- **Risk**: None

### Fix 1F: Sparkline Y-axis inverted [4A]
- **File**: `src/renderer/components/Analytics/AnalyticsDashboard.tsx` ~lines 517-518
- **Action**: Invert Y mapping: `const y = (height - padding) - ((val - minVal) / range) * (height - 2 * padding)`
- **Risk**: None — visual fix only

### Fix 1G: Dead code cleanup (Wave 1)
- **Files**: `src/renderer/App.tsx` (dead `agent-ide:open-settings` listener + `onOpenSettings` function), `src/renderer/components/AgentMonitor/costCalculator.ts` (unreachable `??` fallbacks)
- **Action**: Remove dead code
- **Risk**: None

### Fix 1H: Dead code cleanup (Waves 4-5)
- **Files**: `src/renderer/hooks/useSessionAnalytics.ts` (unused `FILE_READ_TOOLS`), `src/main/ideToolServer.ts` (unused `os` import), `src/renderer/components/Terminal/useCommandBlocks.ts` (dead `lineText` variable at ~line 154)
- **Action**: Remove dead code
- **Risk**: None

### Fix 1I: `lsp:diagnostics` channel rename [2A]
- **Files**: `src/main/lsp.ts` (~line 384), `src/preload/preload.ts` (~line 322), `src/renderer/types/electron.d.ts`
- **Action**: Rename push-event channel from `lsp:diagnostics` to `lsp:diagnostics:push` in all three locations
- **Risk**: Low — must rename consistently across main/preload/renderer

### Fix 1J: Forward `col` from terminal link provider [2B]
- **Files**: `src/renderer/components/FileViewer/FileViewerManager.tsx` (~line 245), event types
- **Action**: Extract `col` from `agent-ide:open-file` detail, forward in `agent-ide:scroll-to-line` event, accept in downstream scroll handler
- **Risk**: Low — additive

### Fix 1K: `dispatchCommandEvent` never called [5D]
- **File**: `src/main/ipc-handlers/misc.ts` or wherever command execution is handled
- **Action**: Add IPC handler `extensions:commandExecuted` that calls `dispatchCommandEvent(commandId)`, wire from command palette execute path
- **Risk**: Low

---

## Batch 2 — Wiring Tasks (Require Reading Existing State, Sequential)

### Fix 2A: Mount `useIdeToolResponder` in App.tsx [5A]
- **File**: `src/renderer/App.tsx`
- **Action**: Import and call `useIdeToolResponder()` in `AppInner`, passing callback implementations that read from existing FileViewer and Terminal state
- **Complexity**: Medium — needs to read from FileViewerManager's open tabs, active file, and terminal session output. Must identify correct state sources.

### Fix 2B: Wire Command Blocks into TerminalInstance [5B]
- **File**: `src/renderer/components/Terminal/TerminalInstance.tsx`
- **Action**: Replace/augment the inline OSC 133 decoration path with `useCommandBlocks` hook. Render `CommandBlockOverlay` and `BlockNavigator` in JSX. Pass `commandBlocksEnabled` prop through.
- **Complexity**: Medium — must reconcile existing inline OSC 133 handling with the hook's approach. May need to remove duplicate logic.

### Fix 2C: `git:createSnapshot` should actually commit [4C]
- **File**: `src/main/ipc-handlers/git.ts` ~lines 730-737
- **Action**: Implement real snapshot: `git add -A`, `git commit -m "Snapshot: <label>"`, return new HEAD hash. Add `--allow-empty` flag for safety.
- **Risk**: Medium — creates real git commits in user's repo. Needs clear labeling.

---

## Deferred — Needs User Input

### Deferred A: CLAUDE.md Editor stale ref [3C]
- **Problem**: `editorContentRef` holds last-saved content, not live buffer. Format/Insert Template discard unsaved edits.
- **Design question**: Should `InlineEditor` expose an imperative API (ref with `getContent()`) or fire `onContentChange` on every edit? The former is simpler but breaks React patterns; the latter causes re-renders on every keystroke.
- **Files**: `src/renderer/components/FileViewer/ClaudeMdEditor.tsx`, `src/renderer/components/FileViewer/InlineEditor.tsx`

### Deferred B: Time-Travel detached HEAD [4C]
- **Problem**: `git checkout <hash>` leaves detached HEAD with no recovery UI.
- **Design question**: Should restore (a) create a new branch at the snapshot point, (b) use `git stash` + `git checkout` with auto-return-to-branch, or (c) show a diff-only view without actually checking out? Each has very different UX implications.
- **File**: `src/main/ipc-handlers/git.ts`, `src/renderer/components/TimeTravel/TimeTravelPanel.tsx`

### Deferred C: Time-Travel snapshots not namespaced by project [4C]
- **Problem**: All projects share one `workspaceSnapshots` array. Cross-project snapshot restore would checkout wrong commits.
- **Design question**: Namespace by project root hash? Or add `projectRoot` field to each snapshot and filter on load? Former is simpler config key, latter is more queryable.
- **File**: `src/renderer/hooks/useDiffSnapshots.ts`

### Deferred D: `useIdeToolResponder` callback implementations [5A]
- **Problem**: Even after mounting the hook, the actual callbacks need to read real state (open files, selections, terminal output).
- **Design question**: Which state sources to wire? FileViewerManager state? Terminal session refs? This shapes how tightly coupled the IDE tool channel is to the component tree.
- **Note**: Fix 2A mounts the hook with stub callbacks. This deferred item fills in real implementations.

---

## Execution Order

```
Batch 1 (11 fixes) — all parallelizable, no design decisions
  ↓
Batch 2 (3 fixes) — sequential, medium complexity
  ↓
Deferred (4 items) — needs human input on design trade-offs
```
