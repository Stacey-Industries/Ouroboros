import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { FileChangeEvent } from '../../types/electron';
import { SAVE_ALL_DIRTY_EVENT } from '../../hooks/appEventNames';
// Lazy import to avoid eagerly loading Monaco (~40MB) at startup
function disposeMonacoModel(filePath: string): void {
  try {
    const monaco = require('monaco-editor') as typeof import('monaco-editor');
    const uri = monaco.Uri.parse(`file:///${filePath.replace(/\\/g, '/').replace(/^\/+/, '')}`);
    const model = monaco.editor.getModel(uri);
    if (model) model.dispose();
  } catch {
    // Monaco not loaded yet — nothing to dispose
  }
}

interface FileReadResult { success: boolean; content?: string | null; error?: string; }
interface SaveFileResult { success: boolean; error?: string; }

type SetOpenFiles = Dispatch<SetStateAction<OpenFile[]>>;
type SetActiveIndex = Dispatch<SetStateAction<number>>;

export interface OpenFile {
  path: string;
  name: string;
  content: string | null;
  isLoading: boolean;
  error: string | null;
  isDirtyOnDisk: boolean;
  originalContent: string | null;
  diskContent: string | null;
  isImage?: boolean; isPdf?: boolean; isBinary?: boolean; binaryContent?: Uint8Array;
  isDirty: boolean;
  saveError: string | null;
  /** Preview tab: italic title, replaced by next preview open. Pinned on edit or double-click. */
  isPreview?: boolean;
  /** Pinned tab: shows pin icon, sorts left, cannot be closed via close button. */
  isPinned?: boolean;
}

export interface SplitState {
  /** Whether the editor is split into two panes */
  isSplit: boolean;
  /** Which split pane is currently active (receives new file opens) */
  activeSplit: 'left' | 'right';
  /** File path shown in the right split pane (null if not split or empty right pane) */
  rightFilePath: string | null;
  /** Width ratio of left pane (0.0-1.0). 0.5 = equal widths. */
  splitRatio: number;
}

export interface FileViewerState {
  openFiles: OpenFile[];
  activeIndex: number;
  activeFile: OpenFile | null;
  openFile: (filePath: string) => Promise<void>;
  /** Open a file in preview mode (italic title, replaces other preview tabs) */
  openFilePreview: (filePath: string) => Promise<void>;
  closeFile: (filePath: string) => void;
  /** Close all tabs except the given one */
  closeOthers: (filePath: string) => void;
  /** Close all tabs to the right of the given one */
  closeToRight: (filePath: string) => void;
  /** Close all tabs */
  closeAll: () => void;
  setActive: (filePath: string) => void;
  /** Pin a preview tab (make it permanent) or toggle pinned state */
  pinTab: (filePath: string) => void;
  /** Unpin a pinned tab */
  unpinTab: (filePath: string) => void;
  /** Toggle the isPinned flag on a tab */
  togglePin: (filePath: string) => void;
  saveFile: (filePath: string, content?: string) => Promise<SaveFileResult>;
  setDirty: (filePath: string, dirty: boolean) => void;
  reloadFile: (filePath: string) => Promise<FileReadResult>;
  updateDraft: (filePath: string, content: string) => void;
  discardDraft: (filePath: string) => void;
  /** Split editor state */
  split: SplitState;
  /** Open a right split pane (shows the current active file, or the specified file) */
  splitRight: (filePath?: string) => void;
  /** Close the right split pane */
  closeSplit: () => void;
  /** Set the active split pane */
  setActiveSplit: (pane: 'left' | 'right') => void;
  /** Set the split ratio (left pane width fraction) */
  setSplitRatio: (ratio: number) => void;
  /** Get the OpenFile for the right pane (or null) */
  rightFile: OpenFile | null;
}

export interface FileViewerManagerProps { projectRoot: string | null; children: ReactNode; }

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'avif']);
const PDF_EXTENSIONS = new Set(['pdf']);

function basename(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? filePath;
}

function looksLikeBinary(content: string): boolean {
  return content.slice(0, 8192).includes('\x00');
}

