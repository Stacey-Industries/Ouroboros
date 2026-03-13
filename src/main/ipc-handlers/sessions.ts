/**
 * ipc-handlers/sessions.ts — Session persistence IPC handlers
 */

import { ipcMain, dialog, BrowserWindow, IpcMainInvokeEvent } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import { app } from 'electron'

type SenderWindow = (event: IpcMainInvokeEvent) => BrowserWindow

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

export function registerSessionHandlers(senderWindow: SenderWindow): string[] {
  const channels: string[] = []

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
  channels.push('sessions:save')

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
  channels.push('sessions:load')

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
  channels.push('sessions:delete')

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
  channels.push('sessions:export')

  return channels
}
