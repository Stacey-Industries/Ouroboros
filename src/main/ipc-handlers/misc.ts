/**
 * ipc-handlers/misc.ts — Updater, Cost, Crash logs, Perf, Shell history,
 * Symbol search, Window management, Extensions, LSP handlers
 */

import { ipcMain, shell, app, BrowserWindow, IpcMainInvokeEvent } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import { saveCostEntry, getCostHistory, clearCostHistory, CostEntry } from '../costHistory'
import { respondToApproval, addAlwaysAllowRule } from '../approvalManager'
import { getUsageSummary, getSessionDetail, getRecentSessionDetails, getWindowedUsage } from '../usageReader'
import { createWindow, setWindowProjectRoot, getWindowInfos, focusWindow, closeWindow } from '../windowManager'
import { startServer as lspStart, stopServer as lspStop, stopAllServers as lspStopAll, getCompletion as lspCompletion, getHover as lspHover, getDefinition as lspDefinition, getDiagnostics as lspDiagnostics, didOpen as lspDidOpen, didChange as lspDidChange, didClose as lspDidClose, getRunningServers as lspGetStatus, setMainWindow as lspSetMainWindow } from '../lsp'

type SenderWindow = (event: IpcMainInvokeEvent) => BrowserWindow

// Optional auto-updater
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let autoUpdater: any = null
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const m = require('electron-updater')
  autoUpdater = m.autoUpdater
} catch {
  // Not installed — no-op
}

