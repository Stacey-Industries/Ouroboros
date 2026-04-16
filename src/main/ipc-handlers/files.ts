/**
 * ipc-handlers/files.ts - File system IPC handlers
 */

import { BrowserWindow, ipcMain, IpcMainInvokeEvent, shell } from 'electron';
import fs from 'fs/promises';
import path from 'path';

import log from '../logger';
import { watchRecursive, type WatchSubscription } from '../watchers';
import {
  broadcastFileChange,
  createExclusiveFile,
  createOpenFileHandler,
  createSelectFolderHandler,
  ensureDirExists,
  handleShowImageDialog,
  handleSoftDeleteOp,
  isTempDeletionPath,
  listDirectoryItems,
  loadBinaryContent,
  loadTextContent,
  movePath,
  pathExists,
  readFileWithLimit,
  toErrorResult,
  writeBinaryFile,
  writeTextFile,
} from './filesHelpers';
import { assertPathAllowed, isTrustedConfigPath, isTrustedVsxExtensionPath } from './pathSecurity';

type SenderWindow = (event: IpcMainInvokeEvent) => BrowserWindow;
type FileHandler<TArgs extends unknown[] = unknown[]> = (
  event: IpcMainInvokeEvent,
  ...args: TArgs
) => Promise<unknown> | unknown;
type RegisterHandler = <TArgs extends unknown[]>(
  channel: string,
  handler: FileHandler<TArgs>,
) => void;

/**
 * Per-root watcher handle. The dirSet tracks paths seen as directories within
 * this watcher's tree — used to disambiguate parcel 'delete' events into the
 * renderer-expected 'unlink' vs 'unlinkDir' shape.
 */
interface WatcherEntry {
  subscription: WatchSubscription;
  dirSet: Set<string>;
}

const watchers = new Map<string, WatcherEntry>();
const MAX_WATCHERS = 8;

/**
 * Glob patterns passed to @parcel/watcher. These cover dot-prefixed dirs,
 * VCS directories, and common build output directories.
 */
const WATCHER_IGNORE_GLOBS = [
  '**/.*/**',
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/out/**',
  '**/build/**',
  '**/coverage/**',
];

function createRegistrar(channels: string[]): RegisterHandler {
  return (channel, handler) => {
    ipcMain.handle(channel, handler);
    channels.push(channel);
  };
}

function checkPath(event: IpcMainInvokeEvent, p: string) {
  return assertPathAllowed(event, p);
}

/** Like checkPath but allows trusted `~/.claude/commands|rules/*.md` files. */
function checkPathOrTrusted(event: IpcMainInvokeEvent, p: string) {
  const denied = assertPathAllowed(event, p);
  if (denied && !isTrustedConfigPath(p)) return denied;
  return null;
}

/** Like checkPath but also allows read-only access to trusted extension assets. */
function checkReadablePath(event: IpcMainInvokeEvent, p: string) {
  const denied = assertPathAllowed(event, p);
  if (denied && !isTrustedConfigPath(p) && !isTrustedVsxExtensionPath(p)) return denied;
  return null;
}

async function runPathOperation<T extends object>(
  event: IpcMainInvokeEvent,
  targetPath: string,
  operation: () => Promise<T>,
): Promise<T | { success: false; error: string }> {
  const denied = checkPath(event, targetPath);
  if (denied) return denied;
  try {
    return await operation();
  } catch (err) {
    return toErrorResult(err);
  }
}

async function runDualPathOperation<T extends object>(
  event: IpcMainInvokeEvent,
  sourcePath: string,
  destPath: string,
  operation: () => Promise<T>,
): Promise<T | { success: false; error: string }> {
  const deniedSrc = checkPath(event, sourcePath);
  if (deniedSrc) return deniedSrc;
  const deniedDst = checkPath(event, destPath);
  if (deniedDst) return deniedDst;
  try {
    return await operation();
  } catch (err) {
    return toErrorResult(err);
  }
}

/**
 * Map a parcel WatchEventType to the renderer FileChangeType.
 *
 * parcel emits: 'create' | 'update' | 'delete'
 * renderer expects: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'
 *
 * For 'create': stat the path and record it in dirSet if it is a directory.
 * For 'delete': check dirSet to distinguish file vs directory deletion.
 */
async function resolveChangeType(
  parcelType: 'create' | 'update' | 'delete',
  changedPath: string,
  dirSet: Set<string>,
): Promise<'add' | 'addDir' | 'change' | 'unlink' | 'unlinkDir'> {
  if (parcelType === 'update') return 'change';
  if (parcelType === 'delete') {
    const wasDir = dirSet.has(changedPath);
    dirSet.delete(changedPath);
    return wasDir ? 'unlinkDir' : 'unlink';
  }
  // parcelType === 'create'
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- changedPath comes from chokidar watcher event, not user input
    const stat = await fs.stat(changedPath);
    if (stat.isDirectory()) {
      dirSet.add(changedPath);
      return 'addDir';
    }
  } catch {
    // Path disappeared between the event and the stat — treat as a file.
  }
  return 'add';
}

/** Normalize path for consistent watcher map keys (case-insensitive on Windows, strip trailing sep). */
function normalizeWatchPath(p: string): string {
  let norm = path.normalize(p).replace(/[/\\]+$/, '');
  if (process.platform === 'win32') norm = norm.toLowerCase();
  return norm;
}

function evictOldestWatcher(): void {
  const oldest = watchers.keys().next().value;
  if (!oldest) return;
  const entry = watchers.get(oldest);
  watchers.delete(oldest);
  entry?.subscription.close().catch(() => {});
  log.info(`[watchers] evicted oldest watcher (${oldest}), count=${watchers.size}`);
}

