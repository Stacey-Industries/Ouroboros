import type { FileEntry } from '../components/FileTree/FileListItem';
import { normPath, relPath } from '../components/FileTree/fileTreeUtils';
import type { FileChangeEvent } from '../types/electron';

export interface ApplyWatchChangeOptions {
  addedFiles?: FileEntry[];
  root: string;
  shouldIgnore: (name: string) => boolean;
}

export interface ProcessWatchChangesOptions {
  root: string;
  scanFilesForAddedDirectory: (dirPath: string) => Promise<FileEntry[]>;
  shouldIgnore: (name: string) => boolean;
}

export function sortIgnorePatterns(patterns: string[]): string[] {
  return [...new Set(patterns.map((pattern) => pattern.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

export function createFileEntry(root: string, itemPath: string): FileEntry {
  const relativePath = relPath(root, itemPath);
  const lastSlash = relativePath.lastIndexOf('/');
  const dir = lastSlash === -1 ? '' : relativePath.slice(0, lastSlash);
  const name = lastSlash === -1 ? relativePath : relativePath.slice(lastSlash + 1);

  return {
    path: itemPath,
    relativePath,
    name,
    dir,
    size: 0,
  };
}

export function sortFiles(files: FileEntry[]): FileEntry[] {
  return [...files].sort((left, right) => {
    const leftDepth = left.relativePath.split('/').length;
    const rightDepth = right.relativePath.split('/').length;

    if (leftDepth !== rightDepth) {
      return leftDepth - rightDepth;
    }

    return left.relativePath.localeCompare(right.relativePath);
  });
}

export function isPathInsideRoot(filePath: string, root: string): boolean {
  const normalizedPath = normPath(filePath);
  const normalizedRoot = normPath(root);
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
}

export function shouldIgnoreIndexedPath(root: string, filePath: string, shouldIgnore: (name: string) => boolean): boolean {
  if (!isPathInsideRoot(filePath, root)) {
    return false;
  }

  const relativePath = relPath(root, filePath);
  return relativePath.split('/').filter(Boolean).some((segment) => shouldIgnore(segment));
}

function upsertFiles(existingFiles: FileEntry[], addedFiles: FileEntry[]): FileEntry[] {
  if (addedFiles.length === 0) {
    return existingFiles;
  }

  const nextFiles = new Map(existingFiles.map((file) => [normPath(file.path), file]));
  for (const file of addedFiles) {
    nextFiles.set(normPath(file.path), file);
  }

  return sortFiles([...nextFiles.values()]);
}

function removeFiles(existingFiles: FileEntry[], predicate: (file: FileEntry) => boolean): FileEntry[] {
  const filteredFiles = existingFiles.filter((file) => !predicate(file));
  return filteredFiles.length === existingFiles.length ? existingFiles : filteredFiles;
}

export function applyWatchChange(files: FileEntry[], change: FileChangeEvent, options: ApplyWatchChangeOptions): FileEntry[] {
  if (!isPathInsideRoot(change.path, options.root)) {
    return files;
  }

  switch (change.type) {
    case 'change':
      return files;
    case 'add':
      if (shouldIgnoreIndexedPath(options.root, change.path, options.shouldIgnore)) {
        return files;
      }
      return upsertFiles(files, [createFileEntry(options.root, change.path)]);
    case 'addDir':
      if (shouldIgnoreIndexedPath(options.root, change.path, options.shouldIgnore)) {
        return files;
      }
      return upsertFiles(files, options.addedFiles ?? []);
    case 'unlink': {
      const normalizedPath = normPath(change.path);
      return removeFiles(files, (file) => normPath(file.path) === normalizedPath);
    }
    case 'unlinkDir': {
      const normalizedPath = normPath(change.path);
      return removeFiles(files, (file) => {
        const filePath = normPath(file.path);
        return filePath === normalizedPath || filePath.startsWith(`${normalizedPath}/`);
      });
    }
  }
}

export async function processWatchChanges(
  files: FileEntry[],
  changes: FileChangeEvent[],
  options: ProcessWatchChangesOptions,
): Promise<FileEntry[]> {
  let nextFiles = files;

  for (const change of changes) {
    const addedFiles = change.type === 'addDir'
      ? await options.scanFilesForAddedDirectory(change.path)
      : undefined;

    nextFiles = applyWatchChange(nextFiles, change, {
      addedFiles,
      root: options.root,
      shouldIgnore: options.shouldIgnore,
    });
  }

  return nextFiles;
}
