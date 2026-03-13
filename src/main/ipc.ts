/**
 * ipc.ts — Registers all ipcMain handlers for the main process.
 *
 * Channels mirror the contextBridge API shape in preload.ts.
 * All handlers return serialisable values (no class instances).
 */

import { ipcMain, dialog, shell, app, BrowserWindow, Notification } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import { execFile } from 'child_process'
import chokidar, { FSWatcher } from 'chokidar'
import { spawnPty, spawnClaudePty, writeToPty, resizePty, killPty, getPtyCwd, startPtyRecording, stopPtyRecording, getActiveSessions } from './pty'
import { getConfig, getConfigValue, setConfigValue, store, AppConfig } from './config'
import { createWindow, setWindowProjectRoot, getWindowInfos, focusWindow, closeWindow } from './windowManager'
import { saveCostEntry, getCostHistory, clearCostHistory, CostEntry } from './costHistory'
import { startServer as lspStart, stopServer as lspStop, stopAllServers as lspStopAll, getCompletion as lspCompletion, getHover as lspHover, getDefinition as lspDefinition, getDiagnostics as lspDiagnostics, didOpen as lspDidOpen, didChange as lspDidChange, didClose as lspDidClose, getRunningServers as lspGetStatus, setMainWindow as lspSetMainWindow } from './lsp'

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

// Active file watchers keyed by watched path
const watchers = new Map<string, FSWatcher>()

// Settings file watcher
let settingsFileWatcher: FSWatcher | null = null

// ─── Unified diff parser ─────────────────────────────────────────────────────

interface ParsedHunk {
  header: string
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  lines: string[]
  rawPatch: string
}

interface ParsedFileDiff {
  filePath: string
  relativePath: string
  status: 'modified' | 'added' | 'deleted' | 'renamed'
  hunks: ParsedHunk[]
  oldPath?: string
}

function parseDiffOutput(diffText: string, root: string): ParsedFileDiff[] {
  if (!diffText.trim()) return []

  const files: ParsedFileDiff[] = []
  // Split on "diff --git" boundaries
  const fileDiffs = diffText.split(/^(?=diff --git )/m).filter(Boolean)

  for (const fileDiff of fileDiffs) {
    const lines = fileDiff.split('\n')
    if (lines.length === 0) continue

    // Parse the "diff --git a/path b/path" header
    const headerMatch = lines[0].match(/^diff --git a\/(.+?) b\/(.+)$/)
    if (!headerMatch) continue

    const aPath = headerMatch[1]
    const bPath = headerMatch[2]
    const relativePath = bPath

    // Determine file status from the index/mode lines
    let status: 'modified' | 'added' | 'deleted' | 'renamed' = 'modified'
    let oldPath: string | undefined

    for (const line of lines.slice(1, 6)) {
      if (line.startsWith('new file mode')) {
        status = 'added'
      } else if (line.startsWith('deleted file mode')) {
        status = 'deleted'
      } else if (line.startsWith('rename from')) {
        status = 'renamed'
        oldPath = line.replace('rename from ', '')
      }
    }

    if (aPath !== bPath && !oldPath) {
      status = 'renamed'
      oldPath = aPath
    }

    // Find diff header block (everything before the first hunk) for rawPatch prefix
    let diffHeaderEnd = 0
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].startsWith('@@')) {
        diffHeaderEnd = i
        break
      }
    }
    // If no hunks found, diffHeaderEnd stays 0 — the file might be binary or empty
    const diffHeader = lines.slice(0, diffHeaderEnd).join('\n') + '\n'

    // Parse hunks
    const hunks: ParsedHunk[] = []
    let i = diffHeaderEnd

    while (i < lines.length) {
      if (lines[i].startsWith('@@')) {
        const hunkHeader = lines[i]
        const hunkMatch = hunkHeader.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
        if (!hunkMatch) { i++; continue }

        const oldStart = parseInt(hunkMatch[1], 10)
        const oldCount = hunkMatch[2] !== undefined ? parseInt(hunkMatch[2], 10) : 1
        const newStart = parseInt(hunkMatch[3], 10)
        const newCount = hunkMatch[4] !== undefined ? parseInt(hunkMatch[4], 10) : 1

        // Collect all lines belonging to this hunk
        const hunkLines: string[] = []
        i++
        while (i < lines.length && !lines[i].startsWith('@@') && !lines[i].startsWith('diff --git')) {
          hunkLines.push(lines[i])
          i++
        }

        // Build rawPatch: diff header + this single hunk (for git apply)
        const rawPatch = diffHeader + hunkHeader + '\n' + hunkLines.join('\n') + '\n'

        hunks.push({
          header: hunkHeader,
          oldStart,
          oldCount,
          newStart,
          newCount,
          lines: hunkLines,
          rawPatch,
        })
      } else {
        i++
      }
    }

    files.push({
      filePath: path.resolve(root, relativePath),
      relativePath,
      status,
      hunks,
      oldPath,
    })
  }

  return files
}

// ─── Session markdown formatter ───────────────────────────────────────────────

