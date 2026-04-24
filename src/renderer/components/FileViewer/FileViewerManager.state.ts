/**
 * FileViewerManager.state.ts — top-level state hook for FileViewerManager.
 * Split from FileViewerManager.internal.ts to satisfy the max-lines limit.
 */

import type { ReactNode } from 'react';
import { useRef, useState } from 'react';

import type { FileChangeEvent } from '../../types/electron';
import type {
  FileReadResult,
  OpenFile,
  SaveFileResult,
  SetOpenFiles,
  SplitState,
} from './FileViewerManager.helpers';
import { markChangedFile, markDeletedFile, readTextFile } from './FileViewerManager.helpers';
import { useOpenFileActionInternal, useTabActions } from './FileViewerManager.internal';
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
import { useNavigationHistory } from './useNavigationHistory';

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
  goBack: () => void;
  goForward: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
}

export interface FileViewerManagerProps {
  projectRoot: string | null;
  children: ReactNode;
}

export async function handleProjectFileChange(
  change: FileChangeEvent,
  setOpenFiles: SetOpenFiles,
): Promise<void> {
  if (change.type === 'change') {
    const result = await readTextFile(change.path);
    if (!result.success) return;
    markChangedFile(change.path, result.content ?? '', setOpenFiles);
    return;
  }
  if (change.type === 'unlink') markDeletedFile(change.path, setOpenFiles);
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

  const actions = useTabActions(setOpenFiles, setActiveIndex);
  useSaveAllDirtyListener(openFilesRef, actions.saveFile);
  useSaveActiveFileListener(openFilesRef, activeIndexRef, actions.saveFile);
  useCloseActiveTabListener(openFilesRef, activeIndexRef, actions.closeFile);

  const { split, splitRight, closeSplit, setActiveSplit, setSplitRatio, rightFile } = useSplitState(
    openFiles,
    activeIndex,
  );
  useSplitEditorListener(splitRight, closeSplit, split.isSplit);

  const activePath = openFiles[activeIndex]?.path ?? null;
  const nav = useNavigationHistory(activePath, actions.setActive);

  return {
    openFiles,
    activeIndex,
    activeFile: openFiles[activeIndex] ?? null,
    openFile,
    openFilePreview,
    ...actions,
    split,
    splitRight,
    closeSplit,
    setActiveSplit,
    setSplitRatio,
    rightFile,
    ...nav,
  };
}
