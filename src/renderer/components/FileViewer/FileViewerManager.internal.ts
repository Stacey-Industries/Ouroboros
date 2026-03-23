import type { ReactNode } from 'react';
import { useCallback, useRef, useState } from 'react';

import {
  applyDraftContent,
  commitOpenFileResult,
  disposeMonacoModel,
  type FileReadResult,
  getNextActiveIndex,
  isImageFile,
  isPdfFile,
  looksLikeBinary,
  markChangedFile,
  markDeletedFile,
  type OpenFile,
  primeOpenFile,
  readFile,
  readTextFile,
  reloadFileContent,
  type SaveFileResult,
  type SetActiveIndex,
  type SetOpenFiles,
  type SplitState,
  updateOpenFile,
} from './FileViewerManager.helpers';
import {
  useCloseActiveTabListener,
  useNewFileListener,
  useOpenFileListener,
  useProjectChangeListener,
  useReloadFileListener,
  useSaveActiveFileListener,
  useSaveAllDirtyListener,
  useSplitEditorListener,
  useSplitState,
} from './FileViewerManager.listeners';

// Re-export types for consumers
export type { FileReadResult, OpenFile, SaveFileResult, SetActiveIndex, SetOpenFiles, SplitState };
export { DEFAULT_SPLIT_STATE, reloadFileContent } from './FileViewerManager.helpers';

import type { FileChangeEvent } from '../../types/electron';

export interface FileViewerState {
  openFiles: OpenFile[];
  activeIndex: number;
  activeFile: OpenFile | null;
  openFile: (filePath: string) => Promise<void>;
  openFilePreview: (filePath: string) => Promise<void>;
  closeFile: (filePath: string) => void;
  closeOthers: (filePath: string) => void;
  closeToRight: (filePath: string) => void;
  closeAll: () => void;
  setActive: (filePath: string) => void;
  pinTab: (filePath: string) => void;
  unpinTab: (filePath: string) => void;
  togglePin: (filePath: string) => void;
  saveFile: (filePath: string, content?: string) => Promise<SaveFileResult>;
  setDirty: (filePath: string, dirty: boolean) => void;
  reloadFile: (filePath: string) => Promise<FileReadResult>;
  updateDraft: (filePath: string, content: string) => void;
  discardDraft: (filePath: string) => void;
  split: SplitState;
  splitRight: (filePath?: string) => void;
  closeSplit: () => void;
  setActiveSplit: (pane: 'left' | 'right') => void;
  setSplitRatio: (ratio: number) => void;
  rightFile: OpenFile | null;
}

export interface FileViewerManagerProps { projectRoot: string | null; children: ReactNode; }

export async function handleProjectFileChange(change: FileChangeEvent, setOpenFiles: SetOpenFiles): Promise<void> {
  if (change.type === 'change') {
    const result = await readTextFile(change.path);
    if (!result.success) return;
    markChangedFile(change.path, result.content ?? '', setOpenFiles);
    return;
  }
  if (change.type === 'unlink') markDeletedFile(change.path, setOpenFiles);
}

function useOpenFileActionInternal(setOpenFiles: SetOpenFiles, setActiveIndex: SetActiveIndex, isPreview: boolean) {
  return useCallback(async (filePath: string): Promise<void> => {
    primeOpenFile(filePath, setOpenFiles, setActiveIndex, isPreview);
    const result = await readFile(filePath);
    commitOpenFileResult(filePath, result, setOpenFiles);
    if (!result.success || isImageFile(filePath) || isPdfFile(filePath)) return;
    if (!looksLikeBinary(result.content ?? '')) return;
    try {
      const binResult = await window.electronAPI.files.readBinaryFile(filePath);
      if (!binResult.success || !binResult.data) return;
      const binaryContent = new Uint8Array(binResult.data);
      setOpenFiles((prev) => updateOpenFile(prev, filePath, (file) => ({ ...file, binaryContent })));
    } catch { /* Binary content loading failed */ }
  }, [setActiveIndex, setOpenFiles, isPreview]);
}

