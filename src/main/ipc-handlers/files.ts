/**
 * ipc-handlers/files.ts - File system IPC handlers
 */

import chokidar, { FSWatcher } from 'chokidar';
import { randomUUID } from 'crypto';
import { BrowserWindow, dialog, ipcMain, IpcMainInvokeEvent, shell } from 'electron';
import type { Dirent } from 'fs';
import fs from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';

import { getGraphController } from '../codebaseGraph/graphController';
import { getContextLayerController } from '../contextLayer/contextLayerController';
import { dispatchFileOpenEvent } from '../extensions';
import { broadcastToWebClients } from '../web/webServer';
import { invalidateSnapshotCache as invalidateAgentChatCache } from './agentChat';
import { assertPathAllowed } from './pathSecurity';

const MAX_READ_BYTES = 100 * 1024 * 1024; // 100 MB

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

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function toErrorResult(err: unknown): { success: false; error: string } {
  return { success: false, error: toErrorMessage(err) };
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function createDirItem(dirPath: string, entry: Dirent) {
  return {
    name: entry.name,
    path: path.join(dirPath, entry.name),
    isDirectory: entry.isDirectory(),
    isFile: entry.isFile(),
    isSymlink: entry.isSymbolicLink(),
  };
}

async function runPathOperation<T extends object>(
  event: IpcMainInvokeEvent,
  targetPath: string,
  operation: () => Promise<T>,
): Promise<T | { success: false; error: string }> {
  const denied = assertPathAllowed(event, targetPath);
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
  const deniedSrc = assertPathAllowed(event, sourcePath);
  if (deniedSrc) return deniedSrc;
  const deniedDst = assertPathAllowed(event, destPath);
  if (deniedDst) return deniedDst;
  try {
    return await operation();
  } catch (err) {
    return toErrorResult(err);
  }
}

async function ensureDirExists(dirPath: string): Promise<void> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- directory paths are derived from validated file paths
  await fs.mkdir(dirPath, { recursive: true });
}

async function movePath(sourcePath: string, destPath: string): Promise<void> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- both paths are validated before use
  await fs.rename(sourcePath, destPath);
}

function mimeTypeForImage(ext: string): string {
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    default:
      return 'image/png';
  }
}

async function loadImageAttachment(
  filePath: string,
): Promise<{ name: string; mimeType: string; base64Data: string; sizeBytes: number }> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath comes from the open-file dialog
  const buf = await fs.readFile(filePath);
  if (buf.byteLength > 5 * 1024 * 1024) {
    throw new Error(`${path.basename(filePath)} exceeds the 5 MB attachment limit.`);
  }
  const ext = path.extname(filePath).toLowerCase().slice(1);
  return {
    name: path.basename(filePath),
    mimeType: mimeTypeForImage(ext),
    base64Data: buf.toString('base64'),
    sizeBytes: buf.byteLength,
  };
}

function isTempDeletionPath(tempPath: string): boolean {
  const normalizedTemp = path.resolve(tempPath);
  const expectedPrefix = path.resolve(tmpdir(), 'agent-ide-deleted');
  return normalizedTemp === expectedPrefix || normalizedTemp.startsWith(expectedPrefix + path.sep);
}

async function readFileWithLimit<T extends object>(
  event: IpcMainInvokeEvent,
  filePath: string,
  load: () => Promise<T>,
): Promise<T | { success: false; error: string }> {
  return runPathOperation(event, filePath, async () => {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path validated by assertPathAllowed
    const stat = await fs.stat(filePath);
    if (stat.size > MAX_READ_BYTES) {
      return {
        success: false,
        error: `File too large (${Math.round(stat.size / 1024 / 1024)} MB). Maximum is 100 MB.`,
      };
    }
    const result = await load();
    dispatchFileOpenEvent(filePath).catch(() => {});
    return result;
  });
}

