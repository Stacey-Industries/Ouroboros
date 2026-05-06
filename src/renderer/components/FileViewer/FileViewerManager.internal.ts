import log from 'electron-log/renderer';
import { useCallback } from 'react';

import {
  applyDraftContent,
  commitOpenFileResult,
  disposeMonacoModel,
  type FileReadResult,
  getNextActiveIndex,
  isAudioFile,
  isImageFile,
  isPdfFile,
  isVideoFile,
  looksLikeBinary,
  type OpenFile,
  primeOpenFile,
  readFile,
  type SaveFileResult,
  type SetActiveIndex,
  type SetOpenFiles,
  type SplitState,
  updateOpenFile,
} from './FileViewerManager.helpers';

// Re-export types for consumers
export type { FileReadResult, OpenFile, SaveFileResult, SetActiveIndex, SetOpenFiles, SplitState };
export { DEFAULT_SPLIT_STATE, reloadFileContent } from './FileViewerManager.helpers';
export type { FileViewerManagerProps, FileViewerState } from './FileViewerManager.state';
export { handleProjectFileChange } from './FileViewerManager.state';

function isNonBinaryFileType(filePath: string): boolean {
  return (
    isImageFile(filePath) || isPdfFile(filePath) || isAudioFile(filePath) || isVideoFile(filePath)
  );
}

async function loadBinaryContent(filePath: string, setOpenFiles: SetOpenFiles): Promise<void> {
  try {
    const binResult = await window.electronAPI.files.readBinaryFile(filePath);
    if (!binResult.success || !binResult.data) return;
    const binaryContent = new Uint8Array(binResult.data);
    setOpenFiles((prev) => updateOpenFile(prev, filePath, (file) => ({ ...file, binaryContent })));
  } catch {
    /* Binary content loading failed */
  }
}

export function useOpenFileActionInternal(
  setOpenFiles: SetOpenFiles,
  setActiveIndex: SetActiveIndex,
  isPreview: boolean,
) {
  return useCallback(
    async (filePath: string): Promise<void> => {
      primeOpenFile(filePath, setOpenFiles, setActiveIndex, isPreview);
      const result = await readFile(filePath);
      commitOpenFileResult(filePath, result, setOpenFiles);
      if (!result.success || isNonBinaryFileType(filePath)) return;
      if (!looksLikeBinary(result.content ?? '')) return;
      await loadBinaryContent(filePath, setOpenFiles);
    },
    [setActiveIndex, setOpenFiles, isPreview],
  );
}

export function useCloseFileAction(setOpenFiles: SetOpenFiles, setActiveIndex: SetActiveIndex) {
  return useCallback(
    (filePath: string) => {
      log.info('[trace:FileViewer] closeFile called', {
        filePath,
        stack: new Error().stack?.split('\n').slice(1, 8).join(' | '),
      });
      disposeMonacoModel(filePath);
      setOpenFiles((prev) => {
        const removedIndex = prev.findIndex((file) => file.path === filePath);
        if (removedIndex === -1) return prev;
        const next = prev.filter((file) => file.path !== filePath);
        setActiveIndex((current) => getNextActiveIndex(current, next.length, removedIndex));
        return next;
      });
    },
    [setActiveIndex, setOpenFiles],
  );
}

export function useCloseOthersAction(setOpenFiles: SetOpenFiles, setActiveIndex: SetActiveIndex) {
  return useCallback(
    (filePath: string) => {
      setOpenFiles((prev) => {
        for (const file of prev) {
          if (file.path !== filePath) disposeMonacoModel(file.path);
        }
        const kept = prev.filter((file) => file.path === filePath);
        if (kept.length === 0) return prev;
        setActiveIndex(0);
        return kept;
      });
    },
    [setActiveIndex, setOpenFiles],
  );
}

export function useCloseToRightAction(setOpenFiles: SetOpenFiles, setActiveIndex: SetActiveIndex) {
  return useCallback(
    (filePath: string) => {
      setOpenFiles((prev) => {
        const idx = prev.findIndex((file) => file.path === filePath);
        if (idx === -1) return prev;
        for (let i = idx + 1; i < prev.length; i++) disposeMonacoModel(prev[i].path);
        const kept = prev.slice(0, idx + 1);
        setActiveIndex((current) => Math.min(current, kept.length - 1));
        return kept;
      });
    },
    [setActiveIndex, setOpenFiles],
  );
}

export function useCloseAllAction(setOpenFiles: SetOpenFiles, setActiveIndex: SetActiveIndex) {
  return useCallback(() => {
    setOpenFiles((prev) => {
      for (const file of prev) disposeMonacoModel(file.path);
      return [];
    });
    setActiveIndex(0);
  }, [setActiveIndex, setOpenFiles]);
}

export function usePinTabAction(setOpenFiles: SetOpenFiles) {
  return useCallback(
    (filePath: string) => {
      setOpenFiles((prev) =>
        updateOpenFile(prev, filePath, (file) => {
          const changes: Partial<OpenFile> = {};
          if (file.isPreview) changes.isPreview = false;
          if (!file.isPinned) changes.isPinned = true;
          if (Object.keys(changes).length === 0) return file;
          return { ...file, ...changes };
        }),
      );
    },
    [setOpenFiles],
  );
}