async function watchDirectory(
  dirPath: string,
): Promise<{ success: boolean; already?: true; error?: string }> {
  const key = normalizeWatchPath(dirPath);
  if (watchers.has(key)) return { success: true, already: true };
  while (watchers.size >= MAX_WATCHERS) evictOldestWatcher();
  try {
    const dirSet = new Set<string>();
    const subscription = await watchRecursive(
      dirPath,
      { ignore: WATCHER_IGNORE_GLOBS },
      (event) => {
        resolveChangeType(event.type, event.path, dirSet)
          .then((changeType) => broadcastFileChange(changeType, event.path))
          .catch((err) => log.error('[watchers] resolveChangeType failed:', err));
      },
    );
    watchers.set(key, { subscription, dirSet });
    return { success: true };
  } catch (err) {
    return toErrorResult(err);
  }
}

async function handleReadFile(event: IpcMainInvokeEvent, filePath: string) {
  return readFileWithLimit(
    event,
    filePath,
    async () => loadTextContent(filePath),
    checkReadablePath,
  );
}

async function handleReadBinaryFile(event: IpcMainInvokeEvent, filePath: string) {
  return readFileWithLimit(
    event,
    filePath,
    async () => loadBinaryContent(filePath),
    checkReadablePath,
  );
}

async function handleReadDir(event: IpcMainInvokeEvent, dirPath: string) {
  return runPathOperation(event, dirPath, async () => listDirectoryItems(dirPath));
}

async function handleWatchDir(event: IpcMainInvokeEvent, dirPath: string) {
  const denied = assertPathAllowed(event, dirPath);
  if (denied) return denied;
  return watchDirectory(dirPath);
}

async function handleUnwatchDir(event: IpcMainInvokeEvent, dirPath: string) {
  const denied = assertPathAllowed(event, dirPath);
  if (denied) return denied;
  const key = normalizeWatchPath(dirPath);
  const entry = watchers.get(key);
  if (entry) {
    await entry.subscription.close();
    watchers.delete(key);
  }
  return { success: true };
}

async function handleCreateFile(event: IpcMainInvokeEvent, filePath: string, content?: string) {
  return runPathOperation(event, filePath, async () => createExclusiveFile(filePath, content));
}

async function handleMkdir(event: IpcMainInvokeEvent, dirPath: string) {
  return runPathOperation(event, dirPath, async () =>
    (await pathExists(dirPath))
      ? { success: false, error: 'Directory already exists' }
      : (await ensureDirExists(dirPath), { success: true }),
  );
}

async function handleRename(event: IpcMainInvokeEvent, oldPath: string, newPath: string) {
  return runDualPathOperation(event, oldPath, newPath, async () => {
    if (await pathExists(newPath))
      return { success: false, error: 'A file or folder with that name already exists' };
    await movePath(oldPath, newPath);
    return { success: true };
  });
}

async function handleWriteFile(event: IpcMainInvokeEvent, filePath: string, data: Uint8Array) {
  const denied = checkPathOrTrusted(event, filePath);
  if (denied) return denied;
  try {
    return await writeBinaryFile(filePath, data);
  } catch (err) {
    return toErrorResult(err);
  }
}

async function handleSaveFile(event: IpcMainInvokeEvent, filePath: string, content: string) {
  const denied = checkPathOrTrusted(event, filePath);
  if (denied) return denied;
  try {
    return await writeTextFile(filePath, content);
  } catch (err) {
    return toErrorResult(err);
  }
}

async function handleCopyFile(event: IpcMainInvokeEvent, sourcePath: string, destPath: string) {
  return runDualPathOperation(
    event,
    sourcePath,
    destPath,
    async () => (await fs.copyFile(sourcePath, destPath), { success: true }),
  );
}

async function handleDelete(event: IpcMainInvokeEvent, targetPath: string) {
  return runPathOperation(
    event,
    targetPath,
    async () => (await shell.trashItem(targetPath), { success: true }),
  );
}

async function handleSoftDelete(event: IpcMainInvokeEvent, targetPath: string) {
  return runPathOperation(event, targetPath, () => handleSoftDeleteOp(targetPath));
}

async function handleRestoreDeleted(
  event: IpcMainInvokeEvent,
  tempPath: string,
  originalPath: string,
) {
  if (!isTempDeletionPath(tempPath))
    return { success: false, error: 'Invalid temp path: must be within agent-ide temp directory.' };
  return runPathOperation(event, originalPath, async () => {
    await ensureDirExists(path.dirname(originalPath));
    await movePath(tempPath, originalPath);
    return { success: true };
  });
}


export function registerFileHandlers(senderWindow: SenderWindow): string[] {
  const channels: string[] = [];
  const register = createRegistrar(channels);
  [
    ['files:readFile', handleReadFile],
    ['files:readBinaryFile', handleReadBinaryFile],
    ['files:readDir', handleReadDir],
    ['files:watchDir', handleWatchDir],
    ['files:unwatchDir', handleUnwatchDir],
    ['files:createFile', handleCreateFile],
    ['files:mkdir', handleMkdir],
    ['files:rename', handleRename],
    ['files:writeFile', handleWriteFile],
    ['files:saveFile', handleSaveFile],
    ['files:copyFile', handleCopyFile],
    ['files:delete', handleDelete],
    ['files:softDelete', handleSoftDelete],
    ['files:restoreDeleted', handleRestoreDeleted],
    ['files:openFile', createOpenFileHandler(senderWindow)],
    ['files:selectFolder', createSelectFolderHandler(senderWindow)],
    ['files:showImageDialog', handleShowImageDialog],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ].forEach(([channel, handler]) => register(channel as string, handler as FileHandler<any>));
  return channels;
}

export function cleanupFileWatchers(): void {
  for (const [, entry] of watchers) entry.subscription.close().catch(() => {});
  watchers.clear();
}
