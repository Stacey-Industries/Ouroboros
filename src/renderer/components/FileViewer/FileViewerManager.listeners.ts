/**
 * FileViewerManager event listeners — extracted from FileViewerManager.internal.ts.
 */
import log from 'electron-log/renderer';
import type { RefObject } from 'react';
import { useCallback, useEffect, useState } from 'react';

import { SAVE_ALL_DIRTY_EVENT } from '../../hooks/appEventNames';
import type { FileChangeEvent } from '../../types/electron';
import {
  DEFAULT_SPLIT_STATE,
  handleProjectFileChange,
  type OpenFile,
  reloadFileContent,
  type SaveFileResult,
  type SetActiveIndex,
  type SetOpenFiles,
  type SplitState,
} from './FileViewerManager.internal';

export function useProjectChangeListener(
  projectRoot: string | null,
  setOpenFiles: SetOpenFiles,
): void {
  useEffect(() => {
    if (!projectRoot) return;
    const cleanup = window.electronAPI.files.onFileChange((change: FileChangeEvent) => {
      void handleProjectFileChange(change, setOpenFiles);
    });
    return cleanup;
  }, [projectRoot, setOpenFiles]);
}

export function useReloadFileListener(setOpenFiles: SetOpenFiles): void {
  useEffect(() => {
    function onReloadFile(event: Event): void {
      const { filePath } = (event as CustomEvent<{ filePath: string }>).detail;
      if (!filePath) return;
      void reloadFileContent(filePath, setOpenFiles);
    }
    window.addEventListener('agent-ide:reload-file', onReloadFile);
    return () => window.removeEventListener('agent-ide:reload-file', onReloadFile);
  }, [setOpenFiles]);
}

export function useOpenFileListener(openFile: (filePath: string) => Promise<void>): void {
  useEffect(() => {
    function onOpenFile(event: Event): void {
      const detail = (event as CustomEvent<{ filePath: string; line?: number; col?: number }>)
        .detail;
      if (!detail.filePath) return;
      void openFile(detail.filePath).then(() => {
        if (detail.line == null || detail.line <= 0) return;
        requestAnimationFrame(() => {
          window.dispatchEvent(
            new CustomEvent('agent-ide:scroll-to-line', {
              detail: { filePath: detail.filePath, line: detail.line, col: detail.col },
            }),
          );
        });
      });
    }
    window.addEventListener('agent-ide:open-file', onOpenFile);
    return () => window.removeEventListener('agent-ide:open-file', onOpenFile);
  }, [openFile]);
}

export function useSaveAllDirtyListener(
  openFilesRef: RefObject<OpenFile[] | null>,
  saveFile: (filePath: string, content?: string) => Promise<SaveFileResult>,
): void {
  useEffect(() => {
    function onSaveAllDirty(event: Event): void {
      const detail = (event as CustomEvent<{ addPromise?: (p: Promise<void>) => void }>).detail;
      const files = openFilesRef.current ?? [];
      const dirtyFiles = files.filter((f) => f.isDirty && f.content != null);
      if (dirtyFiles.length === 0) return;
      const savePromise = Promise.all(
        dirtyFiles.map((f) =>
          saveFile(f.path, f.content!).catch((error) => {
            log.error('Failed to save dirty file:', f.path, error);
          }),
        ),
      ).then(() => {});
      if (typeof detail?.addPromise === 'function') detail.addPromise(savePromise);
    }
    window.addEventListener(SAVE_ALL_DIRTY_EVENT, onSaveAllDirty);
    return () => window.removeEventListener(SAVE_ALL_DIRTY_EVENT, onSaveAllDirty);
  }, [openFilesRef, saveFile]);
}

export function useSaveActiveFileListener(
  openFilesRef: RefObject<OpenFile[] | null>,
  activeIndexRef: RefObject<number | null>,
  saveFile: (filePath: string, content?: string) => Promise<SaveFileResult>,
): void {
  useEffect(() => {
    function onSaveActive(): void {
      const files = openFilesRef.current ?? [];
      const idx = activeIndexRef.current ?? 0;
      const file = files[idx];
      if (file && file.isDirty && file.content != null) void saveFile(file.path, file.content);
    }
    window.addEventListener('agent-ide:save-active-file', onSaveActive);
    return () => window.removeEventListener('agent-ide:save-active-file', onSaveActive);
  }, [openFilesRef, activeIndexRef, saveFile]);
}

