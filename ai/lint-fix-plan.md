# Lint Fix Plan - Live Baseline (March 12, 2026)

## Current Baseline
Source of truth: `cmd /c npx eslint src/ --format json -o .lint-report.json`

- `448` errors
- `0` warnings
- `169` files with errors
- `0` files with warnings

The previous `657 errors / 12 warnings` snapshot is stale and should not drive execution.
Batch 1 warning cleanup is complete.

## Rule Distribution
- `max-lines-per-function`: `268`
- `complexity`: `94`
- `max-lines`: `46`
- `max-depth`: `37`
- `max-params`: `14`

## Constraints
- The worktree is already heavily dirty. Do not assume greenfield refactors.
- Prefer finishing files that were already partially decomposed over reopening untouched areas.
- The current `jsx-a11y/*` failures are stale disable-comment references, not real plugin-backed accessibility findings.
- Warnings and fatal unused-disable failures are cheap wins and should be cleared early.

## Highest-Yield Files
- `src/main/ipc-handlers/git.ts`: `21`
- `src/main/usageReader.ts`: `12`
- `src/renderer/components/Settings/ExtensionsSection.tsx`: `12`
- `src/renderer/hooks/useAgentEvents.ts`: `12`
- `src/main/pty.ts`: `9`
- `src/renderer/components/FileViewer/useFoldRanges.ts`: `9`
- `src/main/ipc-handlers/misc.ts`: `8`
- `src/renderer/components/Analytics/AnalyticsDashboard.tsx`: `8`
- `src/renderer/components/UsageModal/UsagePanel.tsx`: `8`

## Orchestrator Lanes
These are the execution lanes to keep changes isolated. If true subagents become available, assign one model-backed worker per lane. In this session, execute them sequentially but preserve the boundaries.

### Lane A - Main Process Structural Refactors
Focus:
- `src/main/ipc-handlers/git.ts`
- `src/main/usageReader.ts`
- `src/main/pty.ts`
- `src/main/ipc-handlers/misc.ts`
- `src/main/extensions.ts`
- `src/main/lsp.ts`

Goal:
- Reduce `max-lines-per-function`, `complexity`, `max-depth`, and `max-lines` together by extracting helpers instead of sprinkling disables.

### Lane B - Renderer Hooks and State Logic
Focus:
- `src/renderer/hooks/useAgentEvents.ts`
- `src/renderer/components/FileViewer/useFoldRanges.ts`
- `src/renderer/hooks/useSymbolOutline.ts`
- `src/renderer/hooks/useTerminalSessions.ts`

Goal:
- Eliminate dense control flow in shared hooks first because they unblock many downstream components.

### Lane C - Settings and UI Cleanup
Focus:
- `src/renderer/components/Settings/ExtensionsSection.tsx`
- `src/renderer/components/Settings/FileFilterSection.tsx`
- `src/renderer/components/Settings/AppearanceSection.tsx`
- `src/renderer/hooks/useTheme.ts`
- `src/renderer/components/FileViewer/InlineEditor.tsx`
- `src/renderer/components/FileViewer/SearchBar.tsx`

Goal:
- Remove fatal issues, warnings, JSX entity errors, and small structural violations in UI files already under active refactor.

### Lane D - Accessibility and Tail Cleanup
Focus:
- `src/renderer/components/Layout/Sidebar.tsx`
- `src/renderer/components/Layout/TerminalPane.tsx`
- small `no-unused-vars` / `no-unused-expressions` files

Goal:
- Clear the low-volume tail so later lint runs surface only real structural debt.

## Execution Order
### Batch 0 - Rebaseline and plan hygiene
- Keep `.lint-report.json` as the current baseline artifact.
- Update this plan whenever a full lint run changes counts materially.

### Batch 1 - Cheap wins and warning removal
- Remove unused `eslint-disable` directives in:
  - `src/renderer/components/Settings/AppearanceSection.tsx`
  - `src/renderer/hooks/useTheme.ts`
- Fix `react-hooks/exhaustive-deps` warnings in:
  - `src/renderer/components/AgentMonitor/TimelineBar.tsx`
  - `src/renderer/components/FileViewer/InlineEditor.tsx`
  - `src/renderer/components/FileViewer/SearchBar.tsx`
  - `src/renderer/components/Settings/FileFilterSection.tsx`
  - `src/renderer/components/Terminal/useTerminalCompletions.ts`
  - `src/renderer/components/Terminal/useTerminalSetup.ts`
  - `src/renderer/contexts/AgentEventsContext.tsx`
  - `src/renderer/hooks/useFileHeatMap.ts`
  - `src/renderer/hooks/usePty.ts`
  - `src/renderer/hooks/useToast.ts`
- Fix JSX entity escapes in `src/renderer/components/Settings/ExtensionsSection.tsx`
- Fix:
  - `@typescript-eslint/no-unused-vars`
  - `@typescript-eslint/no-unused-expressions`
  - `jsx-a11y/*`

Expected result:
- Remove the fatal failures.
- Bring warnings close to zero.
- Shrink the non-structural tail before touching deeper refactors.

Status:
- Complete. Warnings are now `0`.
- `src/renderer/components/FileViewer/useFoldRanges.ts` is fully clean after helper extraction.
- `src/main/approvalManager.ts` and `src/main/ipc-handlers/contextScanner.ts` were reduced to zero current lint findings.

### Batch 2 - Small structural files with high return
- `src/renderer/components/FileViewer/useFoldRanges.ts`
- `src/main/approvalManager.ts`
- `src/main/ipc-handlers/config.ts`
- `src/main/hooks.ts`
- `src/renderer/components/FileTree/FileList.tsx`
- `src/renderer/hooks/useSymbolOutline.ts`

Goal:
- Pick files where helper extraction can remove most or all violations in one pass.

### Batch 3 - Medium structural files already in active motion
- `src/renderer/hooks/useAgentEvents.ts`
- `src/renderer/components/Settings/ExtensionsSection.tsx`
- `src/main/usageReader.ts`
- `src/main/ipc-handlers/misc.ts`

Goal:
- Collapse the next layer of multi-rule offenders without reopening the largest files yet.

### Batch 4 - Largest offenders
- `src/main/ipc-handlers/git.ts`
- `src/main/pty.ts`
- `src/renderer/components/Analytics/AnalyticsDashboard.tsx`
- `src/renderer/components/UsageModal/UsagePanel.tsx`

Goal:
- These need deliberate decomposition. Treat them as dedicated refactor passes, not quick fixes.

## Verification
After each batch:
```bash
cmd /c npx eslint <target files>
```

After each material reduction:
```bash
cmd /c npx eslint src/ --format json -o .lint-report.json
```

End-of-wave verification:
```bash
cmd /c npm run lint
cmd /c npm run build
cmd /c npm test
```

## Definition of Done
- `0` lint errors
- `0` lint warnings
- No new behavior regressions introduced while decomposing active refactors
