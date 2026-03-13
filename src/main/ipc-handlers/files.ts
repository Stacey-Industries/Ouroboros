/**
 * ipc-handlers/files.ts - File system IPC handlers
 */

import { ipcMain, dialog, shell, BrowserWindow, IpcMainInvokeEvent } from 'electron'
import type { Dirent } from 'fs'
import fs from 'fs/promises'
import path from 'path'
import chokidar, { FSWatcher } from 'chokidar'
import { dispatchFileOpenEvent } from '../extensions'

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

async function handleReadFile(_event: IpcMainInvokeEvent, filePath: string) {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    dispatchFileOpenEvent(filePath).catch(() => {})
    return { success: true, content }
  } catch (err) {
    return toErrorResult(err)
  }
}

async function handleReadDir(_event: IpcMainInvokeEvent, dirPath: string) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    return { success: true, items: entries.map((entry) => createDirItem(dirPath, entry)) }
  } catch (err) {
    return toErrorResult(err)
  }
}

function handleWatchDir(_event: IpcMainInvokeEvent, dirPath: string) {
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
  _event: IpcMainInvokeEvent,
  filePath: string,
  content?: string,
) {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    if (await pathExists(filePath)) {
      return { success: false, error: 'File already exists' }
    }
    await fs.writeFile(filePath, content ?? '', 'utf-8')
    return { success: true }
  } catch (err) {
    return toErrorResult(err)
  }
}

async function handleMkdir(_event: IpcMainInvokeEvent, dirPath: string) {
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
  _event: IpcMainInvokeEvent,
  oldPath: string,
  newPath: string,
) {
  try {
    await fs.access(oldPath)
    if (await pathExists(newPath)) {
      return { success: false, error: 'A file or folder with that name already exists' }
    }
    await fs.rename(oldPath, newPath)
    return { success: true }
  } catch (err) {
    return toErrorResult(err)
  }
}

async function handleWriteFile(
  _event: IpcMainInvokeEvent,
  filePath: string,
  data: Uint8Array,
) {
  try {
    await fs.writeFile(filePath, data)
    return { success: true }
  } catch (err) {
    return toErrorResult(err)
  }
}

async function handleSaveFile(
  _event: IpcMainInvokeEvent,
  filePath: string,
  content: string,
) {
  try {
    await fs.writeFile(filePath, content, 'utf-8')
    return { success: true }
  } catch (err) {
    return toErrorResult(err)
  }
}

async function handleCopyFile(
  _event: IpcMainInvokeEvent,
  sourcePath: string,
  destPath: string,
) {
  try {
    await fs.copyFile(sourcePath, destPath)
    return { success: true }
  } catch (err) {
    return toErrorResult(err)
  }
}

async function handleDelete(_event: IpcMainInvokeEvent, targetPath: string) {
  try {
    await shell.trashItem(targetPath)
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

export function registerFileHandlers(senderWindow: SenderWindow): string[] {
  const channels: string[] = []
  const register = createRegistrar(channels)

  register('files:readFile', handleReadFile)
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
  register('files:selectFolder', createSelectFolderHandler(senderWindow))

  return channels
}

export function cleanupFileWatchers(): void {
  for (const [, watcher] of watchers) {
    watcher.close().catch(() => {})
  }
  watchers.clear()
}