function isImageFile(filePath: string): boolean {
  const extension = filePath.toLowerCase().split('.').pop() ?? '';
  return IMAGE_EXTENSIONS.has(extension);
}

function isPdfFile(filePath: string): boolean {
  const extension = filePath.toLowerCase().split('.').pop() ?? '';
  return PDF_EXTENSIONS.has(extension);
}

function createLoadingFile(filePath: string, isPreview = false): OpenFile {
  return {
    path: filePath,
    name: basename(filePath),
    content: null,
    isLoading: true,
    error: null,
    isDirtyOnDisk: false,
    originalContent: null,
    diskContent: null,
    isDirty: false,
    saveError: null,
    isPreview,
  };
}

function updateOpenFile(files: OpenFile[], filePath: string, update: (file: OpenFile) => OpenFile): OpenFile[] {
  return files.map((file) => (file.path === filePath ? update(file) : file));
}

function toReadErrorFile(file: OpenFile, result: FileReadResult): OpenFile {
  return {
    ...file,
    isLoading: false,
    error: result.error ?? 'Failed to read file',
    content: null,
    isImage: false,
    isPdf: false,
    isBinary: false,
    saveError: null,
  };
}

function toImageViewerFile(file: OpenFile): OpenFile {
  return {
    ...file,
    isLoading: false,
    error: null,
    content: null,
    isImage: true,
    isPdf: false,
    isBinary: false,
    saveError: null,
  };
}

function toPdfFile(file: OpenFile): OpenFile {
  return {
    ...file,
    isLoading: false,
    error: null,
    content: null,
    isImage: false,
    isPdf: true,
    isBinary: false,
    saveError: null,
  };
}

function toBinaryFile(file: OpenFile, binaryContent?: Uint8Array): OpenFile {
  return {
    ...file,
    isLoading: false,
    error: null,
    content: null,
    isImage: false,
    isPdf: false,
    isBinary: true,
    binaryContent,
    saveError: null,
  };
}

function toTextFile(file: OpenFile, content: string): OpenFile {
  return {
    ...file,
    isLoading: false,
    error: null,
    content,
    isDirtyOnDisk: false,
    originalContent: content,
    diskContent: content,
    isImage: false,
    isPdf: false,
    isBinary: false,
    isDirty: false,
    saveError: null,
  };
}

function toLoadedFile(file: OpenFile, filePath: string, result: FileReadResult): OpenFile {
  if (!result.success) {
    return toReadErrorFile(file, result);
  }
  const content = result.content ?? '';
  if (isImageFile(filePath)) {
    return toImageViewerFile(file);
  }
  if (isPdfFile(filePath)) {
    return toPdfFile(file);
  }
  if (looksLikeBinary(content)) {
    return toBinaryFile(file);
  }
  return toTextFile(file, content);
}

function markDirtyOnDisk(file: OpenFile): OpenFile {
  return {
    ...file,
    isDirtyOnDisk: true,
  };
}

function applyDiskSnapshot(file: OpenFile, content: string): OpenFile {
  return {
    ...file,
    content,
    originalContent: content,
    diskContent: content,
    isDirty: false,
    isDirtyOnDisk: false,
    saveError: null,
    error: null,
  };
}

function applyDraftContent(file: OpenFile, content: string): OpenFile {
  const baseline = file.originalContent ?? '';
  return {
    ...file,
    content,
    isDirty: content !== baseline,
    saveError: null,
  };
}

function getNextActiveIndex(current: number, nextLength: number, removedIndex: number): number {
  if (nextLength === 0) {
    return 0;
  }
  if (current >= nextLength) {
    return nextLength - 1;
  }
  if (current > removedIndex) {
    return current - 1;
  }
  return current;
}

async function readFile(filePath: string): Promise<FileReadResult> {
  return window.electronAPI.files.readFile(filePath);
}

