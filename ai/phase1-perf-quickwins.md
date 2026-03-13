# Phase 1 — Performance Quick Wins

## Goal
Fix the highest-impact performance issues with minimal code changes.

## Tasks

### 1.1 Remove hardcoded setTimeout delays in pty.ts
- **File**: `src/main/pty.ts`
- **Lines**: ~168-172 (600ms shell startup), ~536-542 (1500ms Claude startup)
- **Fix**: Replace with event-based detection (wait for first prompt output) or use exponential backoff starting at 50ms
- **Fallback**: Reduce delays to 100ms/300ms if event-based is too risky

### 1.2 Lazy-mount inactive terminals
- **File**: `src/renderer/components/Terminal/TerminalTabs.tsx` (or wherever sessions.map renders TerminalInstance)
- **Current**: All TerminalInstance components are mounted with `display: none` for inactive ones
- **Fix**: Only render the active TerminalInstance. Use a ref/cache to preserve xterm state when switching back, OR accept re-initialization cost (still faster than keeping 10 hidden instances alive)
- **Caution**: Terminal output must still be buffered by the PTY layer so switching back shows history

### 1.3 Add React.memo to loop-rendered components
- **Files**:
  - `src/renderer/components/FileTree/FileTreeItem.tsx` — wrap export with `React.memo`
  - `src/renderer/components/Terminal/TerminalInstance.tsx` — wrap export with `React.memo`
  - `src/renderer/components/FileTree/FileTree.tsx` — wrap export with `React.memo`
- **Check**: Ensure props are stable (no inline objects/functions passed as props) or add custom comparator

### 1.4 Consolidate ref-syncing useEffects in TerminalInstance
- **File**: `src/renderer/components/Terminal/TerminalInstance.tsx`
- **Lines**: ~156-180 (13 separate useEffect hooks that only sync refs)
- **Fix**: Merge into single `useLayoutEffect` with all dependencies
- **Example**:
  ```tsx
  useLayoutEffect(() => {
    projectRootRef.current = projectRoot
    syncInputRef.current = syncInput
    cwdRef.current = cwd ?? ''
    // ... all others
  }, [projectRoot, syncInput, cwd, ...others])
  ```

### 1.5 Fix AgentEventsContext useMemo dependencies
- **File**: `src/renderer/contexts/AgentEventsContext.tsx`
- **Line**: ~18-21
- **Fix**: Add missing `dismiss`, `clearCompleted`, `updateNotes` to useMemo dependency array

### 1.6 Add write buffer size cap in TerminalInstance
- **File**: `src/renderer/components/Terminal/TerminalInstance.tsx`
- **Line**: ~287 (onData handler with writeBufferRef)
- **Fix**: If `writeBufferRef.current.length > 64_000`, flush immediately instead of waiting for RAF