function buildMarkdown(s: Record<string, unknown>): string {
  const lines: string[] = []

  const id = typeof s['id'] === 'string' ? s['id'] : 'unknown'
  const label = typeof s['taskLabel'] === 'string' ? s['taskLabel'] : 'Unknown task'
  const status = typeof s['status'] === 'string' ? s['status'] : 'unknown'
  const model = typeof s['model'] === 'string' ? s['model'] : undefined
  const startedAt = typeof s['startedAt'] === 'number' ? new Date(s['startedAt']).toISOString() : 'unknown'
  const completedAt = typeof s['completedAt'] === 'number' ? new Date(s['completedAt']).toISOString() : undefined
  const inputTokens = typeof s['inputTokens'] === 'number' ? s['inputTokens'] : 0
  const outputTokens = typeof s['outputTokens'] === 'number' ? s['outputTokens'] : 0
  const error = typeof s['error'] === 'string' ? s['error'] : undefined

  lines.push(`# Session: ${label}`)
  lines.push('')
  lines.push('## Session Info')
  lines.push('')
  lines.push(`| Field | Value |`)
  lines.push(`|-------|-------|`)
  lines.push(`| ID | \`${id}\` |`)
  lines.push(`| Status | ${status} |`)
  if (model) lines.push(`| Model | ${model} |`)
  lines.push(`| Started | ${startedAt} |`)
  if (completedAt) lines.push(`| Completed | ${completedAt} |`)
  lines.push(`| Input Tokens | ${inputTokens.toLocaleString()} |`)
  lines.push(`| Output Tokens | ${outputTokens.toLocaleString()} |`)
  if (error) {
    lines.push('')
    lines.push('## Error')
    lines.push('')
    lines.push('```')
    lines.push(error)
    lines.push('```')
  }

  const toolCalls = Array.isArray(s['toolCalls']) ? s['toolCalls'] as Record<string, unknown>[] : []

  if (toolCalls.length > 0) {
    lines.push('')
    lines.push('## Tool Calls')
    lines.push('')
    lines.push('| # | Tool | Input | Status | Duration |')
    lines.push('|---|------|-------|--------|----------|')

    toolCalls.forEach((tc, i) => {
      const toolName = typeof tc['toolName'] === 'string' ? tc['toolName'] : ''
      const input = typeof tc['input'] === 'string' ? tc['input'].replace(/\|/g, '\\|') : ''
      const tcStatus = typeof tc['status'] === 'string' ? tc['status'] : ''
      const duration = typeof tc['duration'] === 'number' ? `${tc['duration']}ms` : '-'
      lines.push(`| ${i + 1} | ${toolName} | ${input} | ${tcStatus} | ${duration} |`)
    })

    lines.push('')
    lines.push('## Full Event Log')
    lines.push('')

    toolCalls.forEach((tc, i) => {
      const toolName = typeof tc['toolName'] === 'string' ? tc['toolName'] : 'Unknown'
      const tcStatus = typeof tc['status'] === 'string' ? tc['status'] : ''
      const timestamp = typeof tc['timestamp'] === 'number' ? new Date(tc['timestamp']).toISOString() : ''

      lines.push(`### ${i + 1}. ${toolName} (${tcStatus})`)
      lines.push('')
      if (timestamp) lines.push(`**Time:** ${timestamp}`)
      lines.push('')

      const input = typeof tc['input'] === 'string' ? tc['input'] : ''
      if (input) {
        lines.push('**Input:**')
        lines.push('')
        lines.push('```')
        lines.push(input)
        lines.push('```')
        lines.push('')
      }

      const output = typeof tc['output'] === 'string' ? tc['output'] : undefined
      if (output) {
        const truncated = output.length > 2000 ? output.slice(0, 2000) + '\n...(truncated)' : output
        lines.push('**Output:**')
        lines.push('')
        lines.push('```')
        lines.push(truncated)
        lines.push('```')
        lines.push('')
      }
    })
  }

  return lines.join('\n')
}

/** Resolve the BrowserWindow that sent an IPC event. */
function senderWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) throw new Error('IPC event from unknown window')
  return win
}

let handlersRegistered = false

/**
 * Register all ipcMain handlers. Handlers are registered globally (once) and
 * use `event.sender` to determine the calling window. Returns a cleanup
 * function that removes the handlers; only the *last* cleanup call actually
 * unregisters (since handlers are shared across windows).
 */