function useCloseFileAction(setOpenFiles: SetOpenFiles, setActiveIndex: SetActiveIndex) {
  return useCallback((filePath: string) => {
    disposeMonacoModel(filePath);
    setOpenFiles((prev) => {
      const removedIndex = prev.findIndex((file) => file.path === filePath);
      if (removedIndex === -1) return prev;
      const next = prev.filter((file) => file.path !== filePath);
      setActiveIndex((current) => getNextActiveIndex(current, next.length, removedIndex));
      return next;
    });
  }, [setActiveIndex, setOpenFiles]);
}

function useCloseOthersAction(setOpenFiles: SetOpenFiles, setActiveIndex: SetActiveIndex) {
  return useCallback((filePath: string) => {
    setOpenFiles((prev) => {
      for (const file of prev) { if (file.path !== filePath) disposeMonacoModel(file.path); }
      const kept = prev.filter((file) => file.path === filePath);
      if (kept.length === 0) return prev;
      setActiveIndex(0);
      return kept;
    });
  }, [setActiveIndex, setOpenFiles]);
}

function useCloseToRightAction(setOpenFiles: SetOpenFiles, setActiveIndex: SetActiveIndex) {
  return useCallback((filePath: string) => {
    setOpenFiles((prev) => {
      const idx = prev.findIndex((file) => file.path === filePath);
      if (idx === -1) return prev;
      for (let i = idx + 1; i < prev.length; i++) disposeMonacoModel(prev[i].path);
      const kept = prev.slice(0, idx + 1);
      setActiveIndex((current) => Math.min(current, kept.length - 1));
      return kept;
    });
  }, [setActiveIndex, setOpenFiles]);
}

function useCloseAllAction(setOpenFiles: SetOpenFiles, setActiveIndex: SetActiveIndex) {
  return useCallback(() => {
    setOpenFiles((prev) => { for (const file of prev) disposeMonacoModel(file.path); return []; });
    setActiveIndex(0);
  }, [setActiveIndex, setOpenFiles]);
}

function usePinTabAction(setOpenFiles: SetOpenFiles) {
  return useCallback((filePath: string) => {
    setOpenFiles((prev) => updateOpenFile(prev, filePath, (file) => {
      const changes: Partial<OpenFile> = {};
      if (file.isPreview) changes.isPreview = false;
      if (!file.isPinned) changes.isPinned = true;
      if (Object.keys(changes).length === 0) return file;
      return { ...file, ...changes };
    }));
  }, [setOpenFiles]);
}

function useUnpinTabAction(setOpenFiles: SetOpenFiles) {
  return useCallback((filePath: string) => {
    setOpenFiles((prev) => updateOpenFile(prev, filePath, (file) => (file.isPinned ? { ...file, isPinned: false } : file)));
  }, [setOpenFiles]);
}

function useTogglePinAction(setOpenFiles: SetOpenFiles) {
  return useCallback((filePath: string) => {
    setOpenFiles((prev) => updateOpenFile(prev, filePath, (file) => ({ ...file, isPinned: !file.isPinned, isPreview: false })));
  }, [setOpenFiles]);
}

function useSetActiveAction(setOpenFiles: SetOpenFiles, setActiveIndex: SetActiveIndex) {
  return useCallback((filePath: string) => {
    setOpenFiles((prev) => { const index = prev.findIndex((file) => file.path === filePath); if (index !== -1) setActiveIndex(index); return prev; });
  }, [setActiveIndex, setOpenFiles]);
}

function useSaveFileAction(setOpenFiles: SetOpenFiles) {
  return useCallback(async (filePath: string, content?: string): Promise<SaveFileResult> => {
    const targetFile = await new Promise<OpenFile | null>((resolve) => {
      setOpenFiles((prev) => { resolve(prev.find((file) => file.path === filePath) ?? null); return prev; });
    });
    const contentToSave = content ?? targetFile?.content ?? null;
    if (!targetFile || contentToSave == null) return { success: false, error: 'No file content available to save' };
    const result = await window.electronAPI.files.saveFile(filePath, contentToSave);
    if (!result.success) {
      setOpenFiles((prev) => updateOpenFile(prev, filePath, (file) => ({ ...applyDraftContent(file, contentToSave), saveError: result.error ?? 'Failed to save file' })));
      return { success: false, error: result.error ?? 'Failed to save file' };
    }
    setOpenFiles((prev) => updateOpenFile(prev, filePath, (file) => ({ ...file, content: contentToSave, isDirty: false, isDirtyOnDisk: false, originalContent: contentToSave, diskContent: contentToSave, saveError: null })));
    return { success: true };
  }, [setOpenFiles]);
}