export function useUnpinTabAction(setOpenFiles: SetOpenFiles) {
  return useCallback(
    (filePath: string) => {
      setOpenFiles((prev) =>
        updateOpenFile(prev, filePath, (file) =>
          file.isPinned ? { ...file, isPinned: false } : file,
        ),
      );
    },
    [setOpenFiles],
  );
}

export function useTogglePinAction(setOpenFiles: SetOpenFiles) {
  return useCallback(
    (filePath: string) => {
      setOpenFiles((prev) =>
        updateOpenFile(prev, filePath, (file) => ({
          ...file,
          isPinned: !file.isPinned,
          isPreview: false,
        })),
      );
    },
    [setOpenFiles],
  );
}

export function useSetActiveAction(setOpenFiles: SetOpenFiles, setActiveIndex: SetActiveIndex) {
  return useCallback(
    (filePath: string) => {
      setOpenFiles((prev) => {
        const index = prev.findIndex((file) => file.path === filePath);
        if (index !== -1) setActiveIndex(index);
        return prev;
      });
    },
    [setActiveIndex, setOpenFiles],
  );
}

export function useSaveFileAction(setOpenFiles: SetOpenFiles) {
  return useCallback(
    async (filePath: string, content?: string): Promise<SaveFileResult> => {
      const targetFile = await new Promise<OpenFile | null>((resolve) => {
        setOpenFiles((prev) => {
          resolve(prev.find((file) => file.path === filePath) ?? null);
          return prev;
        });
      });
      const contentToSave = content ?? targetFile?.content ?? null;
      if (!targetFile || contentToSave == null)
        return { success: false, error: 'No file content available to save' };
      const result = await window.electronAPI.files.saveFile(filePath, contentToSave);
      if (!result.success) {
        setOpenFiles((prev) =>
          updateOpenFile(prev, filePath, (file) => ({
            ...applyDraftContent(file, contentToSave),
            saveError: result.error ?? 'Failed to save file',
          })),
        );
        return { success: false, error: result.error ?? 'Failed to save file' };
      }
      setOpenFiles((prev) =>
        updateOpenFile(prev, filePath, (file) => ({
          ...file,
          content: contentToSave,
          isDirty: false,
          isDirtyOnDisk: false,
          originalContent: contentToSave,
          diskContent: contentToSave,
          saveError: null,
        })),
      );
      return { success: true };
    },
    [setOpenFiles],
  );
}

function useSetDirtyAction(setOpenFiles: SetOpenFiles) {
  return useCallback(
    (filePath: string, dirty: boolean) => {
      setOpenFiles((prev) =>
        updateOpenFile(prev, filePath, (file) => {
          const changes: Partial<OpenFile> = {};
          if (file.isDirty !== dirty) changes.isDirty = dirty;
          if (dirty && file.isPreview) changes.isPreview = false;
          if (Object.keys(changes).length === 0) return file;
          return { ...file, ...changes };
        }),
      );
    },
    [setOpenFiles],
  );
}

function useReloadFileAction(setOpenFiles: SetOpenFiles) {
  return useCallback(
    async (filePath: string) => {
      const { reloadFileContent: reload } = await import('./FileViewerManager.helpers');
      return reload(filePath, setOpenFiles);
    },
    [setOpenFiles],
  );
}

function useUpdateDraftAction(setOpenFiles: SetOpenFiles) {
  return useCallback(
    (filePath: string, content: string) => {
      setOpenFiles((prev) =>
        updateOpenFile(prev, filePath, (file) =>
          file.content === content ? file : applyDraftContent(file, content),
        ),
      );
    },
    [setOpenFiles],
  );
}

function useDiscardDraftAction(setOpenFiles: SetOpenFiles) {
  return useCallback(
    (filePath: string) => {
      setOpenFiles((prev) =>
        updateOpenFile(prev, filePath, (file) => {
          const restoredContent = file.originalContent ?? file.content ?? '';
          return { ...file, content: restoredContent, isDirty: false, saveError: null };
        }),
      );
    },
    [setOpenFiles],
  );
}

export function useTabActions(setOpenFiles: SetOpenFiles, setActiveIndex: SetActiveIndex) {
  return {
    closeFile: useCloseFileAction(setOpenFiles, setActiveIndex),
    closeOthers: useCloseOthersAction(setOpenFiles, setActiveIndex),
    closeToRight: useCloseToRightAction(setOpenFiles, setActiveIndex),
    closeAll: useCloseAllAction(setOpenFiles, setActiveIndex),
    setActive: useSetActiveAction(setOpenFiles, setActiveIndex),
    pinTab: usePinTabAction(setOpenFiles),
    unpinTab: useUnpinTabAction(setOpenFiles),
    togglePin: useTogglePinAction(setOpenFiles),
    setDirty: useSetDirtyAction(setOpenFiles),
    saveFile: useSaveFileAction(setOpenFiles),
    reloadFile: useReloadFileAction(setOpenFiles),
    updateDraft: useUpdateDraftAction(setOpenFiles),
    discardDraft: useDiscardDraftAction(setOpenFiles),
  };
}

export { useFileViewerManagerState } from './FileViewerManager.state';
