/**
 * ipc-handlers/files.ts - File system IPC handlers
 */

import chokidar, { FSWatcher } from 'chokidar'
import { randomUUID } from 'crypto'
import { BrowserWindow, dialog, ipcMain, IpcMainInvokeEvent,shell } from 'electron'
import type { Dirent } from 'fs'
import fs from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'

import { getGraphController } from '../codebaseGraph/graphController'
import { getContextLayerController } from '../contextLayer/contextLayerController'
import { dispatchFileOpenEvent } from '../extensions'
import { broadcastToWebClients } from '../web/webServer'
import { invalidateSnapshotCache as invalidateAgentChatCache } from './agentChat'
import { assertPathAllowed } from './pathSecurity'

const MAX_READ_BYTES = 100 * 1024 * 1024 // 100 MB

type SenderWindow = (event: IpcMainInvokeEvent) => BrowserWindow
type FileHandler<TArgs extends unknown[] = unknown[]> = (
  event: IpcMainInvokeEvent,
  ...args: TArgs
) => Promise<unknown> | unknown
type RegisterHandler = <TArgs extends unknown[]>(
  channel: string,
  handler: FileHandler<TArgs>,
) => void

const watchers = new Map<string, FSWatcher>()

const WATCHER_IGNORES = [
  /(^|[/\\])\../,
  /node_modules/,
  /\.git/,
  /dist/,
  /out/,
  /build/,
  /coverage/,
]

const WATCHER_EVENTS = [
  ['add', 'add'],
  ['change', 'change'],
  ['unlink', 'unlink'],
  ['addDir', 'addDir'],
  ['unlinkDir', 'unlinkDir'],
] as const

function createRegistrar(channels: string[]): RegisterHandler {
  return (channel, handler) => {
    ipcMain.handle(channel, handler)
    channels.push(channel)
  }
}

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function toErrorResult(err: unknown): { success: false; error: string } {
  return { success: false, error: toErrorMessage(err) }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

function createDirItem(dirPath: string, entry: Dirent) {
  return {
    name: entry.name,
    path: path.join(dirPath, entry.name),
    isDirectory: entry.isDirectory(),
    isFile: entry.isFile(),
    isSymlink: entry.isSymbolicLink(),
  }
}

function broadcastFileChange(type: string, filePath: string): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('files:change', { type, path: filePath })
    }
  }
  broadcastToWebClients('files:change', { type, path: filePath })
  getContextLayerController()?.onFileChange(type, filePath)
  invalidateAgentChatCache()

  // Notify codebase graph of file change
  const graphCtrl = getGraphController()
  if (graphCtrl) {
    graphCtrl.onFileChange([filePath])
  }
}

function bindWatcherEvents(watcher: FSWatcher): void {
  for (const [eventName, changeType] of WATCHER_EVENTS) {
    watcher.on(eventName, (changedPath) => broadcastFileChange(changeType, changedPath))
  }
  watcher.on('error', (err) => {
    console.error('[watcher] error:', err)
  })
}

function watchDirectory(dirPath: string): { success: boolean; already?: true; error?: string } {
  if (watchers.has(dirPath)) {
    return { success: true, already: true }
  }

  try {
    const watcher = chokidar.watch(dirPath, {
      persistent: true,
      ignoreInitial: true,
      ignored: WATCHER_IGNORES,
      depth: 8,
      awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
    })
    bindWatcherEvents(watcher)
    watchers.set(dirPath, watcher)
    return { success: true }
  } catch (err) {
    return toErrorResult(err)
  }
}

async function handleReadFile(event: IpcMainInvokeEvent, filePath: string) {
  const denied = assertPathAllowed(event, filePath)
  if (denied) return denied
  try {
    const stat = await fs.stat(filePath)
    if (stat.size > MAX_READ_BYTES) {
      return { success: false, error: `File too large (${Math.round(stat.size / 1024 / 1024)} MB). Maximum is 100 MB.` }
    }
    const content = await fs.readFile(filePath, 'utf-8')
    dispatchFileOpenEvent(filePath).catch(() => {})
    return { success: true, content }
  } catch (err) {
    return toErrorResult(err)
  }
}

