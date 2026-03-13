import { useCallback, useEffect, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { FileChangeEvent } from '../../types/electron';

interface FileReadResult { success: boolean; content?: string | null; error?: string; }

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
  isImage?: boolean; isDirty?: boolean;
}

export interface FileViewerState {
  openFiles: OpenFile[];
  activeIndex: number;
  activeFile: OpenFile | null;
  openFile: (filePath: string) => Promise<void>;
  closeFile: (filePath: string) => void;
  setActive: (filePath: string) => void;
  saveFile: (filePath: string, content: string) => Promise<void>;
  setDirty: (filePath: string, dirty: boolean) => void;
}

export interface FileViewerManagerProps { projectRoot: string | null; children: ReactNode; }

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'avif']);

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

function createLoadingFile(filePath: string): OpenFile {
  return {
    path: filePath,
    name: basename(filePath),
    content: null,
    isLoading: true,
    error: null,
    isDirtyOnDisk: false,
    originalContent: null,
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
  };
}

function toImageViewerFile(file: OpenFile): OpenFile {
  return {
    ...file,
    isLoading: false,
    error: null,
    content: null,
    isImage: true,
  };
}

function toBinaryFile(file: OpenFile): OpenFile {
  return {
    ...file,
    isLoading: false,
    error: 'Binary file - cannot display',
    content: null,
    isImage: false,
  };
}

function toTextFile(file: OpenFile, content: string): OpenFile {
  const originalContent = file.originalContent === null && file.content === null
    ? content
    : file.content ?? file.originalContent;
  return {
    ...file,
    isLoading: false,
    error: null,
    content,
    isDirtyOnDisk: false,
    originalContent,
    isImage: false,
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
  if (looksLikeBinary(content)) {
    return toBinaryFile(file);
  }
  return toTextFile(file, content);
}

function markDirtyOnDisk(file: OpenFile): OpenFile {
  return {
    ...file,
    isDirtyOnDisk: true,
    originalContent: file.isDirtyOnDisk ? file.originalContent : (file.content ?? file.originalContent),
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

function primeOpenFile(filePath: string, setOpenFiles: SetOpenFiles, setActiveIndex: SetActiveIndex): void {
  setOpenFiles((prev) => {
    const existingIndex = prev.findIndex((file) => file.path === filePath);
    setActiveIndex(existingIndex === -1 ? prev.length : existingIndex);
    return existingIndex === -1 ? [...prev, createLoadingFile(filePath)] : prev;
  });
}

function commitOpenFileResult(filePath: string, result: FileReadResult, setOpenFiles: SetOpenFiles): void {
  setOpenFiles((prev) => updateOpenFile(prev, filePath, (file) => toLoadedFile(file, filePath, result)));
}

function markChangedFile(filePath: string, setOpenFiles: SetOpenFiles): void {
  setOpenFiles((prev) => updateOpenFile(prev, filePath, markDirtyOnDisk));
}

function markDeletedFile(filePath: string, setOpenFiles: SetOpenFiles): void {
  setOpenFiles((prev) => updateOpenFile(prev, filePath, (file) => ({ ...file, isDirtyOnDisk: true })));
}

async function reloadChangedFile(filePath: string, setOpenFiles: SetOpenFiles): Promise<void> {
  const result = await readFile(filePath);
  if (!result.success) {
    return;
  }
  const newContent = result.content ?? '';
  if (looksLikeBinary(newContent)) {
    return;
  }
  setOpenFiles((prev) => updateOpenFile(prev, filePath, (file) => ({ ...file, content: newContent })));
}

async function reloadFileContent(filePath: string, setOpenFiles: SetOpenFiles): Promise<void> {
  const result = await readFile(filePath);
  if (!result.success) {
    return;
  }
  const newContent = result.content ?? '';
  setOpenFiles((prev) => updateOpenFile(prev, filePath, (file) => ({
    ...file,
    content: newContent,
    isDirtyOnDisk: false,
  })));
}

function handleProjectFileChange(change: FileChangeEvent, setOpenFiles: SetOpenFiles): void {
  if (change.type === 'change') {
    markChangedFile(change.path, setOpenFiles);
    void reloadChangedFile(change.path, setOpenFiles);
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
      handleProjectFileChange(change, setOpenFiles);
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

function useOpenFileAction(setOpenFiles: SetOpenFiles, setActiveIndex: SetActiveIndex) {
  return useCallback(async (filePath: string): Promise<void> => {
    primeOpenFile(filePath, setOpenFiles, setActiveIndex);
    const result = await readFile(filePath);
    commitOpenFileResult(filePath, result, setOpenFiles);
  }, [setActiveIndex, setOpenFiles]);
}

function useCloseFileAction(setOpenFiles: SetOpenFiles, setActiveIndex: SetActiveIndex) {
  return useCallback((filePath: string) => {
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
  return useCallback(async (filePath: string, content: string): Promise<void> => {
    const result = await window.electronAPI.files.saveFile(filePath, content);
    if (!result.success) {
      console.error('[FileViewerManager] saveFile failed:', result.error);
      return;
    }
    setOpenFiles((prev) => updateOpenFile(prev, filePath, (file) => ({
      ...file,
      content,
      isDirty: false,
      isDirtyOnDisk: false,
      originalContent: content,
    })));
  }, [setOpenFiles]);
}

function useSetDirtyAction(setOpenFiles: SetOpenFiles) {
  return useCallback((filePath: string, dirty: boolean) => {
    setOpenFiles((prev) => updateOpenFile(prev, filePath, (file) => (
      file.isDirty === dirty ? file : { ...file, isDirty: dirty }
    )));
  }, [setOpenFiles]);
}

export function useFileViewerManagerState(projectRoot: string | null): FileViewerState {
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  useProjectChangeListener(projectRoot, setOpenFiles);
  const openFile = useOpenFileAction(setOpenFiles, setActiveIndex);
  useReloadFileListener(setOpenFiles);
  useOpenFileListener(openFile);
  const closeFile = useCloseFileAction(setOpenFiles, setActiveIndex);
  const setActive = useSetActiveAction(setOpenFiles, setActiveIndex);
  const saveFile = useSaveFileAction(setOpenFiles);
  const setDirty = useSetDirtyAction(setOpenFiles);
  return {
    openFiles,
    activeIndex,
    activeFile: openFiles[activeIndex] ?? null,
    openFile,
    closeFile,
    setActive,
    saveFile,
    setDirty,
  };
}
