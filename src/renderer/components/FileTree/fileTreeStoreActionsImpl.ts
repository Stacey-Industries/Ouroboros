/**
 * fileTreeStoreActionsImpl.ts — action creators for fileTreeStore.
 *
 * Extracted to keep the immer callback under the 40-line function limit.
 * Each action calls `set()` with an immer-managed state draft.
 */

import type { WritableDraft } from 'immer';

import type { GitFileStatus } from '../../types/electron';
import type { TreeNode } from './FileTreeItem';
import type { DiagnosticSeverity, FileTreeState, SortMode, TreeFilter } from './fileTreeStore';
import type { EditState } from './fileTreeUtils';
import { flattenVisibleTree } from './fileTreeUtils';

type SetFn = (updater: (state: WritableDraft<FileTreeState>) => void) => void;

function getAllFlattenedNodes(state: FileTreeState): TreeNode[] {
  const result: TreeNode[] = [];
  for (const [, nodes] of state.roots) result.push(...flattenVisibleTree(nodes));
  return result;
}

function applySelectModifiers(state: WritableDraft<FileTreeState>, path: string, modifiers: { ctrl: boolean; shift: boolean }): void {
  if (modifiers.shift && state.lastSelectedPath) {
    const allNodes = getAllFlattenedNodes(state as unknown as FileTreeState);
    const lastIdx = allNodes.findIndex((n) => n.path === state.lastSelectedPath);
    const clickIdx = allNodes.findIndex((n) => n.path === path);
    if (lastIdx === -1 || clickIdx === -1) { state.selectedPaths.clear(); state.selectedPaths.add(path); }
    else {
      const start = Math.min(lastIdx, clickIdx);
      const end = Math.max(lastIdx, clickIdx);
      if (!modifiers.ctrl) state.selectedPaths.clear();
      for (let i = start; i <= end; i++) state.selectedPaths.add(allNodes[i].path);
    }
  } else if (modifiers.ctrl) {
    if (state.selectedPaths.has(path)) state.selectedPaths.delete(path);
    else state.selectedPaths.add(path);
    state.lastSelectedPath = path;
  } else {
    state.selectedPaths.clear();
    state.selectedPaths.add(path);
    state.lastSelectedPath = path;
  }
  state.focusedPath = path;
}

export function createFileTreeActions(set: SetFn) {
  return {
    toggleExpand: (path: string) => set((s) => { if (s.expandedPaths.has(path)) s.expandedPaths.delete(path); else s.expandedPaths.add(path); }),
    ensureExpanded: (path: string) => set((s) => { s.expandedPaths.add(path); }),
    select: (path: string, modifiers: { ctrl: boolean; shift: boolean }) => set((s) => { applySelectModifiers(s, path, modifiers); }),
    setFocus: (path: string | null) => set((s) => { s.focusedPath = path; }),
    setSearchQuery: (query: string) => set((s) => { s.searchQuery = query; }),
    setFilter: (filter: TreeFilter) => set((s) => { s.filter = filter; }),
    setSortMode: (mode: SortMode) => set((s) => { s.sortMode = mode; }),
    setEditState: (editState: EditState | null) => set((s) => { s.editState = editState; }),
    updateGitStatus: (status: Map<string, GitFileStatus>) => set((s) => { s.gitStatus = status; }),
    toggleBookmark: (path: string) => set((s) => { const idx = s.bookmarks.indexOf(path); if (idx >= 0) s.bookmarks.splice(idx, 1); else s.bookmarks.push(path); }),
    setBookmarks: (bookmarks: string[]) => set((s) => { s.bookmarks = bookmarks; }),
    setRootNodes: (rootPath: string, nodes: TreeNode[]) => set((s) => { s.roots.set(rootPath, nodes); }),
    markDirLoaded: (dirPath: string) => set((s) => { s.loadedDirs.add(dirPath); }),
    clearLoadedDirs: () => set((s) => { s.loadedDirs.clear(); }),
    selectAll: () => set((s) => {
      const allNodes = getAllFlattenedNodes(s as unknown as FileTreeState);
      s.selectedPaths.clear();
      for (const node of allNodes) s.selectedPaths.add(node.path);
    }),
    toggleSelection: (path: string) => set((s) => { if (s.selectedPaths.has(path)) s.selectedPaths.delete(path); else s.selectedPaths.add(path); }),
    clearSelection: () => set((s) => { s.selectedPaths.clear(); }),
    updateDiagnostics: (diagnostics: Map<string, DiagnosticSeverity>) => set((s) => { s.diagnostics = diagnostics; }),
    markDirty: (path: string) => set((s) => { s.dirtyFiles.add(path); }),
    markClean: (path: string) => set((s) => { s.dirtyFiles.delete(path); }),
    toggleNesting: () => set((s) => { s.nestingEnabled = !s.nestingEnabled; }),
    toggleNestExpansion: (path: string) => set((s) => { if (s.nestExpandedPaths.has(path)) s.nestExpandedPaths.delete(path); else s.nestExpandedPaths.add(path); }),
  };
}