async function handleReadBinaryFile(event: IpcMainInvokeEvent, filePath: string) {
  const denied = assertPathAllowed(event, filePath)
  if (denied) return denied
  try {
    const stat = await fs.stat(filePath)
    if (stat.size > MAX_READ_BYTES) {
      return { success: false, error: `File too large (${Math.round(stat.size / 1024 / 1024)} MB). Maximum is 100 MB.` }
    }
    const buffer = await fs.readFile(filePath)
    dispatchFileOpenEvent(filePath).catch(() => {})
    return { success: true, data: buffer }
  } catch (err) {
    return toErrorResult(err)
  }
}

async function handleReadDir(event: IpcMainInvokeEvent, dirPath: string) {
  const denied = assertPathAllowed(event, dirPath)
  if (denied) return denied
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    return { success: true, items: entries.map((entry) => createDirItem(dirPath, entry)) }
  } catch (err) {
    return toErrorResult(err)
  }
}

function handleWatchDir(event: IpcMainInvokeEvent, dirPath: string) {
  const denied = assertPathAllowed(event, dirPath)
  if (denied) return denied
  return watchDirectory(dirPath)
}

async function handleUnwatchDir(_event: IpcMainInvokeEvent, dirPath: string) {
  const watcher = watchers.get(dirPath)
  if (watcher) {
    await watcher.close()
    watchers.delete(dirPath)
  }
  return { success: true }
}

async function handleCreateFile(
  event: IpcMainInvokeEvent,
  filePath: string,
  content?: string,
) {
  const denied = assertPathAllowed(event, filePath)
  if (denied) return denied
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    // Atomic create: 'wx' flag fails with EEXIST if the file already exists,
    // eliminating the TOCTOU race between checking existence and writing.
    const handle = await fs.open(filePath, 'wx')
    await handle.writeFile(content ?? '', 'utf-8')
    await handle.close()
    return { success: true }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      return { success: false, error: 'File already exists' }
    }
    return toErrorResult(err)
  }
}

async function handleMkdir(event: IpcMainInvokeEvent, dirPath: string) {
  const denied = assertPathAllowed(event, dirPath)
  if (denied) return denied
  try {
    if (await pathExists(dirPath)) {
      return { success: false, error: 'Directory already exists' }
    }
    await fs.mkdir(dirPath, { recursive: true })
    return { success: true }
  } catch (err) {
    return toErrorResult(err)
  }
}

async function handleRename(
  event: IpcMainInvokeEvent,
  oldPath: string,
  newPath: string,
) {
  const deniedOld = assertPathAllowed(event, oldPath)
  if (deniedOld) return deniedOld
  const deniedNew = assertPathAllowed(event, newPath)
  if (deniedNew) return deniedNew
  try {
    // Keep the target-exists check: on Windows fs.rename silently overwrites.
    if (await pathExists(newPath)) {
      return { success: false, error: 'A file or folder with that name already exists' }
    }
    await fs.rename(oldPath, newPath)
    return { success: true }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { success: false, error: 'Source file or folder not found' }
    }
    return toErrorResult(err)
  }
}

async function handleWriteFile(
  event: IpcMainInvokeEvent,
  filePath: string,
  data: Uint8Array,
) {
  const denied = assertPathAllowed(event, filePath)
  if (denied) return denied
  try {
    await fs.writeFile(filePath, data)
    return { success: true }
  } catch (err) {
    return toErrorResult(err)
  }
}

async function handleSaveFile(
  event: IpcMainInvokeEvent,
  filePath: string,
  content: string,
) {
  const denied = assertPathAllowed(event, filePath)
  if (denied) return denied
  try {
    await fs.writeFile(filePath, content, 'utf-8')
    return { success: true }
  } catch (err) {
    return toErrorResult(err)
  }
}

async function handleCopyFile(
  event: IpcMainInvokeEvent,
  sourcePath: string,
  destPath: string,
) {
  const deniedSrc = assertPathAllowed(event, sourcePath)
  if (deniedSrc) return deniedSrc
  const deniedDst = assertPathAllowed(event, destPath)
  if (deniedDst) return deniedDst
  try {
    await fs.copyFile(sourcePath, destPath)
    return { success: true }
  } catch (err) {
    return toErrorResult(err)
  }
}

async function handleDelete(event: IpcMainInvokeEvent, targetPath: string) {
  const denied = assertPathAllowed(event, targetPath)
  if (denied) return denied
  try {
    await shell.trashItem(targetPath)
    return { success: true }
  } catch (err) {
    return toErrorResult(err)
  }
}