export function useCloseActiveTabListener(
  openFilesRef: RefObject<OpenFile[] | null>,
  activeIndexRef: RefObject<number | null>,
  closeFile: (filePath: string) => void,
): void {
  useEffect(() => {
    function onCloseTab(): void {
      const files = openFilesRef.current ?? [];
      const idx = activeIndexRef.current ?? 0;
      const file = files[idx];
      if (file) closeFile(file.path);
    }
    window.addEventListener('agent-ide:close-active-tab', onCloseTab);
    return () => window.removeEventListener('agent-ide:close-active-tab', onCloseTab);
  }, [openFilesRef, activeIndexRef, closeFile]);
}

export function useNewFileListener(
  setOpenFiles: SetOpenFiles,
  setActiveIndex: SetActiveIndex,
): void {
  useEffect(() => {
    let untitledCounter = 1;
    function onNewFile(): void {
      const fileName = `Untitled-${untitledCounter++}`;
      const newFile: OpenFile = {
        path: fileName,
        name: fileName,
        content: '',
        originalContent: '',
        diskContent: null,
        isLoading: false,
        error: null,
        isDirty: false,
        isPinned: true,
        isPreview: false,
        isDirtyOnDisk: false,
        saveError: null,
      };
      setOpenFiles((prev) => {
        const next = [...prev, newFile];
        setActiveIndex(next.length - 1);
        return next;
      });
    }
    window.addEventListener('agent-ide:new-file', onNewFile);
    return () => window.removeEventListener('agent-ide:new-file', onNewFile);
  }, [setOpenFiles, setActiveIndex]);
}

export function useSplitState(openFiles: OpenFile[], activeIndex: number) {
  const [split, setSplit] = useState<SplitState>(DEFAULT_SPLIT_STATE);

  const splitRight = useCallback(
    (filePath?: string) => {
      setSplit((prev) => ({
        isSplit: true,
        activeSplit: 'right',
        rightFilePath: filePath ?? openFiles[activeIndex]?.path ?? null,
        splitRatio: prev.isSplit ? prev.splitRatio : 0.5,
      }));
    },
    [openFiles, activeIndex],
  );

  const closeSplit = useCallback(() => {
    setSplit({ ...DEFAULT_SPLIT_STATE, activeSplit: 'left' });
  }, []);

  const setActiveSplit = useCallback((pane: 'left' | 'right') => {
    setSplit((prev) => (prev.activeSplit === pane ? prev : { ...prev, activeSplit: pane }));
  }, []);

  const setSplitRatio = useCallback((ratio: number) => {
    const clamped = Math.max(0.2, Math.min(0.8, ratio));
    setSplit((prev) => ({ ...prev, splitRatio: clamped }));
  }, []);

  useEffect(() => {
    if (!split.isSplit || !split.rightFilePath) return;
    const rightStillOpen = openFiles.some((f) => f.path === split.rightFilePath);
    if (!rightStillOpen) setSplit(DEFAULT_SPLIT_STATE);
  }, [openFiles, split.isSplit, split.rightFilePath]);

  const rightFile =
    split.isSplit && split.rightFilePath
      ? (openFiles.find((f) => f.path === split.rightFilePath) ?? null)
      : null;

  return { split, splitRight, closeSplit, setActiveSplit, setSplitRatio, rightFile };
}

export function useSplitEditorListener(
  splitRight: (filePath?: string) => void,
  closeSplit: () => void,
  isSplit: boolean,
): void {
  useEffect(() => {
    function onSplitEditor(event: Event): void {
      const detail = (event as CustomEvent<{ filePath?: string }>).detail;
      splitRight(detail?.filePath);
    }
    window.addEventListener('agent-ide:split-editor', onSplitEditor);
    return () => window.removeEventListener('agent-ide:split-editor', onSplitEditor);
  }, [splitRight]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === '|') {
        e.preventDefault();
        if (isSplit) closeSplit();
        else splitRight();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [splitRight, closeSplit, isSplit]);
}