export function registerMiscHandlers(senderWindow: SenderWindow, win: BrowserWindow): string[] {
  const channels: string[] = []

  // ─── Updater ──────────────────────────────────────────────────────────────

  ipcMain.handle('updater:check', async () => {
    if (!autoUpdater) {
      return { success: false, error: 'electron-updater not installed' }
    }
    try {
      await autoUpdater.checkForUpdates()
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('updater:check')

  ipcMain.handle('updater:download', async () => {
    if (!autoUpdater) {
      return { success: false, error: 'electron-updater not installed' }
    }
    try {
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('updater:download')

  ipcMain.handle('updater:install', () => {
    if (!autoUpdater) {
      return { success: false, error: 'electron-updater not installed' }
    }
    try {
      autoUpdater.quitAndInstall()
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('updater:install')

  // ─── Cost history ─────────────────────────────────────────────────────────

  ipcMain.handle('cost:addEntry', async (_event, entry: CostEntry) => {
    try {
      await saveCostEntry(entry)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('cost:addEntry')

  ipcMain.handle('cost:getHistory', async () => {
    try {
      const entries = await getCostHistory()
      return { success: true, entries }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('cost:getHistory')

  ipcMain.handle('cost:clearHistory', async () => {
    try {
      await clearCostHistory()
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('cost:clearHistory')

  // ─── Usage reader (Claude Code's local JSONL data) ──────────────────────

  ipcMain.handle('usage:getSummary', async (_event, options?: { projectFilter?: string; since?: number; maxSessions?: number }) => {
    try {
      const summary = await getUsageSummary(options)
      return { success: true, summary }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('usage:getSummary')

  ipcMain.handle('usage:getSessionDetail', async (_event, sessionId: string) => {
    try {
      const detail = await getSessionDetail(sessionId)
      return { success: true, detail }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('usage:getSessionDetail')

  ipcMain.handle('usage:getRecentSessions', async (_event, count?: number) => {
    try {
      const sessions = await getRecentSessionDetails(count ?? 3)
      return { success: true, sessions }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('usage:getRecentSessions')

  ipcMain.handle('usage:getWindowedUsage', async () => {
    try {
      const windowed = await getWindowedUsage()
      return { success: true, windowed }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('usage:getWindowedUsage')

  // ─── Crash logs ───────────────────────────────────────────────────────────

  const crashLogDir = path.join(app.getPath('userData'), 'crashes')

  ipcMain.handle('app:getCrashLogs', async () => {
    try {
      await fs.mkdir(crashLogDir, { recursive: true })
      const entries = await fs.readdir(crashLogDir)
      const logs = entries.filter((f) => f.endsWith('.log'))

      const results: Array<{ name: string; content: string; mtime: number }> = []
      for (const file of logs) {
        try {
          const fullPath = path.join(crashLogDir, file)
          const [content, stat] = await Promise.all([
            fs.readFile(fullPath, 'utf-8'),
            fs.stat(fullPath),
          ])
          results.push({ name: file, content, mtime: stat.mtime.getTime() })
        } catch {
          // Skip unreadable file
        }
      }

      results.sort((a, b) => b.mtime - a.mtime)
      return { success: true, logs: results }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('app:getCrashLogs')

  ipcMain.handle('app:clearCrashLogs', async () => {
    try {
      await fs.mkdir(crashLogDir, { recursive: true })
      const entries = await fs.readdir(crashLogDir)
      const logs = entries.filter((f) => f.endsWith('.log'))
      await Promise.all(logs.map((f) => fs.unlink(path.join(crashLogDir, f)).catch(() => {})))
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('app:clearCrashLogs')

  ipcMain.handle('app:openCrashLogDir', async () => {
    try {
      await fs.mkdir(crashLogDir, { recursive: true })
      shell.openPath(crashLogDir)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('app:openCrashLogDir')

  ipcMain.handle('app:logError', async (_event, source: string, message: string, stack?: string) => {
    try {
      await fs.mkdir(crashLogDir, { recursive: true })
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const file = path.join(crashLogDir, `crash-${timestamp}.log`)
      const content = [
        `Source: ${source}`,
        `Timestamp: ${new Date().toISOString()}`,
        `App version: ${app.getVersion()}`,
        `Platform: ${process.platform} ${process.arch}`,
        '',
        message,
        ...(stack ? ['', 'Stack:', stack] : []),
      ].join('\n')
      await fs.writeFile(file, content, 'utf-8')
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('app:logError')

  // ─── Performance ping/pong (latency probe) ─────────────────────────────────

  ipcMain.handle('perf:ping', () => {
    return { success: true, ts: Date.now() }
  })
  channels.push('perf:ping')

  // ─── Shell history ────────────────────────────────────────────────────────

  ipcMain.handle('shellHistory:read', async () => {
    const homeDir = app.getPath('home')
    // Try zsh_history first, then bash_history
    const candidates = [
      path.join(homeDir, '.zsh_history'),
      path.join(homeDir, '.bash_history'),
    ]
    for (const histPath of candidates) {
      try {
        const raw = await fs.readFile(histPath, 'utf-8')
        // zsh_history format: ": timestamp:elapsed;command" — strip metadata
        const lines = raw.split('\n')
        const commands: string[] = []
        for (const line of lines) {
          if (!line.trim()) continue
          // zsh extended history: ": 1234567890:0;the command"
          const zshMatch = line.match(/^:\s*\d+:\d+;(.+)$/)
          if (zshMatch) {
            commands.push(zshMatch[1])
          } else if (!line.startsWith(':')) {
            commands.push(line)
          }
        }
        // Deduplicate, reverse so most-recent is first, limit to 500
        const seen = new Set<string>()
        const deduped: string[] = []
        for (let i = commands.length - 1; i >= 0; i--) {
          const cmd = commands[i].trim()
          if (cmd && !seen.has(cmd)) {
            seen.add(cmd)
            deduped.push(cmd)
            if (deduped.length >= 500) break
          }
        }
        return { success: true, commands: deduped }
      } catch {
        // File not found or unreadable — try next
      }
    }
    return { success: true, commands: [] }
  })
  channels.push('shellHistory:read')

  // ─── Symbol search ────────────────────────────────────────────────────────

  const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.css'])
  const SYMBOL_IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'out', '__pycache__', '.next', '.cache', 'coverage', 'build'])
  const MAX_SYMBOL_FILES = 200
  const MAX_SYMBOLS = 5000

  interface SymbolEntry {
    name: string
    type: string
    filePath: string
    relativePath: string
    line: number
  }

  const SYMBOL_PATTERNS: Array<{ type: string; regex: RegExp }> = [
    { type: 'function',  regex: /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g },
    { type: 'class',     regex: /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/g },
    { type: 'interface', regex: /(?:export\s+)?interface\s+(\w+)/g },
    { type: 'type',      regex: /(?:export\s+)?type\s+(\w+)\s*=/g },
    { type: 'const',     regex: /(?:export\s+)?const\s+(\w+)\s*(?:=|:)/g },
    { type: 'def',       regex: /^def\s+(\w+)/gm },
    { type: 'fn',        regex: /(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/g },
  ]

  function extractSymbols(content: string, filePath: string, relativePath: string, symbols: SymbolEntry[], max: number): void {
    const lines = content.split('\n')
    // Build a line-start offset map for fast line lookup
    const lineStartOffsets: number[] = []
    let offset = 0
    for (const line of lines) {
      lineStartOffsets.push(offset)
      offset += line.length + 1 // +1 for the \n
    }

    function offsetToLine(charOffset: number): number {
      let lo = 0
      let hi = lineStartOffsets.length - 1
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1
        if (lineStartOffsets[mid] <= charOffset) lo = mid
        else hi = mid - 1
      }
      return lo + 1 // 1-based
    }

    for (const { type, regex } of SYMBOL_PATTERNS) {
      // Reset lastIndex before each use
      regex.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = regex.exec(content)) !== null) {
        if (symbols.length >= max) return
        const name = match[1]
        if (!name) continue
        const line = offsetToLine(match.index)
        symbols.push({ name, type, filePath, relativePath, line })
      }
    }
  }

  async function walkForSymbols(
    root: string,
    dirPath: string,
    symbols: SymbolEntry[],
    fileCount: { n: number }
  ): Promise<void> {
    if (fileCount.n >= MAX_SYMBOL_FILES || symbols.length >= MAX_SYMBOLS) return

    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true })
    } catch {
      return
    }

    const dirs: string[] = []

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!SYMBOL_IGNORE_DIRS.has(entry.name)) {
          dirs.push(path.join(dirPath, entry.name))
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (!SOURCE_EXTENSIONS.has(ext)) continue
        if (fileCount.n >= MAX_SYMBOL_FILES || symbols.length >= MAX_SYMBOLS) break

        const filePath = path.join(dirPath, entry.name)
        try {
          const stat = await fs.stat(filePath)
          if (stat.size > 500 * 1024) continue // skip files > 500KB

          const content = await fs.readFile(filePath, 'utf-8')
          const relativePath = path.relative(root, filePath).replace(/\\/g, '/')
          extractSymbols(content, filePath, relativePath, symbols, MAX_SYMBOLS)
          fileCount.n++
        } catch {
          // Skip unreadable files
        }
      }
    }

    for (const dir of dirs) {
      if (fileCount.n >= MAX_SYMBOL_FILES || symbols.length >= MAX_SYMBOLS) break
      await walkForSymbols(root, dir, symbols, fileCount)
    }
  }

  ipcMain.handle('symbol:search', async (_event, root: string): Promise<{ success: boolean; symbols?: SymbolEntry[]; error?: string }> => {
    try {
      const symbols: SymbolEntry[] = []
      const fileCount = { n: 0 }
      await walkForSymbols(root, root, symbols, fileCount)
      return { success: true, symbols }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })
  channels.push('symbol:search')

  // ─── Window management ──────────────────────────────────────────────────

  ipcMain.handle('window:new', (_event, projectRoot?: string) => {
    try {
      const newWin = createWindow(projectRoot)
      if (projectRoot) {
        setWindowProjectRoot(newWin.id, projectRoot)
      }
      return { success: true, windowId: newWin.id }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('window:new')

  ipcMain.handle('window:list', async () => {
    try {
      return { success: true, windows: getWindowInfos() }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('window:list')

  ipcMain.handle('window:focus', async (_event, windowId: number) => {
    try {
      focusWindow(windowId)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('window:focus')

  ipcMain.handle('window:close', async (_event, windowId: number) => {
    try {
      closeWindow(windowId)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('window:close')

  // ─── Extensions ───────────────────────────────────────────────────────────

  ipcMain.handle('extensions:list', async () => {
    try {
      const { listExtensions } = await import('../extensions')
      return { success: true, extensions: listExtensions() }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('extensions:list')

  ipcMain.handle('extensions:enable', async (_event, name: string) => {
    try {
      const { enableExtension } = await import('../extensions')
      return await enableExtension(name)
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('extensions:enable')

  ipcMain.handle('extensions:disable', async (_event, name: string) => {
    try {
      const { disableExtension } = await import('../extensions')
      return await disableExtension(name)
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('extensions:disable')

  ipcMain.handle('extensions:install', async (_event, sourcePath: string) => {
    try {
      const { installExtension } = await import('../extensions')
      return await installExtension(sourcePath)
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('extensions:install')

  ipcMain.handle('extensions:uninstall', async (_event, name: string) => {
    try {
      const { uninstallExtension } = await import('../extensions')
      return await uninstallExtension(name)
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('extensions:uninstall')

  ipcMain.handle('extensions:getLog', async (_event, name: string) => {
    try {
      const { getExtensionLog } = await import('../extensions')
      return getExtensionLog(name)
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('extensions:getLog')

  ipcMain.handle('extensions:openFolder', async () => {
    try {
      const { getExtensionsDirPath } = await import('../extensions')
      const extensionsPath = getExtensionsDirPath()
      await fs.mkdir(extensionsPath, { recursive: true })
      await shell.openPath(extensionsPath)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('extensions:openFolder')

  ipcMain.handle('extensions:activate', async (_event, name: string) => {
    try {
      const { forceActivateExtension } = await import('../extensions')
      return await forceActivateExtension(name)
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('extensions:activate')

  ipcMain.handle('extensions:commandExecuted', async (_event, commandId: string) => {
    try {
      const { dispatchCommandEvent } = await import('../extensions')
      await dispatchCommandEvent(commandId)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('extensions:commandExecuted')

  // ─── LSP ─────────────────────────────────────────────────────────────────

  // Set the main window reference for LSP diagnostics broadcasting
  lspSetMainWindow(win)

  ipcMain.handle('lsp:start', async (_event, root: string, language: string) => {
    return await lspStart(root, language)
  })
  channels.push('lsp:start')

  ipcMain.handle('lsp:stop', async (_event, root: string, language: string) => {
    return await lspStop(root, language)
  })
  channels.push('lsp:stop')

  ipcMain.handle('lsp:completion', async (_event, root: string, filePath: string, line: number, character: number) => {
    return await lspCompletion(root, filePath, line, character)
  })
  channels.push('lsp:completion')

  ipcMain.handle('lsp:hover', async (_event, root: string, filePath: string, line: number, character: number) => {
    return await lspHover(root, filePath, line, character)
  })
  channels.push('lsp:hover')

  ipcMain.handle('lsp:definition', async (_event, root: string, filePath: string, line: number, character: number) => {
    return await lspDefinition(root, filePath, line, character)
  })
  channels.push('lsp:definition')

  ipcMain.handle('lsp:diagnostics', async (_event, root: string, filePath: string) => {
    return lspDiagnostics(root, filePath)
  })
  channels.push('lsp:diagnostics')

  ipcMain.handle('lsp:didOpen', async (_event, root: string, filePath: string, content: string) => {
    await lspDidOpen(root, filePath, content)
  })
  channels.push('lsp:didOpen')

  ipcMain.handle('lsp:didChange', async (_event, root: string, filePath: string, content: string) => {
    await lspDidChange(root, filePath, content)
  })
  channels.push('lsp:didChange')

  ipcMain.handle('lsp:didClose', async (_event, root: string, filePath: string) => {
    await lspDidClose(root, filePath)
  })
  channels.push('lsp:didClose')

  ipcMain.handle('lsp:getStatus', async () => {
    return { success: true, servers: lspGetStatus() }
  })
  channels.push('lsp:getStatus')

  // ─── Approval ────────────────────────────────────────────────────────────

  ipcMain.handle('approval:respond', async (_event, requestId: string, decision: 'approve' | 'reject', reason?: string) => {
    try {
      const ok = respondToApproval(requestId, { decision, reason })
      return { success: ok, error: ok ? undefined : 'Failed to write response file' }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('approval:respond')

  ipcMain.handle('approval:alwaysAllow', async (_event, sessionId: string, toolName: string) => {
    try {
      addAlwaysAllowRule(sessionId, toolName)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('approval:alwaysAllow')

  return channels
}

export { lspStopAll }
