/**
 * FileViewerManager.fileOps.ts — file I/O helpers for FileViewerManager.
 * Split from FileViewerManager.helpers.ts to satisfy the max-lines limit.
 */

import type {
  FileReadResult,
  SetActiveIndex,
  SetOpenFiles,
  SplitState,
} from './FileViewerManager.helpers';
import {
  applyDiskSnapshot,
  createLoadingFile,
  isAudioFile,
  isImageFile,
  isPdfFile,
  isVideoFile,
  looksLikeBinary,
  markDirtyOnDisk,
  readFile,
  toLoadedFile,
  updateOpenFile,
} from './FileViewerManager.helpers';

export function primeOpenFile(
  filePath: string,
  setOpenFiles: SetOpenFiles,
  setActiveIndex: SetActiveIndex,
  isPreview = false,
): void {
  setOpenFiles((prev) => {
    const existingIndex = prev.findIndex((file) => file.path === filePath);
    if (existingIndex !== -1) {
      setActiveIndex(existingIndex);
      if (!isPreview && prev[existingIndex].isPreview) {
        return prev.map((f, i) => (i === existingIndex ? { ...f, isPreview: false } : f));
      }
      return prev;
    }
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

export async function readTextFile(filePath: string): Promise<FileReadResult> {
  const result = await readFile(filePath);
  if (!result.success) return result;
  if (isImageFile(filePath) || isPdfFile(filePath) || isAudioFile(filePath) || isVideoFile(filePath)) {
    return result;
  }
  const content = result.content ?? '';
  if (looksLikeBinary(content)) return { success: false, error: 'Binary file - cannot display' };
  return { success: true, content };
}

export function commitOpenFileResult(
  filePath: string,
  result: FileReadResult,
  setOpenFiles: SetOpenFiles,
): void {
  setOpenFiles((prev) =>
    updateOpenFile(prev, filePath, (file) => toLoadedFile(file, filePath, result)),
  );
}

export function markChangedFile(
  filePath: string,
  content: string,
  setOpenFiles: SetOpenFiles,
): void {
  setOpenFiles((prev) =>
    updateOpenFile(prev, filePath, (file) => ({ ...markDirtyOnDisk(file), diskContent: content })),
  );
}

export function markDeletedFile(filePath: string, setOpenFiles: SetOpenFiles): void {
  setOpenFiles((prev) =>
    updateOpenFile(prev, filePath, (file) => ({ ...file, isDirtyOnDisk: true })),
  );
}

export async function reloadFileContent(
  filePath: string,
  setOpenFiles: SetOpenFiles,
): Promise<FileReadResult> {
  const result = await readFile(filePath);
  if (!result.success) return result;
  setOpenFiles((prev) =>
    updateOpenFile(prev, filePath, (file) => {
      const next = toLoadedFile(file, filePath, result);
      if (next.content == null) {
        return { ...next, isDirtyOnDisk: false, error: null, saveError: null };
      }
      return applyDiskSnapshot(next, next.content);
    }),
  );
  return result;
}

export const DEFAULT_SPLIT_STATE: SplitState = {
  isSplit: false,
  activeSplit: 'left',
  rightFilePath: null,
  splitRatio: 0.5,
};