function primeOpenFile(filePath: string, setOpenFiles: SetOpenFiles, setActiveIndex: SetActiveIndex, isPreview = false): void {
  setOpenFiles((prev) => {
    const existingIndex = prev.findIndex((file) => file.path === filePath);
    if (existingIndex !== -1) {
      // Already open — just activate it (and pin if not preview)
      setActiveIndex(existingIndex);
      if (!isPreview && prev[existingIndex].isPreview) {
        // Pin the existing preview tab
        return prev.map((f, i) => i === existingIndex ? { ...f, isPreview: false } : f);
      }
      return prev;
    }

    // If opening as preview, replace any existing preview tab
    if (isPreview) {
      const previewIndex = prev.findIndex((file) => file.isPreview);
      if (previewIndex !== -1) {
        const next = [...prev];
        next[previewIndex] = createLoadingFile(filePath, true);
        setActiveIndex(previewIndex);
        return next;
      }
    }

    setActiveIndex(prev.length);
    return [...prev, createLoadingFile(filePath, isPreview)];
  });
}

async function readTextFile(filePath: string): Promise<FileReadResult> {
  const result = await readFile(filePath);
  if (!result.success) {
    return result;
  }
  const content = result.content ?? '';
  if (looksLikeBinary(content)) {
    return { success: false, error: 'Binary file - cannot display' };
  }
  return { success: true, content };
}

function commitOpenFileResult(filePath: string, result: FileReadResult, setOpenFiles: SetOpenFiles): void {
  setOpenFiles((prev) => updateOpenFile(prev, filePath, (file) => toLoadedFile(file, filePath, result)));
}

function markChangedFile(filePath: string, content: string, setOpenFiles: SetOpenFiles): void {
  setOpenFiles((prev) => updateOpenFile(prev, filePath, (file) => ({
    ...markDirtyOnDisk(file),
    diskContent: content,
  })));
}

function markDeletedFile(filePath: string, setOpenFiles: SetOpenFiles): void {
  setOpenFiles((prev) => updateOpenFile(prev, filePath, (file) => ({ ...file, isDirtyOnDisk: true })));
}

async function reloadFileContent(filePath: string, setOpenFiles: SetOpenFiles): Promise<FileReadResult> {
  const result = await readTextFile(filePath);
  if (!result.success) {
    return result;
  }
  const newContent = result.content ?? '';
  setOpenFiles((prev) => updateOpenFile(prev, filePath, (file) => applyDiskSnapshot(file, newContent)));
  return { success: true, content: newContent };
}

async function handleProjectFileChange(change: FileChangeEvent, setOpenFiles: SetOpenFiles): Promise<void> {
  if (change.type === 'change') {
    const result = await readTextFile(change.path);
    if (!result.success) {
      return;
    }
    markChangedFile(change.path, result.content ?? '', setOpenFiles);
    return;
  }
  if (change.type === 'unlink') {
    markDeletedFile(change.path, setOpenFiles);
  }
}

function useProjectChangeListener(projectRoot: string | null, setOpenFiles: SetOpenFiles): void {
  useEffect(() => {
    if (!projectRoot) {
      return;
    }
    const cleanup = window.electronAPI.files.onFileChange((change: FileChangeEvent) => {
      void handleProjectFileChange(change, setOpenFiles);
    });
    return cleanup;
  }, [projectRoot, setOpenFiles]);
}

function useReloadFileListener(setOpenFiles: SetOpenFiles): void {
  useEffect(() => {
    function onReloadFile(event: Event): void {
      const { filePath } = (event as CustomEvent<{ filePath: string }>).detail;
      if (!filePath) {
        return;
      }
      void reloadFileContent(filePath, setOpenFiles);
    }
    window.addEventListener('agent-ide:reload-file', onReloadFile);
    return () => window.removeEventListener('agent-ide:reload-file', onReloadFile);
  }, [setOpenFiles]);
}

function useOpenFileListener(openFile: (filePath: string) => Promise<void>): void {
  useEffect(() => {
    function onOpenFile(event: Event): void {
      const detail = (event as CustomEvent<{ filePath: string; line?: number; col?: number }>).detail;
      if (!detail.filePath) {
        return;
      }
      void openFile(detail.filePath).then(() => {
        if (detail.line == null || detail.line <= 0) {
          return;
        }
        requestAnimationFrame(() => {
          window.dispatchEvent(new CustomEvent('agent-ide:scroll-to-line', {
            detail: { filePath: detail.filePath, line: detail.line, col: detail.col },
          }));
        });
      });
    }
    window.addEventListener('agent-ide:open-file', onOpenFile);
    return () => window.removeEventListener('agent-ide:open-file', onOpenFile);
  }, [openFile]);
}

