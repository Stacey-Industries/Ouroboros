/**
 * useFileTreeUndo.ts — Undo support for file tree delete operations.
 */

import { useCallback, useRef } from 'react';

export interface UndoItem {
  tempPath: string;
  originalPath: string;
  name: string;
}

type ToastFn = (message: string, level?: string) => void;

interface FileTreeUndoResult {
  undo: () => void;
  pushUndo: (items: UndoItem[]) => void;
}

const MAX_UNDO_STACK = 20;

export function useFileTreeUndo(
  refreshDir: (dir: string) => void,
  toast: ToastFn,
): FileTreeUndoResult {
  const stackRef = useRef<UndoItem[][]>([]);

  const pushUndo = useCallback((items: UndoItem[]) => {
    if (items.length === 0) return;
    stackRef.current.push(items);
    // Cap the stack to prevent memory bloat
    if (stackRef.current.length > MAX_UNDO_STACK) {
      stackRef.current.shift();
    }
  }, []);

  const undo = useCallback(() => {
    const items = stackRef.current.pop();
    if (!items || items.length === 0) return;

    void (async () => {
      try {
        const results = await Promise.all(
          items.map((item) =>
            window.electronAPI.files.restoreDeleted(item.tempPath, item.originalPath)
          ),
        );

        const succeeded = results.filter((r) => r?.success).length;
        const failed = items.length - succeeded;

        if (succeeded > 0) {
          // Collect unique parent directories to refresh
          const parentDirs = new Set(
            items
              .filter((_, i) => results[i]?.success)
              .map((item) => item.originalPath.replace(/[\\/][^\\/]+$/, '')),
          );
          for (const dir of parentDirs) {
            refreshDir(dir);
          }
        }

        // Toast feedback
        if (failed === 0) {
          toast(
            succeeded === 1
              ? `Restored "${items[0].name}"`
              : `Restored ${succeeded} items`,
          );
        } else if (succeeded === 0) {
          toast('Undo failed — files may have been permanently removed', 'error');
        } else {
          toast(
            `Restored ${succeeded} of ${items.length} items (${failed} failed)`,
            'warning',
          );
        }
      } catch {
        toast('Undo failed — an unexpected error occurred', 'error');
      }
    })();
  }, [refreshDir, toast]);

  return { undo, pushUndo };
}