function useSetDirtyAction(setOpenFiles: SetOpenFiles) {
  return useCallback((filePath: string, dirty: boolean) => {
    setOpenFiles((prev) => updateOpenFile(prev, filePath, (file) => {
      const changes: Partial<OpenFile> = {};
      if (file.isDirty !== dirty) changes.isDirty = dirty;
      if (dirty && file.isPreview) changes.isPreview = false;
      if (Object.keys(changes).length === 0) return file;
      return { ...file, ...changes };
    }));
  }, [setOpenFiles]);
}

function useReloadFileAction(setOpenFiles: SetOpenFiles) {
  return useCallback(async (filePath: string): Promise<FileReadResult> => reloadFileContent(filePath, setOpenFiles), [setOpenFiles]);
}

function useUpdateDraftAction(setOpenFiles: SetOpenFiles) {
  return useCallback((filePath: string, content: string) => {
    setOpenFiles((prev) => updateOpenFile(prev, filePath, (file) => (file.content === content ? file : applyDraftContent(file, content))));
  }, [setOpenFiles]);
}

function useDiscardDraftAction(setOpenFiles: SetOpenFiles) {
  return useCallback((filePath: string) => {
    setOpenFiles((prev) => updateOpenFile(prev, filePath, (file) => {
      const restoredContent = file.originalContent ?? file.content ?? '';
      return { ...file, content: restoredContent, isDirty: false, saveError: null };
    }));
  }, [setOpenFiles]);
}

export function useFileViewerManagerState(projectRoot: string | null): FileViewerState {
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const openFilesRef = useRef(openFiles);
  openFilesRef.current = openFiles;
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;

  useProjectChangeListener(projectRoot, setOpenFiles);
  const openFile = useOpenFileActionInternal(setOpenFiles, setActiveIndex, false);
  const openFilePreview = useOpenFileActionInternal(setOpenFiles, setActiveIndex, true);
  useReloadFileListener(setOpenFiles);
  useOpenFileListener(openFile);
  useNewFileListener(setOpenFiles, setActiveIndex);

  const closeFile = useCloseFileAction(setOpenFiles, setActiveIndex);
  const closeOthers = useCloseOthersAction(setOpenFiles, setActiveIndex);
  const closeToRight = useCloseToRightAction(setOpenFiles, setActiveIndex);
  const closeAll = useCloseAllAction(setOpenFiles, setActiveIndex);
  const setActive = useSetActiveAction(setOpenFiles, setActiveIndex);
  const pinTab = usePinTabAction(setOpenFiles);
  const unpinTab = useUnpinTabAction(setOpenFiles);
  const togglePin = useTogglePinAction(setOpenFiles);
  const setDirty = useSetDirtyAction(setOpenFiles);
  const saveFile = useSaveFileAction(setOpenFiles);
  const reloadFile = useReloadFileAction(setOpenFiles);
  const updateDraft = useUpdateDraftAction(setOpenFiles);
  const discardDraft = useDiscardDraftAction(setOpenFiles);

  useSaveAllDirtyListener(openFilesRef, saveFile);
  useSaveActiveFileListener(openFilesRef, activeIndexRef, saveFile);
  useCloseActiveTabListener(openFilesRef, activeIndexRef, closeFile);

  const { split, splitRight, closeSplit, setActiveSplit, setSplitRatio, rightFile } = useSplitState(openFiles, activeIndex);
  useSplitEditorListener(splitRight, closeSplit, split.isSplit);

  return {
    openFiles, activeIndex, activeFile: openFiles[activeIndex] ?? null,
    openFile, openFilePreview, closeFile, closeOthers, closeToRight, closeAll,
    setActive, pinTab, unpinTab, togglePin, saveFile, setDirty, reloadFile,
    updateDraft, discardDraft, split, splitRight, closeSplit, setActiveSplit,
    setSplitRatio, rightFile,
  };
}