function useOpenFileActionInternal(setOpenFiles: SetOpenFiles, setActiveIndex: SetActiveIndex, isPreview: boolean) {
  return useCallback(async (filePath: string): Promise<void> => {
    primeOpenFile(filePath, setOpenFiles, setActiveIndex, isPreview);
    const result = await readFile(filePath);
    commitOpenFileResult(filePath, result, setOpenFiles);

    // If binary file detected (not image/pdf), load binary content for hex viewer
    if (result.success && !isImageFile(filePath) && !isPdfFile(filePath)) {
      const content = result.content ?? '';
      if (looksLikeBinary(content)) {
        try {
          const binResult = await window.electronAPI.files.readBinaryFile(filePath);
          if (binResult.success && binResult.data) {
            const binaryContent = new Uint8Array(binResult.data);
            setOpenFiles((prev) => updateOpenFile(prev, filePath, (file) => ({
              ...file,
              binaryContent,
            })));
          }
        } catch {
          // Binary content loading failed, hex viewer will show empty
        }
      }
    }
  }, [setActiveIndex, setOpenFiles, isPreview]);
}

function useOpenFileAction(setOpenFiles: SetOpenFiles, setActiveIndex: SetActiveIndex) {
  return useOpenFileActionInternal(setOpenFiles, setActiveIndex, false);
}

function useOpenFilePreviewAction(setOpenFiles: SetOpenFiles, setActiveIndex: SetActiveIndex) {
  return useOpenFileActionInternal(setOpenFiles, setActiveIndex, true);
}

function useCloseFileAction(setOpenFiles: SetOpenFiles, setActiveIndex: SetActiveIndex) {
  return useCallback((filePath: string) => {
    disposeMonacoModel(filePath);
    setOpenFiles((prev) => {
      const removedIndex = prev.findIndex((file) => file.path === filePath);
      if (removedIndex === -1) {
        return prev;
      }
      const next = prev.filter((file) => file.path !== filePath);
      setActiveIndex((current) => getNextActiveIndex(current, next.length, removedIndex));
      return next;
    });
  }, [setActiveIndex, setOpenFiles]);
}

function useCloseOthersAction(setOpenFiles: SetOpenFiles, setActiveIndex: SetActiveIndex) {
  return useCallback((filePath: string) => {
    setOpenFiles((prev) => {
      for (const file of prev) {
        if (file.path !== filePath) {
          disposeMonacoModel(file.path);
        }
      }
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
      for (let i = idx + 1; i < prev.length; i++) {
        disposeMonacoModel(prev[i].path);
      }
      const kept = prev.slice(0, idx + 1);
      setActiveIndex((current) => Math.min(current, kept.length - 1));
      return kept;
    });
  }, [setActiveIndex, setOpenFiles]);
}

function useCloseAllAction(setOpenFiles: SetOpenFiles, setActiveIndex: SetActiveIndex) {
  return useCallback(() => {
    setOpenFiles((prev) => {
      for (const file of prev) {
        disposeMonacoModel(file.path);
      }
      return [];
    });
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
    setOpenFiles((prev) => updateOpenFile(prev, filePath, (file) => (
      file.isPinned ? { ...file, isPinned: false } : file
    )));
  }, [setOpenFiles]);
}

function useTogglePinAction(setOpenFiles: SetOpenFiles) {
  return useCallback((filePath: string) => {
    setOpenFiles((prev) => updateOpenFile(prev, filePath, (file) => ({
      ...file,
      isPinned: !file.isPinned,
      isPreview: false, // pinning always makes it permanent
    })));
  }, [setOpenFiles]);
}