export function registerIpcHandlers(win: BrowserWindow): () => void {
  if (handlersRegistered) {
    // Handlers already registered — return no-op cleanup.
    // Actual cleanup happens in cleanupIpcHandlers().
    return () => { /* no-op — handled globally */ }
  }
  handlersRegistered = true

  // ─── PTY ──────────────────────────────────────────────────────────────────

  ipcMain.handle(
    'pty:spawn',
    (event, id: string, options: { cwd?: string; cols?: number; rows?: number; startupCommand?: string }) => {
      return spawnPty(id, senderWindow(event), options)
    }
  )

  ipcMain.handle(
    'pty:spawnClaude',
    (event, id: string, options: { cwd?: string; cols?: number; rows?: number; initialPrompt?: string; cliOverrides?: Record<string, unknown> }) => {
      const win = senderWindow(event)
      const baseSettings = getConfigValue('claudeCliSettings')
      const settings = options?.cliOverrides
        ? { ...baseSettings, ...options.cliOverrides } as typeof baseSettings
        : baseSettings
      return spawnClaudePty(id, win, settings, options)
    }
  )

  ipcMain.handle('pty:write', (_event, id: string, data: string) => {
    return writeToPty(id, data)
  })

  ipcMain.handle('pty:resize', (_event, id: string, cols: number, rows: number) => {
    return resizePty(id, cols, rows)
  })

  ipcMain.handle('pty:kill', (_event, id: string) => {
    return killPty(id)
  })

  ipcMain.handle('pty:getCwd', (_event, id: string) => {
    return getPtyCwd(id)
  })

  ipcMain.handle('pty:startRecording', (event, id: string) => {
    return startPtyRecording(id, senderWindow(event))
  })

  ipcMain.handle('pty:stopRecording', (event, id: string) => {
    return stopPtyRecording(id, senderWindow(event))
  })

  ipcMain.handle('pty:listSessions', () => {
    return getActiveSessions()
  })

  // ─── Config ───────────────────────────────────────────────────────────────

  ipcMain.handle('config:getAll', () => {
    return getConfig()
  })

  ipcMain.handle('config:get', (_event, key: keyof AppConfig) => {
    return getConfigValue(key)
  })

  ipcMain.handle('config:set', (_event, key: keyof AppConfig, value: AppConfig[typeof key]) => {
    try {
      setConfigValue(key, value)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ─── Config export ────────────────────────────────────────────────────────

  ipcMain.handle('config:export', async (event) => {
    try {
      const result = await dialog.showSaveDialog(senderWindow(event), {
        title: 'Export Settings',
        defaultPath: 'agent-ide-settings.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })
      if (result.canceled || !result.filePath) {
        return { success: true, cancelled: true }
      }
      const config = getConfig()
      await fs.writeFile(result.filePath, JSON.stringify(config, null, 2), 'utf-8')
      return { success: true, filePath: result.filePath }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ─── Config import ────────────────────────────────────────────────────────

  ipcMain.handle('config:import', async (event) => {
    try {
      const result = await dialog.showOpenDialog(senderWindow(event), {
        title: 'Import Settings',
        filters: [{ name: 'JSON', extensions: ['json'] }],
        properties: ['openFile'],
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { success: true, cancelled: true }
      }
      const raw = await fs.readFile(result.filePaths[0], 'utf-8')
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        return { success: false, error: 'File is not valid JSON.' }
      }
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return { success: false, error: 'Settings file must be a JSON object.' }
      }
      // Apply only known config keys
      const knownKeys: (keyof AppConfig)[] = [
        'recentProjects', 'defaultProjectRoot', 'activeTheme', 'hooksServerPort',
        'terminalFontSize', 'autoInstallHooks', 'shell', 'panelSizes', 'windowBounds',
        'fontUI', 'fontMono', 'fontSizeUI', 'keybindings', 'showBgGradient',
        'customThemeColors', 'terminalSessions',
      ]
      const incoming = parsed as Record<string, unknown>
      for (const key of knownKeys) {
        if (key in incoming) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            setConfigValue(key, incoming[key] as any)
          } catch {
            // skip keys that fail schema validation
          }
        }
      }
      const merged = getConfig()
      return { success: true, config: merged }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ─── Open settings.json file ──────────────────────────────────────────────

  const settingsFilePath = path.join(app.getPath('userData'), 'settings.json')

  async function writeSettingsFile(): Promise<void> {
    const config = getConfig()
    await fs.writeFile(settingsFilePath, JSON.stringify(config, null, 2), 'utf-8')
  }

  function startSettingsFileWatcher(): void {
    if (settingsFileWatcher) return

    settingsFileWatcher = chokidar.watch(settingsFilePath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
    })

    settingsFileWatcher.on('change', async () => {
      try {
        const raw = await fs.readFile(settingsFilePath, 'utf-8')
        const parsed = JSON.parse(raw)
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return

        const knownKeys: (keyof AppConfig)[] = [
          'recentProjects', 'defaultProjectRoot', 'activeTheme', 'hooksServerPort',
          'terminalFontSize', 'autoInstallHooks', 'shell', 'panelSizes', 'windowBounds',
          'fontUI', 'fontMono', 'fontSizeUI', 'keybindings', 'showBgGradient',
          'customThemeColors', 'terminalSessions', 'customCSS', 'bookmarks',
          'fileTreeIgnorePatterns', 'profiles',
        ]
        const incoming = parsed as Record<string, unknown>
        for (const key of knownKeys) {
          if (key in incoming) {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              setConfigValue(key, incoming[key] as any)
            } catch {
              // skip invalid values
            }
          }
        }
        // Notify all renderer windows of the external change
        const updated = getConfig()
        for (const bw of BrowserWindow.getAllWindows()) {
          if (!bw.isDestroyed()) {
            bw.webContents.send('config:externalChange', updated)
          }
        }
      } catch {
        // Ignore parse errors from in-progress edits
      }
    })
  }

  ipcMain.handle('config:openSettingsFile', async () => {
    try {
      await writeSettingsFile()
      startSettingsFileWatcher()
      await shell.openPath(settingsFilePath)
      return { success: true, filePath: settingsFilePath }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ─── Files ────────────────────────────────────────────────────────────────

  ipcMain.handle('files:readFile', async (_event, filePath: string) => {
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      return { success: true, content }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

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

  ipcMain.handle('files:unwatchDir', async (_event, dirPath: string) => {
    const watcher = watchers.get(dirPath)
    if (watcher) {
      await watcher.close()
      watchers.delete(dirPath)
    }
    return { success: true }
  })

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

  ipcMain.handle('files:writeFile', async (_event, filePath: string, data: Uint8Array) => {
    try {
      await fs.writeFile(filePath, data)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('files:copyFile', async (_event, sourcePath: string, destPath: string) => {
    try {
      await fs.copyFile(sourcePath, destPath)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('files:delete', async (_event, targetPath: string) => {
    try {
      await shell.trashItem(targetPath)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

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

  // ─── Git ──────────────────────────────────────────────────────────────────

  ipcMain.handle('git:isRepo', (_event, root: string) => {
    return new Promise((resolve) => {
      execFile('git', ['rev-parse', '--git-dir'], { cwd: root }, (err) => {
        if (err) {
          resolve({ success: true, isRepo: false })
        } else {
          resolve({ success: true, isRepo: true })
        }
      })
    })
  })

  ipcMain.handle('git:status', (_event, root: string) => {
    return new Promise((resolve) => {
      execFile(
        'git',
        ['status', '--porcelain=v1'],
        { cwd: root, maxBuffer: 1024 * 1024 },
        (err, stdout) => {
          if (err) {
            resolve({ success: false, error: err.message })
            return
          }

          const files: Record<string, string> = {}
          const lines = stdout.split('\n').filter((l) => l.length > 0)

          for (const line of lines) {
            const indexStatus = line[0]
            const workTreeStatus = line[1]
            let filePath = line.slice(3)

            // Handle renames: "R  old -> new"
            const arrowIdx = filePath.indexOf(' -> ')
            if (arrowIdx !== -1) {
              filePath = filePath.slice(arrowIdx + 4)
            }

            // Normalise path separators
            filePath = filePath.replace(/\\/g, '/')

            // Determine the effective status
            let status: string
            if (indexStatus === '?' && workTreeStatus === '?') {
              status = '?'
            } else if (indexStatus === 'R' || workTreeStatus === 'R') {
              status = 'R'
            } else if (indexStatus === 'A' || workTreeStatus === 'A') {
              status = 'A'
            } else if (indexStatus === 'D' || workTreeStatus === 'D') {
              status = 'D'
            } else if (
              indexStatus === 'M' ||
              workTreeStatus === 'M' ||
              indexStatus === 'U' ||
              workTreeStatus === 'U'
            ) {
              status = 'M'
            } else {
              status = 'M' // fallback for any other combo
            }

            files[filePath] = status
          }

          resolve({ success: true, files })
        }
      )
    })
  })

  ipcMain.handle('git:branch', (_event, root: string) => {
    return new Promise((resolve) => {
      execFile(
        'git',
        ['rev-parse', '--abbrev-ref', 'HEAD'],
        { cwd: root },
        (err, stdout) => {
          if (err) {
            resolve({ success: false, error: err.message })
            return
          }
          resolve({ success: true, branch: stdout.trim() })
        }
      )
    })
  })

  ipcMain.handle('git:diff', (_event, root: string, filePath: string) => {
    return new Promise((resolve) => {
      execFile(
        'git',
        ['diff', 'HEAD', '--', filePath],
        { cwd: root, maxBuffer: 1024 * 1024 * 4 },
        (err, stdout) => {
          if (err) {
            // Could be a new untracked file or not a git repo — return empty
            resolve({ success: true, lines: [] })
            return
          }

          const diffLines: Array<{ line: number; kind: string }> = []

          // Parse unified diff to extract line info
          const hunks = stdout.split(/^@@\s/m)
          for (let h = 1; h < hunks.length; h++) {
            const hunk = hunks[h]
            // Parse hunk header: -oldStart[,oldCount] +newStart[,newCount] @@
            const headerMatch = hunk.match(
              /^-(\d+)(?:,(\d+))?\s\+(\d+)(?:,(\d+))?\s@@/
            )
            if (!headerMatch) continue

            const oldCount = headerMatch[2] != null ? parseInt(headerMatch[2], 10) : 1
            const newStart = parseInt(headerMatch[3], 10)

            // Get the lines after the header
            const headerEnd = hunk.indexOf('\n')
            if (headerEnd === -1) continue
            const body = hunk.slice(headerEnd + 1)
            const bodyLines = body.split('\n')

            let newLine = newStart
            let oldLine = parseInt(headerMatch[1], 10)
            // Track which new-side lines had a preceding removal to detect modifications
            const removedOldLines = new Set<number>()

            // First pass: collect removed old line numbers
            let tmpOld = oldLine
            for (const bl of bodyLines) {
              if (bl.startsWith('-')) {
                removedOldLines.add(tmpOld)
                tmpOld++
              } else if (bl.startsWith('+')) {
                // skip
              } else if (!bl.startsWith('\\')) {
                tmpOld++
              }
            }

            // Second pass: classify each line
            let curOld = oldLine
            let consecutiveRemoves = 0
            for (const bl of bodyLines) {
              if (bl.startsWith('-')) {
                consecutiveRemoves++
                curOld++
              } else if (bl.startsWith('+')) {
                if (consecutiveRemoves > 0) {
                  // This addition replaces a removal => modified
                  diffLines.push({ line: newLine, kind: 'modified' })
                  consecutiveRemoves--
                } else {
                  diffLines.push({ line: newLine, kind: 'added' })
                }
                newLine++
              } else if (bl.startsWith('\\')) {
                // "No newline at end of file" — ignore
              } else {
                // Context line — flush any remaining removals as deletions
                if (consecutiveRemoves > 0) {
                  // Mark deletion at the line before (the context line)
                  diffLines.push({ line: newLine, kind: 'deleted' })
                  consecutiveRemoves = 0
                }
                newLine++
                curOld++
              }
            }

            // Flush trailing removals (deletions at end of hunk)
            if (consecutiveRemoves > 0) {
              diffLines.push({ line: newLine > newStart ? newLine - 1 : newLine, kind: 'deleted' })
            }
          }

          resolve({ success: true, lines: diffLines })
        }
      )
    })
  })

  ipcMain.handle('git:log', (_event, root: string, filePath: string, offset: number = 0) => {
    return new Promise((resolve) => {
      execFile(
        'git',
        [
          'log',
          '--pretty=format:%H|%an|%ae|%ad|%s',
          '--date=short',
          '-n', '50',
          `--skip=${offset}`,
          '--',
          filePath,
        ],
        { cwd: root, maxBuffer: 1024 * 1024 * 2 },
        (err, stdout) => {
          if (err) {
            resolve({ success: false, error: err.message })
            return
          }

          const commits: Array<{
            hash: string
            author: string
            email: string
            date: string
            message: string
          }> = []

          const lines = stdout.split('\n').filter((l) => l.trim().length > 0)
          for (const line of lines) {
            const idx1 = line.indexOf('|')
            const idx2 = line.indexOf('|', idx1 + 1)
            const idx3 = line.indexOf('|', idx2 + 1)
            const idx4 = line.indexOf('|', idx3 + 1)
            if (idx1 === -1 || idx2 === -1 || idx3 === -1 || idx4 === -1) continue
            commits.push({
              hash: line.slice(0, idx1),
              author: line.slice(idx1 + 1, idx2),
              email: line.slice(idx2 + 1, idx3),
              date: line.slice(idx3 + 1, idx4),
              message: line.slice(idx4 + 1),
            })
          }

          resolve({ success: true, commits })
        }
      )
    })
  })

  ipcMain.handle('git:show', (_event, root: string, hash: string, filePath: string) => {
    return new Promise((resolve) => {
      execFile(
        'git',
        ['show', `${hash}`, '--', filePath],
        { cwd: root, maxBuffer: 1024 * 1024 * 4 },
        (err, stdout) => {
          if (err) {
            resolve({ success: false, error: err.message })
            return
          }
          resolve({ success: true, patch: stdout })
        }
      )
    })
  })

  ipcMain.handle('git:branches', (_event, root: string) => {
    return new Promise((resolve) => {
      execFile(
        'git',
        ['branch', '-a', '--format=%(refname:short)'],
        { cwd: root, maxBuffer: 1024 * 1024 },
        (err, stdout) => {
          if (err) {
            resolve({ success: false, error: err.message })
            return
          }
          const branches = stdout
            .split('\n')
            .map((b) => b.trim())
            .filter((b) => b.length > 0)
          resolve({ success: true, branches })
        }
      )
    })
  })

  ipcMain.handle('git:checkout', (_event, root: string, branch: string) => {
    return new Promise((resolve) => {
      execFile(
        'git',
        ['checkout', branch],
        { cwd: root },
        (err, _stdout, stderr) => {
          if (err) {
            resolve({ success: false, error: stderr.trim() || err.message })
            return
          }
          resolve({ success: true })
        }
      )
    })
  })

  ipcMain.handle('git:stage', (_event, root: string, filePath: string) => {
    return new Promise((resolve) => {
      execFile(
        'git',
        ['add', filePath],
        { cwd: root },
        (err, _stdout, stderr) => {
          if (err) {
            resolve({ success: false, error: stderr.trim() || err.message })
            return
          }
          resolve({ success: true })
        }
      )
    })
  })

  ipcMain.handle('git:unstage', (_event, root: string, filePath: string) => {
    return new Promise((resolve) => {
      execFile(
        'git',
        ['restore', '--staged', filePath],
        { cwd: root },
        (err, _stdout, stderr) => {
          if (err) {
            resolve({ success: false, error: stderr.trim() || err.message })
            return
          }
          resolve({ success: true })
        }
      )
    })
  })

  // ─── Git panel handlers ────────────────────────────────────────────────────

  ipcMain.handle('git:statusDetailed', (_event, root: string) => {
    return new Promise((resolve) => {
      execFile(
        'git',
        ['status', '--porcelain=v1'],
        { cwd: root, maxBuffer: 1024 * 1024 },
        (err, stdout) => {
          if (err) {
            resolve({ success: false, error: err.message })
            return
          }

          const staged: Record<string, string> = {}
          const unstaged: Record<string, string> = {}
          const lines = stdout.split('\n').filter((l) => l.length > 0)

          for (const line of lines) {
            const indexStatus = line[0]
            const workTreeStatus = line[1]
            let filePath = line.slice(3)

            // Handle renames: "R  old -> new"
            const arrowIdx = filePath.indexOf(' -> ')
            if (arrowIdx !== -1) {
              filePath = filePath.slice(arrowIdx + 4)
            }

            // Normalise path separators
            filePath = filePath.replace(/\\/g, '/')

            // Index (staged) status
            if (indexStatus !== ' ' && indexStatus !== '?') {
              staged[filePath] = indexStatus
            }

            // Worktree (unstaged) status
            if (workTreeStatus !== ' ' && workTreeStatus !== undefined) {
              if (indexStatus === '?' && workTreeStatus === '?') {
                unstaged[filePath] = '?'
              } else if (workTreeStatus !== '?') {
                unstaged[filePath] = workTreeStatus
              }
            }
          }

          resolve({ success: true, staged, unstaged })
        }
      )
    })
  })

  ipcMain.handle('git:commit', (_event, root: string, message: string) => {
    return new Promise((resolve) => {
      execFile('git', ['commit', '-m', message], { cwd: root }, (err, _stdout, stderr) => {
        if (err) {
          resolve({ success: false, error: stderr.trim() || err.message })
          return
        }
        resolve({ success: true })
      })
    })
  })

  ipcMain.handle('git:stageAll', (_event, root: string) => {
    return new Promise((resolve) => {
      execFile('git', ['add', '-A'], { cwd: root }, (err, _stdout, stderr) => {
        if (err) {
          resolve({ success: false, error: stderr.trim() || err.message })
          return
        }
        resolve({ success: true })
      })
    })
  })

  ipcMain.handle('git:unstageAll', (_event, root: string) => {
    return new Promise((resolve) => {
      execFile('git', ['reset', 'HEAD'], { cwd: root }, (err, _stdout, stderr) => {
        if (err) {
          resolve({ success: false, error: stderr.trim() || err.message })
          return
        }
        resolve({ success: true })
      })
    })
  })

  ipcMain.handle('git:discardFile', (_event, root: string, filePath: string) => {
    return new Promise((resolve) => {
      // First check if the file is untracked
      execFile(
        'git',
        ['ls-files', '--error-unmatch', filePath],
        { cwd: root },
        (lsErr) => {
          if (lsErr) {
            // File is untracked — remove it
            const fullPath = require('path').resolve(root, filePath)
            require('fs').unlink(fullPath, (unlinkErr: NodeJS.ErrnoException | null) => {
              if (unlinkErr) {
                resolve({ success: false, error: unlinkErr.message })
                return
              }
              resolve({ success: true })
            })
          } else {
            // File is tracked — checkout from HEAD
            execFile(
              'git',
              ['checkout', 'HEAD', '--', filePath],
              { cwd: root },
              (err, _stdout, stderr) => {
                if (err) {
                  resolve({ success: false, error: stderr.trim() || err.message })
                  return
                }
                resolve({ success: true })
              }
            )
          }
        }
      )
    })
  })

  // ─── Diff Review handlers ──────────────────────────────────────────────────

  ipcMain.handle('git:snapshot', (_event, root: string) => {
    return new Promise((resolve) => {
      execFile('git', ['rev-parse', 'HEAD'], { cwd: root }, (err, stdout) => {
        if (err) {
          resolve({ success: false, error: err.message })
          return
        }
        resolve({ success: true, commitHash: stdout.trim() })
      })
    })
  })

  ipcMain.handle('git:diffReview', (_event, root: string, commitHash: string) => {
    return new Promise((resolve) => {
      // Get unified diff since the snapshot commit (includes untracked via diff against empty tree trick)
      execFile(
        'git',
        ['diff', commitHash, '--unified=3', '--no-color'],
        { cwd: root, maxBuffer: 1024 * 1024 * 10 },
        (err, stdout) => {
          if (err) {
            resolve({ success: false, error: err.message })
            return
          }

          const files = parseDiffOutput(stdout, root)
          resolve({ success: true, files })
        }
      )
    })
  })

  ipcMain.handle('git:fileAtCommit', (_event, root: string, commitHash: string, filePath: string) => {
    return new Promise((resolve) => {
      // Convert absolute path to relative for git show
      const relPath = path.relative(root, filePath).replace(/\\/g, '/')
      execFile(
        'git',
        ['show', `${commitHash}:${relPath}`],
        { cwd: root, maxBuffer: 1024 * 1024 * 4 },
        (err, stdout) => {
          if (err) {
            // File didn't exist at that commit (new file)
            resolve({ success: true, content: '' })
            return
          }
          resolve({ success: true, content: stdout })
        }
      )
    })
  })

  ipcMain.handle('git:applyHunk', (_event, root: string, patchContent: string) => {
    return new Promise((resolve) => {
      const tmpFile = path.join(app.getPath('temp'), `ouroboros-hunk-${Date.now()}.patch`)
      void fs.writeFile(tmpFile, patchContent, 'utf-8').then(() => {
        execFile(
          'git',
          ['apply', '--whitespace=nowarn', tmpFile],
          { cwd: root },
          (err, _stdout, stderr) => {
            void fs.unlink(tmpFile).catch(() => {})
            if (err) {
              resolve({ success: false, error: stderr.trim() || err.message })
              return
            }
            resolve({ success: true })
          }
        )
      }).catch((writeErr) => {
        resolve({ success: false, error: writeErr instanceof Error ? writeErr.message : String(writeErr) })
      })
    })
  })

  ipcMain.handle('git:revertHunk', (_event, root: string, patchContent: string) => {
    return new Promise((resolve) => {
      const tmpFile = path.join(app.getPath('temp'), `ouroboros-hunk-${Date.now()}.patch`)
      void fs.writeFile(tmpFile, patchContent, 'utf-8').then(() => {
        execFile(
          'git',
          ['apply', '-R', '--whitespace=nowarn', tmpFile],
          { cwd: root },
          (err, _stdout, stderr) => {
            void fs.unlink(tmpFile).catch(() => {})
            if (err) {
              resolve({ success: false, error: stderr.trim() || err.message })
              return
            }
            resolve({ success: true })
          }
        )
      }).catch((writeErr) => {
        resolve({ success: false, error: writeErr instanceof Error ? writeErr.message : String(writeErr) })
      })
    })
  })

  ipcMain.handle('git:revertFile', (_event, root: string, commitHash: string, filePath: string) => {
    return new Promise((resolve) => {
      execFile(
        'git',
        ['checkout', commitHash, '--', filePath],
        { cwd: root },
        (err, _stdout, stderr) => {
          if (err) {
            resolve({ success: false, error: stderr.trim() || err.message })
            return
          }
          resolve({ success: true })
        }
      )
    })
  })

  ipcMain.handle('git:blame', (_event, root: string, filePath: string) => {
    return new Promise((resolve) => {
      execFile(
        'git',
        ['blame', '--porcelain', filePath],
        { cwd: root, maxBuffer: 1024 * 1024 * 4 },
        (err, stdout) => {
          if (err) {
            // File not tracked or not a git repo
            resolve({ success: true, lines: [] })
            return
          }

          const result: Array<{
            hash: string
            author: string
            date: number
            summary: string
            line: number
          }> = []

          const commitInfo = new Map<
            string,
            { author: string; date: number; summary: string }
          >()

          const chunks = stdout.split('\n')
          let i = 0
          while (i < chunks.length) {
            const headerLine = chunks[i]
            // Header: <hash> <orig-line> <final-line> [<num-lines>]
            const headerMatch = headerLine.match(
              /^([0-9a-f]{40})\s+\d+\s+(\d+)/
            )
            if (!headerMatch) {
              i++
              continue
            }

            const hash = headerMatch[1]
            const finalLine = parseInt(headerMatch[2], 10)
            i++

            // Read metadata lines until we hit the content line (starts with \t)
            let author = ''
            let date = 0
            let summary = ''

            while (i < chunks.length && !chunks[i].startsWith('\t')) {
              const line = chunks[i]
              if (line.startsWith('author ')) {
                author = line.slice(7)
              } else if (line.startsWith('author-time ')) {
                date = parseInt(line.slice(12), 10)
              } else if (line.startsWith('summary ')) {
                summary = line.slice(8)
              }
              i++
            }

            // Skip the content line (starts with \t)
            if (i < chunks.length && chunks[i].startsWith('\t')) {
              i++
            }

            // Cache commit info
            if (author && !commitInfo.has(hash)) {
              commitInfo.set(hash, { author, date, summary })
            }

            // Use cached info if this line didn't have full headers
            const info = commitInfo.get(hash)
            result.push({
              hash,
              author: author || info?.author || 'Unknown',
              date: date || info?.date || 0,
              summary: summary || info?.summary || '',
              line: finalLine,
            })
          }

          resolve({ success: true, lines: result })
        }
      )
    })
  })

  // ─── Shell ────────────────────────────────────────────────────────────────

  ipcMain.handle('shell:showItemInFolder', (_event, fullPath: string) => {
    try {
      shell.showItemInFolder(fullPath)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('shell:openExtensionsFolder', async () => {
    try {
      const extensionsPath = path.join(app.getPath('userData'), 'extensions')
      await fs.mkdir(extensionsPath, { recursive: true })
      await shell.openPath(extensionsPath)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ─── App ──────────────────────────────────────────────────────────────────

  ipcMain.handle('app:getVersion', () => {
    return app.getVersion()
  })

  ipcMain.handle('app:getPlatform', () => {
    return process.platform
  })

  ipcMain.handle('app:openExternal', async (_event, url: string) => {
    try {
      // Security: only allow http/https
      const parsed = new URL(url)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { success: false, error: 'Only http/https URLs are allowed' }
      }
      await shell.openExternal(url)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('app:notify', (_event, options: { title: string; body: string; icon?: string; force?: boolean }) => {
    try {
      // Only notify when the app window is not focused (unless force is set)
      if (!options.force && BrowserWindow.getFocusedWindow() !== null) {
        return { success: true, skipped: true }
      }
      if (!Notification.isSupported()) {
        return { success: false, error: 'Notifications not supported on this platform' }
      }
      const notif = new Notification({
        title: options.title,
        body: options.body,
        ...(options.icon ? { icon: options.icon } : {}),
      })
      notif.show()
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ─── Theme ────────────────────────────────────────────────────────────────

  ipcMain.handle('theme:get', () => {
    return getConfigValue('activeTheme')
  })

  // ─── Titlebar ──────────────────────────────────────────────────────────────

  ipcMain.handle(
    'titlebar:setOverlayColors',
    (event, color: string, symbolColor: string) => {
      try {
        if (process.platform === 'win32') {
          senderWindow(event).setTitleBarOverlay({ color, symbolColor, height: 32 })
        }
        return { success: true }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle('theme:set', (_event, theme: AppConfig['activeTheme']) => {
    try {
      setConfigValue('activeTheme', theme)
      // Broadcast to all windows
      for (const bw of BrowserWindow.getAllWindows()) {
        if (!bw.isDestroyed()) {
          bw.webContents.send('theme:changed', theme)
        }
      }
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ─── Sessions ─────────────────────────────────────────────────────────────

  const sessionsDir = path.join(app.getPath('userData'), 'sessions')
  const MAX_SESSION_FILES = 100

  /** Ensure the sessions directory exists. */
  async function ensureSessionsDir(): Promise<void> {
    await fs.mkdir(sessionsDir, { recursive: true })
  }

  /** Prune oldest session files when count exceeds MAX_SESSION_FILES. */
  async function pruneOldSessions(): Promise<void> {
    try {
      const entries = await fs.readdir(sessionsDir)
      const jsonFiles = entries.filter((f) => f.endsWith('.json'))
      if (jsonFiles.length <= MAX_SESSION_FILES) return

      // Sort by name (which starts with sessionId-timestamp, so lexicographic == chronological for same-length timestamps)
      // More reliably, sort by mtime
      const stats = await Promise.all(
        jsonFiles.map(async (f) => ({
          name: f,
          mtime: (await fs.stat(path.join(sessionsDir, f))).mtime.getTime(),
        }))
      )
      stats.sort((a, b) => a.mtime - b.mtime)
      const toDelete = stats.slice(0, stats.length - MAX_SESSION_FILES)
      await Promise.all(toDelete.map((f) => fs.unlink(path.join(sessionsDir, f.name)).catch(() => {})))
    } catch {
      // Non-fatal
    }
  }

  ipcMain.handle('sessions:save', async (_event, session: unknown) => {
    try {
      await ensureSessionsDir()

      const s = session as Record<string, unknown>
      const sessionId = typeof s['id'] === 'string' ? s['id'] : 'unknown'
      const timestamp = typeof s['startedAt'] === 'number' ? s['startedAt'] : Date.now()
      const fileName = `${sessionId}-${timestamp}.json`
      const filePath = path.join(sessionsDir, fileName)

      await fs.writeFile(filePath, JSON.stringify(session, null, 2), 'utf-8')
      await pruneOldSessions()

      return { success: true, filePath }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('sessions:load', async () => {
    try {
      await ensureSessionsDir()

      const entries = await fs.readdir(sessionsDir)
      const jsonFiles = entries.filter((f) => f.endsWith('.json'))

      const sessions: unknown[] = []
      for (const file of jsonFiles) {
        try {
          const raw = await fs.readFile(path.join(sessionsDir, file), 'utf-8')
          sessions.push(JSON.parse(raw))
        } catch {
          // Skip malformed files
        }
      }

      return { success: true, sessions }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('sessions:delete', async (_event, sessionId: string) => {
    try {
      await ensureSessionsDir()

      const entries = await fs.readdir(sessionsDir)
      const matching = entries.filter((f) => f.startsWith(`${sessionId}-`) && f.endsWith('.json'))

      await Promise.all(matching.map((f) => fs.unlink(path.join(sessionsDir, f))))
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('sessions:export', async (event, session: unknown, format: 'json' | 'markdown') => {
    try {
      const s = session as Record<string, unknown>
      const sessionId = typeof s['id'] === 'string' ? s['id'] : 'session'
      const defaultName = format === 'json'
        ? `session-${sessionId.slice(0, 8)}.json`
        : `session-${sessionId.slice(0, 8)}.md`

      const result = await dialog.showSaveDialog(senderWindow(event), {
        defaultPath: defaultName,
        filters: format === 'json'
          ? [{ name: 'JSON', extensions: ['json'] }]
          : [{ name: 'Markdown', extensions: ['md'] }],
        title: 'Export Session',
      })

      if (result.canceled || !result.filePath) {
        return { success: true, cancelled: true }
      }

      let content: string
      if (format === 'json') {
        content = JSON.stringify(session, null, 2)
      } else {
        content = buildMarkdown(s)
      }

      await fs.writeFile(result.filePath, content, 'utf-8')
      return { success: true, filePath: result.filePath }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

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

  // ─── Cost history ─────────────────────────────────────────────────────────

  ipcMain.handle('cost:addEntry', async (_event, entry: CostEntry) => {
    try {
      await saveCostEntry(entry)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('cost:getHistory', async () => {
    try {
      const entries = await getCostHistory()
      return { success: true, entries }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('cost:clearHistory', async () => {
    try {
      await clearCostHistory()
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

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

  ipcMain.handle('app:openCrashLogDir', async () => {
    try {
      await fs.mkdir(crashLogDir, { recursive: true })
      shell.openPath(crashLogDir)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

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

  // ─── Performance ping/pong (latency probe) ─────────────────────────────────

  ipcMain.handle('perf:ping', () => {
    return { success: true, ts: Date.now() }
  })

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

  ipcMain.handle('window:list', async () => {
    try {
      return { success: true, windows: getWindowInfos() }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('window:focus', async (_event, windowId: number) => {
    try {
      focusWindow(windowId)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('window:close', async (_event, windowId: number) => {
    try {
      closeWindow(windowId)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ─── Extensions ───────────────────────────────────────────────────────────

  ipcMain.handle('extensions:list', async () => {
    try {
      const { listExtensions } = await import('./extensions')
      return { success: true, extensions: listExtensions() }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('extensions:enable', async (_event, name: string) => {
    try {
      const { enableExtension } = await import('./extensions')
      return await enableExtension(name)
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('extensions:disable', async (_event, name: string) => {
    try {
      const { disableExtension } = await import('./extensions')
      return await disableExtension(name)
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('extensions:install', async (_event, sourcePath: string) => {
    try {
      const { installExtension } = await import('./extensions')
      return await installExtension(sourcePath)
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('extensions:uninstall', async (_event, name: string) => {
    try {
      const { uninstallExtension } = await import('./extensions')
      return await uninstallExtension(name)
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('extensions:getLog', async (_event, name: string) => {
    try {
      const { getExtensionLog } = await import('./extensions')
      return getExtensionLog(name)
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('extensions:openFolder', async () => {
    try {
      const { getExtensionsDirPath } = await import('./extensions')
      const extensionsPath = getExtensionsDirPath()
      await fs.mkdir(extensionsPath, { recursive: true })
      await shell.openPath(extensionsPath)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ─── LSP ─────────────────────────────────────────────────────────────────

  // Set the main window reference for LSP diagnostics broadcasting
  lspSetMainWindow(win)

  ipcMain.handle('lsp:start', async (_event, root: string, language: string) => {
    return await lspStart(root, language)
  })

  ipcMain.handle('lsp:stop', async (_event, root: string, language: string) => {
    return await lspStop(root, language)
  })

  ipcMain.handle('lsp:completion', async (_event, root: string, filePath: string, line: number, character: number) => {
    return await lspCompletion(root, filePath, line, character)
  })

  ipcMain.handle('lsp:hover', async (_event, root: string, filePath: string, line: number, character: number) => {
    return await lspHover(root, filePath, line, character)
  })

  ipcMain.handle('lsp:definition', async (_event, root: string, filePath: string, line: number, character: number) => {
    return await lspDefinition(root, filePath, line, character)
  })

  ipcMain.handle('lsp:diagnostics', async (_event, root: string, filePath: string) => {
    return lspDiagnostics(root, filePath)
  })

  ipcMain.handle('lsp:didOpen', async (_event, root: string, filePath: string, content: string) => {
    await lspDidOpen(root, filePath, content)
  })

  ipcMain.handle('lsp:didChange', async (_event, root: string, filePath: string, content: string) => {
    await lspDidChange(root, filePath, content)
  })

  ipcMain.handle('lsp:didClose', async (_event, root: string, filePath: string) => {
    await lspDidClose(root, filePath)
  })

  ipcMain.handle('lsp:getStatus', async () => {
    return { success: true, servers: lspGetStatus() }
  })

  // ─── Code Mode ────────────────────────────────────────────────────────────

  ipcMain.handle('codemode:enable', async (_event, args: { serverNames: string[]; scope: 'global' | 'project'; projectRoot?: string }) => {
    try {
      const { enableCodeMode } = await import('./codemode/codemodeManager')
      return await enableCodeMode(args.serverNames, args.scope, args.projectRoot)
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('codemode:disable', async () => {
    try {
      const { disableCodeMode } = await import('./codemode/codemodeManager')
      return await disableCodeMode()
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('codemode:status', async () => {
    try {
      const { getCodeModeStatus } = await import('./codemode/codemodeManager')
      return { success: true, ...getCodeModeStatus() }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // Return a cleanup function
  return () => { cleanupIpcHandlers() }
}

export function cleanupIpcHandlers(): void {
  // Close all file watchers
  for (const [, watcher] of watchers) {
    watcher.close().catch(() => {})
  }
  watchers.clear()

  // Stop all LSP servers
  lspStopAll().catch(() => {})

  // Close settings file watcher
  if (settingsFileWatcher) {
    settingsFileWatcher.close().catch(() => {})
    settingsFileWatcher = null
  }

  // Remove all handlers
  const channels = [
    'pty:spawn',
    'pty:spawnClaude',
    'pty:write',
    'pty:resize',
    'pty:kill',
    'pty:getCwd',
    'pty:startRecording',
    'pty:stopRecording',
    'pty:listSessions',
    'config:getAll',
    'config:get',
    'config:set',
    'config:export',
    'config:import',
    'config:openSettingsFile',
    'files:readFile',
    'files:readDir',
    'files:watchDir',
    'files:unwatchDir',
    'files:createFile',
    'files:mkdir',
    'files:rename',
    'files:copyFile',
    'files:writeFile',
    'files:delete',
    'files:selectFolder',
    'app:getVersion',
    'app:getPlatform',
    'app:openExternal',
    'app:notify',
    'shell:showItemInFolder',
    'shell:openExtensionsFolder',
    'titlebar:setOverlayColors',
    'theme:get',
    'theme:set',
    'git:isRepo',
    'git:status',
    'git:branch',
    'git:diff',
    'git:blame',
    'git:log',
    'git:show',
    'git:branches',
    'git:checkout',
    'git:stage',
    'git:unstage',
    'git:statusDetailed',
    'git:commit',
    'git:stageAll',
    'git:unstageAll',
    'git:discardFile',
    'git:snapshot',
    'git:diffReview',
    'git:fileAtCommit',
    'git:applyHunk',
    'git:revertHunk',
    'git:revertFile',
    'sessions:save',
    'sessions:load',
    'sessions:delete',
    'sessions:export',
    'cost:addEntry',
    'cost:getHistory',
    'cost:clearHistory',
    'updater:check',
    'updater:install',
    'app:getCrashLogs',
    'app:clearCrashLogs',
    'app:openCrashLogDir',
    'app:logError',
    'perf:ping',
    'shellHistory:read',
    'symbol:search',
    'window:new',
    'window:list',
    'window:focus',
    'window:close',
    'extensions:list',
    'extensions:enable',
    'extensions:disable',
    'extensions:install',
    'extensions:uninstall',
    'extensions:getLog',
    'extensions:openFolder',
    'lsp:start',
    'lsp:stop',
    'lsp:completion',
    'lsp:hover',
    'lsp:definition',
    'lsp:diagnostics',
    'lsp:didOpen',
    'lsp:didChange',
    'lsp:didClose',
    'lsp:getStatus',
    'codemode:enable',
    'codemode:disable',
    'codemode:status',
  ]

  for (const channel of channels) {
    ipcMain.removeHandler(channel)
  }

  handlersRegistered = false
}
