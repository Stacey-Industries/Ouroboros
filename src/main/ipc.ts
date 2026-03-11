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
import { spawnPty, writeToPty, resizePty, killPty, getPtyCwd, startPtyRecording, stopPtyRecording, getActiveSessions } from './pty'
import { getConfig, getConfigValue, setConfigValue, store, AppConfig } from './config'

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

export function registerIpcHandlers(win: BrowserWindow): void {
  // ─── PTY ──────────────────────────────────────────────────────────────────

  ipcMain.handle(
    'pty:spawn',
    (_event, id: string, options: { cwd?: string; cols?: number; rows?: number }) => {
      return spawnPty(id, win, options)
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

  ipcMain.handle('pty:startRecording', (_event, id: string) => {
    return startPtyRecording(id, win)
  })

  ipcMain.handle('pty:stopRecording', (_event, id: string) => {
    return stopPtyRecording(id, win)
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

  ipcMain.handle('config:export', async () => {
    try {
      const result = await dialog.showSaveDialog(win, {
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

  ipcMain.handle('config:import', async () => {
    try {
      const result = await dialog.showOpenDialog(win, {
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
        // Notify renderer of the external change
        const updated = getConfig()
        if (!win.isDestroyed()) {
          win.webContents.send('config:externalChange', updated)
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

      watcher.on('add', (filePath) => {
        win.webContents.send('files:change', { type: 'add', path: filePath })
      })
      watcher.on('change', (filePath) => {
        win.webContents.send('files:change', { type: 'change', path: filePath })
      })
      watcher.on('unlink', (filePath) => {
        win.webContents.send('files:change', { type: 'unlink', path: filePath })
      })
      watcher.on('addDir', (dirPath) => {
        win.webContents.send('files:change', { type: 'addDir', path: dirPath })
      })
      watcher.on('unlinkDir', (dirPath) => {
        win.webContents.send('files:change', { type: 'unlinkDir', path: dirPath })
      })
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

  ipcMain.handle('files:selectFolder', async () => {
    const result = await dialog.showOpenDialog(win, {
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

  ipcMain.handle('app:notify', (_event, options: { title: string; body: string; icon?: string }) => {
    try {
      // Only notify when the app window is not focused
      if (BrowserWindow.getFocusedWindow() !== null) {
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
    (_event, color: string, symbolColor: string) => {
      try {
        if (process.platform === 'win32') {
          win.setTitleBarOverlay({ color, symbolColor, height: 32 })
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
      // Broadcast to any other windows
      win.webContents.send('theme:changed', theme)
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

  ipcMain.handle('sessions:export', async (_event, session: unknown, format: 'json' | 'markdown') => {
    try {
      const s = session as Record<string, unknown>
      const sessionId = typeof s['id'] === 'string' ? s['id'] : 'session'
      const defaultName = format === 'json'
        ? `session-${sessionId.slice(0, 8)}.json`
        : `session-${sessionId.slice(0, 8)}.md`

      const result = await dialog.showSaveDialog(win, {
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
}

export function cleanupIpcHandlers(): void {
  // Close all file watchers
  for (const [, watcher] of watchers) {
    watcher.close().catch(() => {})
  }
  watchers.clear()

  // Close settings file watcher
  if (settingsFileWatcher) {
    settingsFileWatcher.close().catch(() => {})
    settingsFileWatcher = null
  }

  // Remove all handlers
  const channels = [
    'pty:spawn',
    'pty:write',
    'pty:resize',
    'pty:kill',
    'pty:getCwd',
    'pty:startRecording',
    'pty:stopRecording',
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
    'sessions:save',
    'sessions:load',
    'sessions:delete',
    'sessions:export',
    'updater:check',
    'updater:install',
    'app:getCrashLogs',
    'app:clearCrashLogs',
    'app:openCrashLogDir',
    'app:logError',
    'perf:ping',
    'shellHistory:read',
    'symbol:search',
  ]

  for (const channel of channels) {
    ipcMain.removeHandler(channel)
  }
}