function useSetActiveAction(setOpenFiles: SetOpenFiles, setActiveIndex: SetActiveIndex) {
  return useCallback((filePath: string) => {
    setOpenFiles((prev) => {
      const index = prev.findIndex((file) => file.path === filePath);
      if (index !== -1) {
        setActiveIndex(index);
      }
      return prev;
    });
  }, [setActiveIndex, setOpenFiles]);
}

function useSaveFileAction(setOpenFiles: SetOpenFiles) {
  return useCallback(async (filePath: string, content?: string): Promise<SaveFileResult> => {
    const targetFile = await new Promise<OpenFile | null>((resolve) => {
      setOpenFiles((prev) => {
        resolve(prev.find((file) => file.path === filePath) ?? null);
        return prev;
      });
    });
    const contentToSave = content ?? targetFile?.content ?? null;
    if (!targetFile || contentToSave == null) {
      return { success: false, error: 'No file content available to save' };
    }
    const result = await window.electronAPI.files.saveFile(filePath, contentToSave);
    if (!result.success) {
      console.error('[FileViewerManager] saveFile failed:', result.error);
      setOpenFiles((prev) => updateOpenFile(prev, filePath, (file) => ({
        ...applyDraftContent(file, contentToSave),
        saveError: result.error ?? 'Failed to save file',
      })));
      return { success: false, error: result.error ?? 'Failed to save file' };
    }
    setOpenFiles((prev) => updateOpenFile(prev, filePath, (file) => ({
      ...file,
      content: contentToSave,
      isDirty: false,
      isDirtyOnDisk: false,
      originalContent: contentToSave,
      diskContent: contentToSave,
      saveError: null,
    })));
    return { success: true };
  }, [setOpenFiles]);
}

function useSetDirtyAction(setOpenFiles: SetOpenFiles) {
  return useCallback((filePath: string, dirty: boolean) => {
    setOpenFiles((prev) => updateOpenFile(prev, filePath, (file) => {
      const changes: Partial<OpenFile> = {};
      if (file.isDirty !== dirty) changes.isDirty = dirty;
      // Editing pins a preview tab
      if (dirty && file.isPreview) changes.isPreview = false;
      if (Object.keys(changes).length === 0) return file;
      return { ...file, ...changes };
    }));
  }, [setOpenFiles]);
}

function useReloadFileAction(setOpenFiles: SetOpenFiles) {
  return useCallback(async (filePath: string): Promise<FileReadResult> => {
    return reloadFileContent(filePath, setOpenFiles);
  }, [setOpenFiles]);
}

function useUpdateDraftAction(setOpenFiles: SetOpenFiles) {
  return useCallback((filePath: string, content: string) => {
    setOpenFiles((prev) => updateOpenFile(prev, filePath, (file) => (
      file.content === content ? file : applyDraftContent(file, content)
    )));
  }, [setOpenFiles]);
}

function useDiscardDraftAction(setOpenFiles: SetOpenFiles) {
  return useCallback((filePath: string) => {
    setOpenFiles((prev) => updateOpenFile(prev, filePath, (file) => {
      const restoredContent = file.originalContent ?? file.content ?? '';
      return {
        ...file,
        content: restoredContent,
        isDirty: false,
        saveError: null,
      };
    }));
  }, [setOpenFiles]);
}

/**
 * Listen for the `agent-ide:save-all-dirty` DOM event and save every dirty
 * open buffer.  The event detail carries an `addPromise` callback so the
 * dispatcher can await all saves before proceeding.
 */
function useSaveAllDirtyListener(
  openFilesRef: React.RefObject<OpenFile[]>,
  saveFile: (filePath: string, content?: string) => Promise<SaveFileResult>,
): void {
  useEffect(() => {
    function onSaveAllDirty(event: Event): void {
      const detail = (event as CustomEvent<{ addPromise?: (p: Promise<void>) => void }>).detail;
      const files = openFilesRef.current ?? [];
      const dirtyFiles = files.filter((f) => f.isDirty && f.content != null);
      if (dirtyFiles.length === 0) return;

      const savePromise = Promise.all(
        dirtyFiles.map((f) => saveFile(f.path, f.content!).catch((error) => { console.error('[fileViewer] Failed to save dirty file:', f.path, error) })),
      ).then(() => {});

      if (typeof detail?.addPromise === 'function') {
        detail.addPromise(savePromise);
      }
    }

    window.addEventListener(SAVE_ALL_DIRTY_EVENT, onSaveAllDirty);
    return () => window.removeEventListener(SAVE_ALL_DIRTY_EVENT, onSaveAllDirty);
  }, [openFilesRef, saveFile]);
}

