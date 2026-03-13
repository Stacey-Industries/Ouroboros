/**
 * ipc-handlers/files.ts — File system IPC handlers
 */

import { ipcMain, dialog, shell, BrowserWindow, IpcMainInvokeEvent } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import chokidar, { FSWatcher } from 'chokidar'
import { dispatchFileOpenEvent } from '../extensions'

type SenderWindow = (event: IpcMainInvokeEvent) => BrowserWindow

// Active file watchers keyed by watched path
const watchers = new Map<string, FSWatcher>()

export function registerFileHandlers(senderWindow: SenderWindow): string[] {
  const channels: string[] = []

  ipcMain.handle('files:readFile', async (_event, filePath: string) => {
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      // Dispatch extension activation event for file open
      dispatchFileOpenEvent(filePath).catch(() => {})
      return { success: true, content }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('files:readFile')

  ipcMain.handle('files:readDir', async (_event, dirPath: string) => {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })
      const items = entries.map((entry) => ({
        name: entry.name,
        path: path.join(dirPath, entry.name),
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile(),
        isSymlink: entry.isSymbolicLink()
      }))
      return { success: true, items }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('files:readDir')

  ipcMain.handle('files:watchDir', (_event, dirPath: string) => {
    if (watchers.has(dirPath)) {
      return { success: true, already: true }
    }

    try {
      const watcher = chokidar.watch(dirPath, {
        persistent: true,
        ignoreInitial: true,
        ignored: [
          /(^|[/\\])\../, // dotfiles
          /node_modules/,
          /\.git/,
          /dist/,
          /out/,
          /build/,
          /coverage/
        ],
        depth: 8,
        awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 }
      })

      const broadcastFileChange = (type: string, filePath: string) => {
        for (const bw of BrowserWindow.getAllWindows()) {
          if (!bw.isDestroyed()) {
            bw.webContents.send('files:change', { type, path: filePath })
          }
        }
      }
      watcher.on('add', (filePath) => broadcastFileChange('add', filePath))
      watcher.on('change', (filePath) => broadcastFileChange('change', filePath))
      watcher.on('unlink', (filePath) => broadcastFileChange('unlink', filePath))
      watcher.on('addDir', (dirPath) => broadcastFileChange('addDir', dirPath))
      watcher.on('unlinkDir', (dirPath) => broadcastFileChange('unlinkDir', dirPath))
      watcher.on('error', (err) => {
        console.error('[watcher] error:', err)
      })

      watchers.set(dirPath, watcher)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('files:watchDir')

  ipcMain.handle('files:unwatchDir', async (_event, dirPath: string) => {
    const watcher = watchers.get(dirPath)
    if (watcher) {
      await watcher.close()
      watchers.delete(dirPath)
    }
    return { success: true }
  })
  channels.push('files:unwatchDir')

  ipcMain.handle('files:createFile', async (_event, filePath: string, content?: string) => {
    try {
      // Ensure parent directory exists
      await fs.mkdir(path.dirname(filePath), { recursive: true })
      // Fail if file already exists
      try {
        await fs.access(filePath)
        return { success: false, error: 'File already exists' }
      } catch {
        // File does not exist — good
      }
      await fs.writeFile(filePath, content ?? '', 'utf-8')
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('files:createFile')

  ipcMain.handle('files:mkdir', async (_event, dirPath: string) => {
    try {
      try {
        await fs.access(dirPath)
        return { success: false, error: 'Directory already exists' }
      } catch {
        // Does not exist — good
      }
      await fs.mkdir(dirPath, { recursive: true })
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('files:mkdir')

  ipcMain.handle('files:rename', async (_event, oldPath: string, newPath: string) => {
    try {
      // Check that source exists
      await fs.access(oldPath)
      // Check that target does not exist
      try {
        await fs.access(newPath)
        return { success: false, error: 'A file or folder with that name already exists' }
      } catch {
        // Does not exist — good
      }
      await fs.rename(oldPath, newPath)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('files:rename')

  ipcMain.handle('files:writeFile', async (_event, filePath: string, data: Uint8Array) => {
    try {
      await fs.writeFile(filePath, data)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('files:writeFile')

  ipcMain.handle('files:saveFile', async (_event, filePath: string, content: string) => {
    try {
      await fs.writeFile(filePath, content, 'utf-8')
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('files:saveFile')

  ipcMain.handle('files:copyFile', async (_event, sourcePath: string, destPath: string) => {
    try {
      await fs.copyFile(sourcePath, destPath)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('files:copyFile')

  ipcMain.handle('files:delete', async (_event, targetPath: string) => {
    try {
      await shell.trashItem(targetPath)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('files:delete')

  ipcMain.handle('files:selectFolder', async (event) => {
    const result = await dialog.showOpenDialog(senderWindow(event), {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Project Folder'
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: true, cancelled: true, path: null }
    }

    return { success: true, cancelled: false, path: result.filePaths[0] }
  })
  channels.push('files:selectFolder')

  return channels
}

export function cleanupFileWatchers(): void {
  for (const [, watcher] of watchers) {
    watcher.close().catch(() => {})
  }
  watchers.clear()
}
