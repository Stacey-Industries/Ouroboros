/**
 * useFileTreeDirtySync — bridges the FileViewerManager's dirty state
 * into the file tree Zustand store so dirty indicators appear in the tree.
 *
 * Mount this once near the root of the component tree, after both
 * FileViewerManager and the file tree store are available.
 */

import { useEffect, useRef } from 'react';
import { useFileViewerManager } from '../components/FileViewer/FileViewerManager';
import { useFileTreeStore } from '../components/FileTree/fileTreeStore';

export function useFileTreeDirtySync(): void {
  const { openFiles } = useFileViewerManager();
  const markDirty = useFileTreeStore((s) => s.markDirty);
  const markClean = useFileTreeStore((s) => s.markClean);

  // Track previously known dirty paths so we can detect transitions
  const prevDirtyRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const currentDirty = new Set<string>();

    for (const file of openFiles) {
      if (file.isDirty) {
        currentDirty.add(file.path);
        // If newly dirty, mark in store
        if (!prevDirtyRef.current.has(file.path)) {
          markDirty(file.path);
        }
      }
    }

    // Any previously-dirty file that's no longer dirty should be cleaned
    for (const path of prevDirtyRef.current) {
      if (!currentDirty.has(path)) {
        markClean(path);
      }
    }

    prevDirtyRef.current = currentDirty;
  }, [openFiles, markDirty, markClean]);
}
