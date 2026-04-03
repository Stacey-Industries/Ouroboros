/**
 * FileViewerManager helpers — pure functions for file state management.
 * Extracted from FileViewerManager.internal.ts to stay within max-lines.
 */
import type { Dispatch, SetStateAction } from 'react';

// Lazy import to avoid eagerly loading Monaco (~40MB) at startup
export function disposeMonacoModel(filePath: string): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- intentional lazy require to avoid loading ~40MB at startup
    const monaco = require('monaco-editor') as typeof import('monaco-editor');
    const uri = monaco.Uri.parse(`file:///${filePath.replace(/\\/g, '/').replace(/^\/+/, '')}`);
    const model = monaco.editor.getModel(uri);
    if (model) model.dispose();
  } catch {
    // Monaco not loaded yet — nothing to dispose
  }
}

export interface FileReadResult { success: boolean; content?: string | null; error?: string; }
export interface SaveFileResult { success: boolean; error?: string; }

export type SetOpenFiles = Dispatch<SetStateAction<OpenFile[]>>;
export type SetActiveIndex = Dispatch<SetStateAction<number>>;

export interface OpenFile {
  path: string;
  name: string;
  content: string | null;
  isLoading: boolean;
  error: string | null;
  isDirtyOnDisk: boolean;
  originalContent: string | null;
  diskContent: string | null;
  isImage?: boolean;
  isPdf?: boolean;
  isAudio?: boolean;
  isVideo?: boolean;
  isBinary?: boolean;
  binaryContent?: Uint8Array;
  isDirty: boolean;
  saveError: string | null;
  /** Preview tab: italic title, replaced by next preview open. Pinned on edit or double-click. */
  isPreview?: boolean;
  /** Pinned tab: shows pin icon, sorts left, cannot be closed via close button. */
  isPinned?: boolean;
}

export interface SplitState {
  isSplit: boolean;
  activeSplit: 'left' | 'right';
  rightFilePath: string | null;
  splitRatio: number;
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'avif']);
const PDF_EXTENSIONS = new Set(['pdf']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv']);

export function basename(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? filePath;
}

export function looksLikeBinary(content: string): boolean {
  return content.slice(0, 8192).includes('\x00');
}

export function isImageFile(filePath: string): boolean {
  const extension = filePath.toLowerCase().split('.').pop() ?? '';
  return IMAGE_EXTENSIONS.has(extension);
}

export function isPdfFile(filePath: string): boolean {
  const extension = filePath.toLowerCase().split('.').pop() ?? '';
  return PDF_EXTENSIONS.has(extension);
}

export function isAudioFile(filePath: string): boolean {
  const extension = filePath.toLowerCase().split('.').pop() ?? '';
  return AUDIO_EXTENSIONS.has(extension);
}

export function isVideoFile(filePath: string): boolean {
  const extension = filePath.toLowerCase().split('.').pop() ?? '';
  return VIDEO_EXTENSIONS.has(extension);
}

export function createLoadingFile(filePath: string, isPreview = false): OpenFile {
  return {
    path: filePath, name: basename(filePath), content: null, isLoading: true,
    error: null, isDirtyOnDisk: false, originalContent: null, diskContent: null,
    isDirty: false, saveError: null, isPreview,
  };
}

export function updateOpenFile(files: OpenFile[], filePath: string, update: (file: OpenFile) => OpenFile): OpenFile[] {
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
    isAudio: false,
    isVideo: false,
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
    isAudio: false,
    isVideo: false,
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
    isAudio: false,
    isVideo: false,
    isBinary: false,
    saveError: null,
  };
}

function toAudioFile(file: OpenFile): OpenFile {
  return {
    ...file,
    isLoading: false,
    error: null,
    content: null,
    isImage: false,
    isPdf: false,
    isAudio: true,
    isVideo: false,
    isBinary: false,
    saveError: null,
  };
}

function toVideoFile(file: OpenFile): OpenFile {
  return {
    ...file,
    isLoading: false,
    error: null,
    content: null,
    isImage: false,
    isPdf: false,
    isAudio: false,
    isVideo: true,
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
    isAudio: false,
    isVideo: false,
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
    isAudio: false,
    isVideo: false,
    isBinary: false,
    isDirty: false,
    saveError: null,
  };
}

export function toLoadedFile(file: OpenFile, filePath: string, result: FileReadResult): OpenFile {
  if (!result.success) return toReadErrorFile(file, result);
  const content = result.content ?? '';
  if (isImageFile(filePath)) return toImageViewerFile(file);
  if (isPdfFile(filePath)) return toPdfFile(file);
  if (isAudioFile(filePath)) return toAudioFile(file);
  if (isVideoFile(filePath)) return toVideoFile(file);
  if (looksLikeBinary(content)) return toBinaryFile(file);
  return toTextFile(file, content);
}

export function markDirtyOnDisk(file: OpenFile): OpenFile {
  return { ...file, isDirtyOnDisk: true };
}

export function applyDiskSnapshot(file: OpenFile, content: string): OpenFile {
  return { ...file, content, originalContent: content, diskContent: content, isDirty: false, isDirtyOnDisk: false, saveError: null, error: null };
}

export function applyDraftContent(file: OpenFile, content: string): OpenFile {
  const baseline = file.originalContent ?? '';
  return { ...file, content, isDirty: content !== baseline, saveError: null };
}

export function getNextActiveIndex(current: number, nextLength: number, removedIndex: number): number {
  if (nextLength === 0) return 0;
  if (current >= nextLength) return nextLength - 1;
  if (current > removedIndex) return current - 1;
  return current;
}

export async function readFile(filePath: string): Promise<FileReadResult> {
  return window.electronAPI.files.readFile(filePath);
}

export function primeOpenFile(filePath: string, setOpenFiles: SetOpenFiles, setActiveIndex: SetActiveIndex, isPreview = false): void {
  setOpenFiles((prev) => {
    const existingIndex = prev.findIndex((file) => file.path === filePath);
    if (existingIndex !== -1) {
      setActiveIndex(existingIndex);
      if (!isPreview && prev[existingIndex].isPreview) {
        return prev.map((f, i) => i === existingIndex ? { ...f, isPreview: false } : f);
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

export function commitOpenFileResult(filePath: string, result: FileReadResult, setOpenFiles: SetOpenFiles): void {
  setOpenFiles((prev) => updateOpenFile(prev, filePath, (file) => toLoadedFile(file, filePath, result)));
}

export function markChangedFile(filePath: string, content: string, setOpenFiles: SetOpenFiles): void {
  setOpenFiles((prev) => updateOpenFile(prev, filePath, (file) => ({ ...markDirtyOnDisk(file), diskContent: content })));
}

export function markDeletedFile(filePath: string, setOpenFiles: SetOpenFiles): void {
  setOpenFiles((prev) => updateOpenFile(prev, filePath, (file) => ({ ...file, isDirtyOnDisk: true })));
}

export async function reloadFileContent(filePath: string, setOpenFiles: SetOpenFiles): Promise<FileReadResult> {
  const result = await readFile(filePath);
  if (!result.success) return result;
  setOpenFiles((prev) => updateOpenFile(prev, filePath, (file) => {
    const next = toLoadedFile(file, filePath, result);
    if (next.content == null) {
      return { ...next, isDirtyOnDisk: false, error: null, saveError: null };
    }
    return applyDiskSnapshot(next, next.content);
  }));
  return result;
}

export const DEFAULT_SPLIT_STATE: SplitState = {
  isSplit: false, activeSplit: 'left', rightFilePath: null, splitRatio: 0.5,
};