async function loadTextContent(filePath: string): Promise<{ success: true; content: string }> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath is validated before this helper runs
  return { success: true, content: await fs.readFile(filePath, 'utf-8') };
}

async function loadBinaryContent(filePath: string): Promise<{ success: true; data: Buffer }> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath is validated before this helper runs
  return { success: true, data: await fs.readFile(filePath) };
}

async function listDirectoryItems(
  dirPath: string,
): Promise<{ success: true; items: ReturnType<typeof createDirItem>[] }> {
  return {
    success: true,
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- dirPath is validated before this helper runs
    items: (await fs.readdir(dirPath, { withFileTypes: true })).map((entry) =>
      createDirItem(dirPath, entry),
    ),
  };
}

async function createExclusiveFile(
  filePath: string,
  content?: string,
): Promise<{ success: true } | { success: false; error: string }> {
  await ensureDirExists(path.dirname(filePath));
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath is validated before this helper runs
  const handle = await fs.open(filePath, 'wx');
  try {
    await handle.writeFile(content ?? '', 'utf-8');
    return { success: true };
  } finally {
    await handle.close();
  }
}

async function writeBinaryFile(filePath: string, data: Uint8Array): Promise<{ success: true }> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath is validated before this helper runs
  await fs.writeFile(filePath, data);
  return { success: true };
}

async function writeTextFile(filePath: string, content: string): Promise<{ success: true }> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath is validated before this helper runs
  await fs.writeFile(filePath, content, 'utf-8');
  return { success: true };
}

function broadcastFileChange(type: string, filePath: string): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('files:change', { type, path: filePath });
    }
  }
  broadcastToWebClients('files:change', { type, path: filePath });
  getContextLayerController()?.onFileChange(type, filePath);
  invalidateAgentChatCache();

  // Notify codebase graph of file change
  const graphCtrl = getGraphController();
  if (graphCtrl) {
    graphCtrl.onFileChange([filePath]);
  }
}

function bindWatcherEvents(watcher: FSWatcher): void {
  for (const [eventName, changeType] of WATCHER_EVENTS) {
    watcher.on(eventName, (changedPath) => broadcastFileChange(changeType, changedPath));
  }
  watcher.on('error', (err) => {
    console.error('[watcher] error:', err);
  });
}

function watchDirectory(dirPath: string): { success: boolean; already?: true; error?: string } {
  if (watchers.has(dirPath)) {
    return { success: true, already: true };
  }

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
  return readFileWithLimit(event, filePath, async () => loadTextContent(filePath));
}

async function handleReadBinaryFile(event: IpcMainInvokeEvent, filePath: string) {
  return readFileWithLimit(event, filePath, async () => loadBinaryContent(filePath));
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
  return runPathOperation(event, filePath, async () => writeBinaryFile(filePath, data));
}

async function handleSaveFile(event: IpcMainInvokeEvent, filePath: string, content: string) {
  return runPathOperation(event, filePath, async () => writeTextFile(filePath, content));
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
  return runPathOperation(event, targetPath, async () => {
    const tempDir = path.join(tmpdir(), 'agent-ide-deleted');
    await ensureDirExists(tempDir);
    const tempPath = path.join(tempDir, randomUUID());
    await movePath(targetPath, tempPath);
    return { success: true, tempPath };
  });
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

async function handleShowImageDialog(
  event: IpcMainInvokeEvent,
): Promise<{
  success: boolean;
  cancelled?: boolean;
  attachments?: Array<{ name: string; mimeType: string; base64Data: string; sizeBytes: number }>;
  error?: string;
}> {
  const win = (event.sender.getOwnerBrowserWindow() ?? BrowserWindow.getFocusedWindow())!;
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
  ].forEach(([channel, handler]) => register(channel, handler as IpcHandler));
  return channels;
}

export function cleanupFileWatchers(): void {
  for (const [, watcher] of watchers) watcher.close().catch(() => {});
  watchers.clear();
}
