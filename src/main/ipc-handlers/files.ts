/**
 * ipc-handlers/files.ts - File system IPC handlers
 */

import chokidar, { FSWatcher } from 'chokidar';
import { BrowserWindow, dialog, ipcMain, IpcMainInvokeEvent, shell } from 'electron';
import fs from 'fs/promises';
import path from 'path';

import log from '../logger';
import {
  broadcastFileChange,
  createExclusiveFile,
  ensureDirExists,
  handleSoftDeleteOp,
  isTempDeletionPath,
  listDirectoryItems,
  loadBinaryContent,
  loadImageAttachment,
  loadTextContent,
  movePath,
  pathExists,
  readFileWithLimit,
  toErrorResult,
  writeBinaryFile,
  writeTextFile,
} from './filesHelpers';
import { assertPathAllowed, isTrustedConfigPath } from './pathSecurity';

type SenderWindow = (event: IpcMainInvokeEvent) => BrowserWindow;
type FileHandler<TArgs extends unknown[] = unknown[]> = (
  event: IpcMainInvokeEvent,
  ...args: TArgs
) => Promise<unknown> | unknown;
type RegisterHandler = <TArgs extends unknown[]>(
  channel: string,
  handler: FileHandler<TArgs>,
) => void;

const watchers = new Map<string, FSWatcher>();

const WATCHER_IGNORES = [
  /(^|[/\\])\../,
  /node_modules/,
  /\.git/,
  /dist/,
  /out/,
  /build/,
  /coverage/,
];

const WATCHER_EVENTS = [
  ['add', 'add'],
  ['change', 'change'],
  ['unlink', 'unlink'],
  ['addDir', 'addDir'],
  ['unlinkDir', 'unlinkDir'],
] as const;

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

function bindWatcherEvents(watcher: FSWatcher): void {
  for (const [eventName, changeType] of WATCHER_EVENTS) {
    watcher.on(eventName, (changedPath) => broadcastFileChange(changeType, changedPath));
  }
  watcher.on('error', (err) => {
    log.error('watcher error:', err);
  });
}

function watchDirectory(dirPath: string): { success: boolean; already?: true; error?: string } {
  if (watchers.has(dirPath)) return { success: true, already: true };
  try {
    const watcher = chokidar.watch(dirPath, {
      persistent: true,
      ignoreInitial: true,
      ignored: WATCHER_IGNORES,
      depth: 8,
      awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
    });
    bindWatcherEvents(watcher);
    watchers.set(dirPath, watcher);
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
    checkPathOrTrusted,
  );
}

async function handleReadBinaryFile(event: IpcMainInvokeEvent, filePath: string) {
  return readFileWithLimit(event, filePath, async () => loadBinaryContent(filePath), checkPath);
}

async function handleReadDir(event: IpcMainInvokeEvent, dirPath: string) {
  return runPathOperation(event, dirPath, async () => listDirectoryItems(dirPath));
}

function handleWatchDir(event: IpcMainInvokeEvent, dirPath: string) {
  return assertPathAllowed(event, dirPath) || watchDirectory(dirPath);
}

async function handleUnwatchDir(_event: IpcMainInvokeEvent, dirPath: string) {
  const watcher = watchers.get(dirPath);
  if (watcher) {
    await watcher.close();
    watchers.delete(dirPath);
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

function createSelectFolderHandler(senderWindow: SenderWindow): FileHandler {
  return async (event) => {
    const result = await dialog.showOpenDialog(senderWindow(event), {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Project Folder',
    });
    return result.canceled || result.filePaths.length === 0
      ? { success: true, cancelled: true, path: null }
      : { success: true, cancelled: false, path: result.filePaths[0] };
  };
}

async function handleShowImageDialog(event: IpcMainInvokeEvent) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- getOwnerBrowserWindow is available at runtime even if not in typedefs
  const win = ((event.sender as any).getOwnerBrowserWindow?.() ??
    BrowserWindow.getFocusedWindow())!;
  const result = await dialog.showOpenDialog(win, {
    title: 'Attach Image',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return { success: true, cancelled: true };
  try {
    const attachments = await Promise.all(result.filePaths.slice(0, 5).map(loadImageAttachment));
    return { success: true, cancelled: false, attachments };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
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
    ['files:selectFolder', createSelectFolderHandler(senderWindow)],
    ['files:showImageDialog', handleShowImageDialog],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ].forEach(([channel, handler]) => register(channel as string, handler as FileHandler<any>));
  return channels;
}

export function cleanupFileWatchers(): void {
  for (const [, watcher] of watchers) watcher.close().catch(() => {});
  watchers.clear();
}
