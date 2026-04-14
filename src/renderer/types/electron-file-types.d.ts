/**
 * electron-file-types.d.ts — File and buffer types extracted from
 * electron-foundation.d.ts to stay within the 300-line ESLint limit.
 * Re-exported from electron-foundation.d.ts; import from 'electron' barrel only.
 */

export interface BufferExcerpt {
  filePath: string;
  startLine: number;
  endLine: number;
  label?: string;
}

export interface MultiBufferConfig {
  name: string;
  excerpts: BufferExcerpt[];
}

export type FileChangeType = 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';

export interface FileChangeEvent {
  type: FileChangeType;
  path: string;
}

export interface DirEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  isSymlink: boolean;
}