const DEFAULT_SPLIT_STATE: SplitState = {
  isSplit: false,
  activeSplit: 'left',
  rightFilePath: null,
  splitRatio: 0.5,
};

function useSplitState(openFiles: OpenFile[], activeIndex: number) {
  const [split, setSplit] = useState<SplitState>(DEFAULT_SPLIT_STATE);

  const splitRight = useCallback((filePath?: string) => {
    setSplit((prev) => {
      // If already split, just update the right file
      const targetPath = filePath ?? openFiles[activeIndex]?.path ?? null;
      return {
        isSplit: true,
        activeSplit: 'right',
        rightFilePath: targetPath,
        splitRatio: prev.isSplit ? prev.splitRatio : 0.5,
      };
    });
  }, [openFiles, activeIndex]);

  const closeSplit = useCallback(() => {
    setSplit({
      ...DEFAULT_SPLIT_STATE,
      activeSplit: 'left',
    });
  }, []);

  const setActiveSplit = useCallback((pane: 'left' | 'right') => {
    setSplit((prev) => (prev.activeSplit === pane ? prev : { ...prev, activeSplit: pane }));
  }, []);

  const setSplitRatio = useCallback((ratio: number) => {
    const clamped = Math.max(0.2, Math.min(0.8, ratio));
    setSplit((prev) => ({ ...prev, splitRatio: clamped }));
  }, []);

  // If the right file gets closed from the tab bar, close the split
  useEffect(() => {
    if (!split.isSplit || !split.rightFilePath) return;
    const rightStillOpen = openFiles.some((f) => f.path === split.rightFilePath);
    if (!rightStillOpen) {
      setSplit(DEFAULT_SPLIT_STATE);
    }
  }, [openFiles, split.isSplit, split.rightFilePath]);

  const rightFile = split.isSplit && split.rightFilePath
    ? openFiles.find((f) => f.path === split.rightFilePath) ?? null
    : null;

  return { split, splitRight, closeSplit, setActiveSplit, setSplitRatio, rightFile };
}

function useSplitEditorListener(
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

  // Keyboard shortcut: Ctrl+Shift+\ toggles split
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === '|') {
        // Shift+\ produces '|' on most keyboards
        e.preventDefault();
        if (isSplit) {
          closeSplit();
        } else {
          splitRight();
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [splitRight, closeSplit, isSplit]);
}

export function useFileViewerManagerState(projectRoot: string | null): FileViewerState {
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const openFilesRef = useRef(openFiles);
  openFilesRef.current = openFiles;
  useProjectChangeListener(projectRoot, setOpenFiles);
  const openFile = useOpenFileAction(setOpenFiles, setActiveIndex);
  const openFilePreview = useOpenFilePreviewAction(setOpenFiles, setActiveIndex);
  useReloadFileListener(setOpenFiles);
  useOpenFileListener(openFile);
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

  const { split, splitRight, closeSplit, setActiveSplit, setSplitRatio, rightFile } =
    useSplitState(openFiles, activeIndex);
  useSplitEditorListener(splitRight, closeSplit, split.isSplit);

  return {
    openFiles,
    activeIndex,
    activeFile: openFiles[activeIndex] ?? null,
    openFile,
    openFilePreview,
    closeFile,
    closeOthers,
    closeToRight,
    closeAll,
    setActive,
    pinTab,
    unpinTab,
    togglePin,
    saveFile,
    setDirty,
    reloadFile,
    updateDraft,
    discardDraft,
    split,
    splitRight,
    closeSplit,
    setActiveSplit,
    setSplitRatio,
    rightFile,
  };
}
