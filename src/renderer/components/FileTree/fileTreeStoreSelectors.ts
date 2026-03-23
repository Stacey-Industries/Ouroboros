/**
 * fileTreeStoreSelectors.ts — selector hooks for fileTreeStore.
 * Extracted from fileTreeStore.ts to keep file sizes manageable.
 */

import type { DiagnosticSeverity, SortMode, TreeFilter } from './fileTreeStore';
import { useFileTreeStore } from './fileTreeStore';

// ─── Basic selectors ──────────────────────────────────────────────────────────

/** Read the search query from the store */
export function useSearchQuery(): string {
  return useFileTreeStore((s) => s.searchQuery);
}

/** Read the expanded paths set from the store */
export function useExpandedPaths(): Set<string> {
  return useFileTreeStore((s) => s.expandedPaths);
}

/** Check if a specific path is expanded */
export function useIsExpanded(path: string): boolean {
  return useFileTreeStore((s) => s.expandedPaths.has(path));
}

/** Get the current filter */
export function useTreeFilter(): TreeFilter {
  return useFileTreeStore((s) => s.filter);
}

/** Get the current sort mode */
export function useSortMode(): SortMode {
  return useFileTreeStore((s) => s.sortMode);
}

/** Get the selected paths set */
export function useSelectedPaths(): Set<string> {
  return useFileTreeStore((s) => s.selectedPaths);
}

/** Get the focused path */
export function useFocusedPath(): string | null {
  return useFileTreeStore((s) => s.focusedPath);
}

/** Get the selection count */
export function useSelectionCount(): number {
  return useFileTreeStore((s) => s.selectedPaths.size);
}

// ─── Diagnostic selectors (4A) ───────────────────────────────────────────────

const SEVERITY_PRIORITY: Record<DiagnosticSeverity, number> = {
  error: 4,
  warning: 3,
  info: 2,
  hint: 1,
};

/** Get the diagnostic severity for a specific file path */
export function useDiagnosticForPath(path: string): DiagnosticSeverity | undefined {
  return useFileTreeStore((s) => s.diagnostics.get(path));
}

/**
 * Get the worst diagnostic severity among all children of a directory.
 * Scans the diagnostics map for paths that start with `dirPath/`.
 */
export function useDirectoryDiagnostic(dirPath: string): DiagnosticSeverity | undefined {
  return useFileTreeStore((s) => {
    const prefix = dirPath.replace(/\\/g, '/') + '/';
    let worst: DiagnosticSeverity | undefined;
    let worstP = 0;
    for (const [filePath, severity] of s.diagnostics) {
      const normalizedPath = filePath.replace(/\\/g, '/');
      if (normalizedPath.startsWith(prefix)) {
        const p = SEVERITY_PRIORITY[severity] ?? 0;
        if (p > worstP) { worstP = p; worst = severity; }
      }
    }
    return worst;
  });
}

// ─── Dirty file selectors (4C) ───────────────────────────────────────────────

/** Check if a specific file has unsaved changes */
export function useIsDirty(path: string): boolean {
  return useFileTreeStore((s) => s.dirtyFiles.has(path));
}

/** Get the total count of dirty (unsaved) files */
export function useDirtyFileCount(): number {
  return useFileTreeStore((s) => s.dirtyFiles.size);
}

// ─── Nesting selectors (4B) ──────────────────────────────────────────────────

/** Check if file nesting is enabled */
export function useNestingEnabled(): boolean {
  return useFileTreeStore((s) => s.nestingEnabled);
}
