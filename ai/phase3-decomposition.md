# Phase 3 — File Decomposition

## Goal
Break the 4 monster files into focused, single-responsibility modules under 300 lines each.

## Targets

### 3.1 App.tsx (1,764 lines → ~200 line orchestrator)
- **Extract**: `src/renderer/components/Layout/AppShell.tsx` — layout wrapper, panel sizing
- **Extract**: `src/renderer/hooks/useSessionManager.ts` — terminal session state, spawn/kill logic (spawnSession, spawnClaudeSession, gracefulKill)
- **Extract**: `src/renderer/components/Settings/SettingsManager.tsx` — inline settings modal currently in App.tsx
- **Extract**: `src/renderer/components/Layout/LoadingScreen.tsx` — the LoadingScreen internal component
- **Extract**: `src/renderer/components/Layout/EditorTabBar.tsx` — editor tab bar internal component
- **Keep**: App.tsx as thin orchestrator wiring contexts and layout

### 3.2 TerminalInstance.tsx (1,612 lines → ~250 line core)
- **Extract**: `src/renderer/components/Terminal/TerminalCore.tsx` — xterm lifecycle, open/dispose, fit, resize, theme
- **Extract**: `src/renderer/components/Terminal/TerminalOverlays.tsx` — search bar, go-to-line, context menu
- **Extract**: `src/renderer/components/Terminal/CompletionManager.tsx` — tab completion, history suggestions, Fuse.js search
- **Extract**: `src/renderer/hooks/useTerminalData.ts` — PTY data handling, write buffer, OSC parsing
- **Keep**: TerminalInstance.tsx as composition root

### 3.3 FileViewer.tsx (1,366 lines → ~200 line viewer shell)
- **Extract**: `src/renderer/components/FileViewer/CodeViewer.tsx` — syntax highlighting, line numbers, fold gutter
- **Extract**: `src/renderer/components/FileViewer/DiffViewer.tsx` — diff mode, hunk navigation, conflict blocks
- **Extract**: `src/renderer/components/FileViewer/PreviewPane.tsx` — markdown/image preview
- **Extract**: `src/renderer/components/FileViewer/BlameGutter.tsx` — git blame display
- **Extract**: `src/renderer/components/FileViewer/SymbolOutline.tsx` — symbol outline panel
- **Keep**: FileViewer.tsx as view-mode switcher

### 3.4 FileTree.tsx (1,353 lines → ~150 line shell)
- **Extract**: `src/renderer/components/FileTree/RootSection.tsx` — the massive nested RootSection component (~1,150 lines itself)
- **Extract**: `src/renderer/components/FileTree/BookmarkSection.tsx` — pinned/bookmarked items
- **Extract**: `src/renderer/components/FileTree/TreeVirtualizer.tsx` — virtual scroll logic
- **Keep**: FileTree.tsx as tree shell + state provider

## Rules for Decomposition
- Preserve all existing functionality — no behavior changes
- Move code, don't rewrite it
- Update imports in all consumers
- Each extracted file should be under 300 lines
- If an extracted file is still over 300, split further
- Keep barrel exports (`index.ts`) up to date
- Run `npm run build` after each file to verify no breakage
