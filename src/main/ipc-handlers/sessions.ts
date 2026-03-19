/**
 * ipc-handlers/sessions.ts - Session persistence IPC handlers
 */

import { app, BrowserWindow, dialog, ipcMain, IpcMainInvokeEvent } from 'electron'
import fs from 'fs/promises'
import path from 'path'

import { getErrorMessage } from '../agentChat/utils'

type SenderWindow = (event: IpcMainInvokeEvent) => BrowserWindow
type SessionRecord = Record<string, unknown>
type SessionToolCall = Record<string, unknown>
type ExportFormat = 'json' | 'markdown'
type IpcHandler = Parameters<typeof ipcMain.handle>[1]
type HandlerSuccess<T extends object = Record<string, never>> = { success: true } & T
type HandlerFailure = { success: false; error: string }

const sessionsDir = path.join(app.getPath('userData'), 'sessions')
const MAX_SESSION_FILES = 100

async function ensureSessionsDir(): Promise<void> {
  await fs.mkdir(sessionsDir, { recursive: true })
}

async function pruneOldSessions(): Promise<void> {
  try {
    const entries = await fs.readdir(sessionsDir)
    const jsonFiles = entries.filter((entry) => entry.endsWith('.json'))
    if (jsonFiles.length <= MAX_SESSION_FILES) return

    const stats = await Promise.all(
      jsonFiles.map(async (entry) => ({
        name: entry,
        mtime: (await fs.stat(path.join(sessionsDir, entry))).mtime.getTime(),
      })),
    )

    stats.sort((left, right) => left.mtime - right.mtime)
    const toDelete = stats.slice(0, stats.length - MAX_SESSION_FILES)
    await Promise.all(toDelete.map((entry) => fs.unlink(path.join(sessionsDir, entry.name)).catch((error) => { console.error('[sessions] Failed to delete old session file:', entry.name, error) })))
  } catch {
    // Non-fatal.
  }
}

