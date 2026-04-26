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

function createDraftAction<Args extends unknown[]>(
  set: SetFn,
  apply: (state: WritableDraft<FileTreeState>, ...args: Args) => void,
): (...args: Args) => void {
  return (...args: Args) => set((s) => apply(s, ...args));
}

function applySelectModifiers(
  state: WritableDraft<FileTreeState>,
  path: string,
  modifiers: { ctrl: boolean; shift: boolean },
): void {
  if (modifiers.shift && state.lastSelectedPath) {
    const allNodes = getAllFlattenedNodes(state as unknown as FileTreeState);
    const lastIdx = allNodes.findIndex((n) => n.path === state.lastSelectedPath);
    const clickIdx = allNodes.findIndex((n) => n.path === path);
    if (lastIdx === -1 || clickIdx === -1) {
      state.selectedPaths.clear();
      state.selectedPaths.add(path);
    } else {
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

function buildExpansionActions(set: SetFn) {
  return {
    toggleExpand: createDraftAction(set, (s, path: string) => {
      if (s.expandedPaths.has(path)) s.expandedPaths.delete(path);
      else s.expandedPaths.add(path);
    }),
    ensureExpanded: createDraftAction(set, (s, path: string) => {
      s.expandedPaths.add(path);
    }),
    toggleNesting: createDraftAction(set, (s) => {
      s.nestingEnabled = !s.nestingEnabled;
    }),
    toggleNestExpansion: createDraftAction(set, (s, path: string) => {
      if (s.nestExpandedPaths.has(path)) s.nestExpandedPaths.delete(path);
      else s.nestExpandedPaths.add(path);
    }),
  };
}

function buildSelectionActions(set: SetFn) {
  return {
    select: createDraftAction(
      set,
      (s, path: string, modifiers: { ctrl: boolean; shift: boolean }) => {
        applySelectModifiers(s, path, modifiers);
      },
    ),
    setFocus: createDraftAction(set, (s, path: string | null) => {
      s.focusedPath = path;
    }),
    selectAll: createDraftAction(set, (s) => {
      const allNodes = getAllFlattenedNodes(s as unknown as FileTreeState);
      s.selectedPaths.clear();
      for (const node of allNodes) s.selectedPaths.add(node.path);
    }),
    toggleSelection: createDraftAction(set, (s, path: string) => {
      if (s.selectedPaths.has(path)) s.selectedPaths.delete(path);
      else s.selectedPaths.add(path);
    }),
    clearSelection: createDraftAction(set, (s) => {
      s.selectedPaths.clear();
    }),
  };
}

function buildViewActions(set: SetFn) {
  return {
    setSearchQuery: createDraftAction(set, (s, query: string) => {
      s.searchQuery = query;
    }),
    setFilter: createDraftAction(set, (s, filter: TreeFilter) => {
      s.filter = filter;
    }),
    setSortMode: createDraftAction(set, (s, mode: SortMode) => {
      s.sortMode = mode;
    }),
    setEditState: createDraftAction(set, (s, editState: EditState | null) => {
      s.editState = editState;
    }),
    updateGitStatus: createDraftAction(set, (s, status: Map<string, GitFileStatus>) => {
      s.gitStatus = status;
    }),
  };
}

function buildStorageActions(set: SetFn) {
  return {
    toggleBookmark: createDraftAction(set, (s, path: string) => {
      const idx = s.bookmarks.indexOf(path);
      if (idx >= 0) s.bookmarks.splice(idx, 1);
      else s.bookmarks.push(path);
    }),
    setBookmarks: createDraftAction(set, (s, bookmarks: string[]) => {
      s.bookmarks = bookmarks;
    }),
    setRootNodes: createDraftAction(set, (s, rootPath: string, nodes: TreeNode[]) => {
      s.roots.set(rootPath, nodes);
    }),
    markDirLoaded: createDraftAction(set, (s, dirPath: string) => {
      s.loadedDirs.add(dirPath);
    }),
    clearLoadedDirs: createDraftAction(set, (s) => {
      s.loadedDirs.clear();
    }),
    updateDiagnostics: createDraftAction(
      set,
      (s, diagnostics: Map<string, DiagnosticSeverity>) => {
        s.diagnostics = diagnostics;
      },
    ),
    markDirty: createDraftAction(set, (s, path: string) => {
      s.dirtyFiles.add(path);
    }),
    markClean: createDraftAction(set, (s, path: string) => {
      s.dirtyFiles.delete(path);
    }),
  };
}

export function buildFileTreeActions(set: SetFn) {
  return {
    ...buildExpansionActions(set),
    ...buildSelectionActions(set),
    ...buildViewActions(set),
    ...buildStorageActions(set),
  };
}