async function handleSoftDelete(event: IpcMainInvokeEvent, targetPath: string) {
  const denied = assertPathAllowed(event, targetPath)
  if (denied) return denied
  try {
    const tempDir = path.join(tmpdir(), 'agent-ide-deleted')
    await fs.mkdir(tempDir, { recursive: true })
    const tempPath = path.join(tempDir, randomUUID())
    await fs.rename(targetPath, tempPath)
    return { success: true, tempPath }
  } catch (err) {
    return toErrorResult(err)
  }
}

async function handleRestoreDeleted(event: IpcMainInvokeEvent, tempPath: string, originalPath: string) {
  // Validate that tempPath is within the agent-ide temp directory to prevent
  // an attacker from using this handler to move arbitrary files.
  const normalizedTemp = path.resolve(tempPath)
  const expectedPrefix = path.resolve(tmpdir(), 'agent-ide-deleted')
  if (normalizedTemp !== expectedPrefix && !normalizedTemp.startsWith(expectedPrefix + path.sep)) {
    return { success: false, error: 'Invalid temp path: must be within agent-ide temp directory.' }
  }
  // Validate the restore destination is within the workspace.
  const denied = assertPathAllowed(event, originalPath)
  if (denied) return denied
  try {
    await fs.mkdir(path.dirname(originalPath), { recursive: true })
    await fs.rename(tempPath, originalPath)
    return { success: true }
  } catch (err) {
    return toErrorResult(err)
  }
}

function createSelectFolderHandler(senderWindow: SenderWindow): FileHandler {
  return async (event) => {
    const result = await dialog.showOpenDialog(senderWindow(event), {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Project Folder',
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: true, cancelled: true, path: null }
    }

    return { success: true, cancelled: false, path: result.filePaths[0] }
  }
}

async function handleShowImageDialog(event: IpcMainInvokeEvent): Promise<{
  success: boolean
  cancelled?: boolean
  attachments?: Array<{ name: string; mimeType: string; base64Data: string; sizeBytes: number }>
  error?: string
}> {
  const win = (event.sender.getOwnerBrowserWindow() ?? BrowserWindow.getFocusedWindow())!
  const result = await dialog.showOpenDialog(win, {
    title: 'Attach Image',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
  })

  if (result.canceled || result.filePaths.length === 0) {
    return { success: true, cancelled: true }
  }

  const MAX_SIZE = 5 * 1024 * 1024 // 5 MB
  const MAX_COUNT = 5

  const attachments: Array<{ name: string; mimeType: string; base64Data: string; sizeBytes: number }> = []

  for (const filePath of result.filePaths.slice(0, MAX_COUNT)) {
    const buf = await fs.readFile(filePath)
    if (buf.byteLength > MAX_SIZE) {
      return { success: false, error: `${path.basename(filePath)} exceeds the 5 MB attachment limit.` }
    }
    const ext = path.extname(filePath).toLowerCase().slice(1)
    const mimeMap: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
    }
    attachments.push({
      name: path.basename(filePath),
      mimeType: mimeMap[ext] ?? 'image/png',
      base64Data: buf.toString('base64'),
      sizeBytes: buf.byteLength,
    })
  }

  return { success: true, cancelled: false, attachments }
}

export function registerFileHandlers(senderWindow: SenderWindow): string[] {
  const channels: string[] = []
  const register = createRegistrar(channels)

  register('files:readFile', handleReadFile)
  register('files:readBinaryFile', handleReadBinaryFile)
  register('files:readDir', handleReadDir)
  register('files:watchDir', handleWatchDir)
  register('files:unwatchDir', handleUnwatchDir)
  register('files:createFile', handleCreateFile)
  register('files:mkdir', handleMkdir)
  register('files:rename', handleRename)
  register('files:writeFile', handleWriteFile)
  register('files:saveFile', handleSaveFile)
  register('files:copyFile', handleCopyFile)
  register('files:delete', handleDelete)
  register('files:softDelete', handleSoftDelete)
  register('files:restoreDeleted', handleRestoreDeleted)
  register('files:selectFolder', createSelectFolderHandler(senderWindow))
  register('files:showImageDialog', handleShowImageDialog)

  return channels
}

export function cleanupFileWatchers(): void {
  for (const [, watcher] of watchers) {
    watcher.close().catch(() => {})
  }
  watchers.clear()
}