function getStringValue(record: SessionRecord, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

function getNumberValue(record: SessionRecord, key: string): number | undefined {
  const value = record[key]
  return typeof value === 'number' ? value : undefined
}

function getIsoDate(record: SessionRecord, key: string): string | undefined {
  const value = getNumberValue(record, key)
  return value === undefined ? undefined : new Date(value).toISOString()
}

function getToolCalls(record: SessionRecord): SessionToolCall[] {
  return Array.isArray(record['toolCalls']) ? (record['toolCalls'] as SessionToolCall[]) : []
}

function appendCodeBlock(lines: string[], value: string): void {
  lines.push('```')
  lines.push(value)
  lines.push('```')
}

function buildSessionInfoLines(session: SessionRecord): string[] {
  const lines = [
    `# Session: ${getStringValue(session, 'taskLabel') ?? 'Unknown task'}`,
    '',
    '## Session Info',
    '',
    '| Field | Value |',
    '|-------|-------|',
    `| ID | \`${getStringValue(session, 'id') ?? 'unknown'}\` |`,
    `| Status | ${getStringValue(session, 'status') ?? 'unknown'} |`,
  ]

  const model = getStringValue(session, 'model')
  const completedAt = getIsoDate(session, 'completedAt')
  if (model) lines.push(`| Model | ${model} |`)
  lines.push(`| Started | ${getIsoDate(session, 'startedAt') ?? 'unknown'} |`)
  if (completedAt) lines.push(`| Completed | ${completedAt} |`)
  lines.push(`| Input Tokens | ${(getNumberValue(session, 'inputTokens') ?? 0).toLocaleString()} |`)
  lines.push(`| Output Tokens | ${(getNumberValue(session, 'outputTokens') ?? 0).toLocaleString()} |`)

  return lines
}

function appendErrorSection(lines: string[], error: string | undefined): void {
  if (!error) return

  lines.push('', '## Error', '')
  appendCodeBlock(lines, error)
}

function appendToolCallTable(lines: string[], toolCalls: SessionToolCall[]): void {
  lines.push('', '## Tool Calls', '')
  lines.push('| # | Tool | Input | Status | Duration |')
  lines.push('|---|------|-------|--------|----------|')

  toolCalls.forEach((toolCall, index) => {
    const toolName = getStringValue(toolCall, 'toolName') ?? ''
    const input = (getStringValue(toolCall, 'input') ?? '').replace(/\|/g, '\\|')
    const status = getStringValue(toolCall, 'status') ?? ''
    const duration = getNumberValue(toolCall, 'duration')

    lines.push(`| ${index + 1} | ${toolName} | ${input} | ${status} | ${duration ?? '-'}${duration ? 'ms' : ''} |`)
  })
}

function appendInputSection(lines: string[], input: string | undefined): void {
  if (!input) return

  lines.push('**Input:**', '')
  appendCodeBlock(lines, input)
  lines.push('')
}

function appendOutputSection(lines: string[], output: string | undefined): void {
  if (!output) return

  const truncated = output.length > 2000 ? `${output.slice(0, 2000)}\n...(truncated)` : output
  lines.push('**Output:**', '')
  appendCodeBlock(lines, truncated)
  lines.push('')
}

function appendToolCallDetails(lines: string[], toolCall: SessionToolCall, index: number): void {
  const toolName = getStringValue(toolCall, 'toolName') ?? 'Unknown'
  const status = getStringValue(toolCall, 'status') ?? ''
  const timestamp = getIsoDate(toolCall, 'timestamp')

  lines.push(`### ${index + 1}. ${toolName} (${status})`, '')
  if (timestamp) lines.push(`**Time:** ${timestamp}`)
  lines.push('')
  appendInputSection(lines, getStringValue(toolCall, 'input'))
  appendOutputSection(lines, getStringValue(toolCall, 'output'))
}

function appendToolCallSections(lines: string[], toolCalls: SessionToolCall[]): void {
  if (toolCalls.length === 0) return

  appendToolCallTable(lines, toolCalls)
  lines.push('', '## Full Event Log', '')
  toolCalls.forEach((toolCall, index) => appendToolCallDetails(lines, toolCall, index))
}

function buildMarkdown(session: SessionRecord): string {
  const lines = buildSessionInfoLines(session)

  appendErrorSection(lines, getStringValue(session, 'error'))
  appendToolCallSections(lines, getToolCalls(session))

  return lines.join('\n')
}

async function runHandler<T extends object>(action: () => Promise<T>): Promise<HandlerSuccess<T> | HandlerFailure> {
  try {
    return { success: true, ...(await action()) }
  } catch (error) {
    return { success: false, error: getErrorMessage(error) }
  }
}

function registerHandler(channels: string[], channel: string, handler: IpcHandler): void {
  ipcMain.handle(channel, handler)
  channels.push(channel)
}

function toSessionRecord(session: unknown): SessionRecord {
  return session as SessionRecord
}

function buildSessionFilePath(session: unknown): string {
  const record = toSessionRecord(session)
  const sessionId = getStringValue(record, 'id') ?? 'unknown'
  const timestamp = getNumberValue(record, 'startedAt') ?? Date.now()
  return path.join(sessionsDir, `${sessionId}-${timestamp}.json`)
}

async function readSessionFile(fileName: string): Promise<unknown | null> {
  try {
    const raw = await fs.readFile(path.join(sessionsDir, fileName), 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function loadStoredSessions(): Promise<unknown[]> {
  await ensureSessionsDir()

  const entries = await fs.readdir(sessionsDir)
  const jsonFiles = entries.filter((entry) => entry.endsWith('.json'))
  const loadedSessions = await Promise.all(jsonFiles.map((fileName) => readSessionFile(fileName)))
  return loadedSessions.reduce<unknown[]>((sessions, session) => {
    if (session !== null) sessions.push(session)
    return sessions
  }, [])
}

async function deleteStoredSession(sessionId: string): Promise<void> {
  await ensureSessionsDir()

  const entries = await fs.readdir(sessionsDir)
  const matching = entries.filter((entry) => entry.startsWith(`${sessionId}-`) && entry.endsWith('.json'))
  await Promise.all(matching.map((entry) => fs.unlink(path.join(sessionsDir, entry))))
}

function getDefaultExportName(session: SessionRecord, format: ExportFormat): string {
  const sessionId = (getStringValue(session, 'id') ?? 'session').slice(0, 8)
  const extension = format === 'json' ? 'json' : 'md'
  return `session-${sessionId}.${extension}`
}

function getExportFilters(format: ExportFormat): { name: string; extensions: string[] }[] {
  return format === 'json'
    ? [{ name: 'JSON', extensions: ['json'] }]
    : [{ name: 'Markdown', extensions: ['md'] }]
}

function buildExportContent(session: unknown, format: ExportFormat): string {
  return format === 'json' ? JSON.stringify(session, null, 2) : buildMarkdown(toSessionRecord(session))
}

async function exportSession(
  senderWindow: SenderWindow,
  event: IpcMainInvokeEvent,
  session: unknown,
  format: ExportFormat,
): Promise<{ cancelled: true } | { filePath: string }> {
  const result = await dialog.showSaveDialog(senderWindow(event), {
    defaultPath: getDefaultExportName(toSessionRecord(session), format),
    filters: getExportFilters(format),
    title: 'Export Session',
  })

  if (result.canceled || !result.filePath) return { cancelled: true }

  await fs.writeFile(result.filePath, buildExportContent(session, format), 'utf-8')
  return { filePath: result.filePath }
}

function registerSaveHandler(channels: string[]): void {
  registerHandler(channels, 'sessions:save', async (_event, session: unknown) => runHandler(async () => {
    await ensureSessionsDir()

    const filePath = buildSessionFilePath(session)
    await fs.writeFile(filePath, JSON.stringify(session, null, 2), 'utf-8')
    await pruneOldSessions()

    return { filePath }
  }))
}

function registerLoadHandler(channels: string[]): void {
  registerHandler(channels, 'sessions:load', async () => runHandler(async () => ({
    sessions: await loadStoredSessions(),
  })))
}

function registerDeleteHandler(channels: string[]): void {
  registerHandler(channels, 'sessions:delete', async (_event, sessionId: string) => runHandler(async () => {
    await deleteStoredSession(sessionId)
    return {}
  }))
}

function registerExportHandler(channels: string[], senderWindow: SenderWindow): void {
  registerHandler(channels, 'sessions:export', async (event, session: unknown, format: ExportFormat) => runHandler(
    () => exportSession(senderWindow, event, session, format),
  ))
}

export function registerSessionHandlers(senderWindow: SenderWindow): string[] {
  const channels: string[] = []

  registerSaveHandler(channels)
  registerLoadHandler(channels)
  registerDeleteHandler(channels)
  registerExportHandler(channels, senderWindow)

  return channels
}
