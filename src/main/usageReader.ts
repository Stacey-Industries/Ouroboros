/**
 * Reads Claude Code's local JSONL session files to extract usage data.
 */

import { createReadStream } from 'fs'
import type { Dirent } from 'fs'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import readline from 'readline'
import {
  addWindowUsageEntry,
  buildSessionDetail,
  buildSessionUsage,
  buildUsageTotals,
  buildWindowUsageBucket,
  buildWindowUsageBucketWithStart,
  createWindowUsageTotals,
  type ParsedUsageLine,
  type SessionDetail,
  type SessionFile,
  type SessionUsage,
  type UsageSummary,
  type WindowedUsage,
} from './usageReaderSupport'

export type {
  SessionDetail,
  SessionDetailTotals,
  SessionFile,
  SessionMessageUsage,
  SessionUsage,
  UsageEntry,
  UsageSummary,
  UsageTotals,
  WindowUsageBucket,
  WindowUsageBucketWithStart,
  WindowedUsage,
} from './usageReaderSupport'

interface JsonlUsage {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

interface JsonlLine {
  timestamp?: string | number
  message?: {
    model?: string
    usage?: JsonlUsage
  }
}

const JSONL_EXTENSION = '.jsonl'
const DEFAULT_MAX_SESSIONS = 100
const FIVE_HOUR_WINDOW_MS = 5 * 60 * 60 * 1000
const WEEK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
const FILE_MTIME_BUFFER_MS = 60 * 60 * 1000
const WINDOW_COST_MODEL = 'claude-sonnet-4'
const UNKNOWN_MODEL = 'unknown'

function getClaudeProjectsDir(): string {
  return path.join(os.homedir(), '.claude', 'projects')
}

function getSessionId(filePath: string): string {
  return path.basename(filePath, JSONL_EXTENSION)
}

function isMatchingProject(dir: Dirent, projectFilter?: string): boolean {
  return dir.isDirectory() && (!projectFilter || dir.name.includes(projectFilter))
}

function isSessionFile(entry: Dirent): boolean {
  return entry.isFile() && entry.name.endsWith(JSONL_EXTENSION)
}

function toTimestamp(value: string | number | undefined): number {
  if (value === undefined) {
    return Date.now()
  }

  const timestamp = new Date(value).getTime()
  return Number.isNaN(timestamp) ? Date.now() : timestamp
}

function mapUsageLine(parsed: JsonlLine): ParsedUsageLine | null {
  const usage = parsed.message?.usage
  if (!usage) {
    return null
  }

  return {
    timestamp: toTimestamp(parsed.timestamp),
    model: parsed.message?.model ?? UNKNOWN_MODEL,
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
  }
}

function parseUsageLine(line: string): ParsedUsageLine | null {
  if (!line.includes('"usage"')) {
    return null
  }

  try {
    return mapUsageLine(JSON.parse(line) as JsonlLine)
  } catch {
    return null
  }
}

async function readProjectDirs(projectsDir: string): Promise<Dirent[]> {
  try {
    return await fs.readdir(projectsDir, { withFileTypes: true })
  } catch {
    return []
  }
}

async function getSessionFileInfo(
  projectPath: string,
  entryName: string
): Promise<SessionFile> {
  const filePath = path.join(projectPath, entryName)

  try {
    const stat = await fs.stat(filePath)
    return { path: filePath, mtime: stat.mtime.getTime() }
  } catch {
    return { path: filePath, mtime: 0 }
  }
}

async function readProjectSessionFiles(
  projectsDir: string,
  dir: Dirent
): Promise<SessionFile[]> {
  const projectPath = path.join(projectsDir, dir.name)

  try {
    const entries = await fs.readdir(projectPath, { withFileTypes: true })
    const sessionFiles = entries.filter(isSessionFile)
    return Promise.all(
      sessionFiles.map((entry) => getSessionFileInfo(projectPath, entry.name))
    )
  } catch {
    return []
  }
}

async function findSessionFiles(projectFilter?: string): Promise<SessionFile[]> {
  const projectsDir = getClaudeProjectsDir()
  const projectDirs = await readProjectDirs(projectsDir)
  const matchingDirs = projectDirs.filter((dir) =>
    isMatchingProject(dir, projectFilter)
  )
  const fileGroups = await Promise.all(
    matchingDirs.map((dir) => readProjectSessionFiles(projectsDir, dir))
  )

  return fileGroups.flat().sort((a, b) => b.mtime - a.mtime)
}

async function parseSessionFile(filePath: string): Promise<ParsedUsageLine[]> {
  const entries: ParsedUsageLine[] = []
  const stream = createReadStream(filePath, { encoding: 'utf-8' })
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })

  for await (const line of rl) {
    const entry = parseUsageLine(line)
    if (entry) {
      entries.push(entry)
    }
  }

  return entries
}

async function tryParseSessionFile(
  filePath: string
): Promise<ParsedUsageLine[] | null> {
  try {
    return await parseSessionFile(filePath)
  } catch {
    return null
  }
}

function filterEntriesSince(
  entries: ParsedUsageLine[],
  since?: number
): ParsedUsageLine[] {
  return since ? entries.filter((entry) => entry.timestamp >= since) : entries
}

function isPresent<T>(value: T | null): value is T {
  return value !== null
}

async function buildUsageSummarySession(
  filePath: string,
  since?: number
): Promise<SessionUsage | null> {
  const entries = await tryParseSessionFile(filePath)
  if (!entries) {
    return null
  }

  return buildSessionUsage(getSessionId(filePath), filterEntriesSince(entries, since))
}

async function collectUsageSummarySessions(
  filePaths: string[],
  since?: number
): Promise<SessionUsage[]> {
  const sessions = await Promise.all(
    filePaths.map((filePath) => buildUsageSummarySession(filePath, since))
  )
  return sessions.filter(isPresent)
}

export async function getUsageSummary(options?: {
  projectFilter?: string
  since?: number
  maxSessions?: number
}): Promise<UsageSummary> {
  const { projectFilter, since, maxSessions = DEFAULT_MAX_SESSIONS } =
    options ?? {}
  const sessionFiles = await findSessionFiles(projectFilter)
  const filesToScan = sessionFiles.slice(0, maxSessions).map((file) => file.path)
  const sessions = await collectUsageSummarySessions(filesToScan, since)

  sessions.sort((a, b) => b.lastActiveAt - a.lastActiveAt)
  return { sessions, totals: buildUsageTotals(sessions) }
}

async function sessionFileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function findSessionFile(sessionId: string): Promise<string | null> {
  const projectsDir = getClaudeProjectsDir()
  const projectDirs = await readProjectDirs(projectsDir)

  for (const dir of projectDirs) {
    if (!dir.isDirectory()) {
      continue
    }

    const candidate = path.join(
      projectsDir,
      dir.name,
      `${sessionId}${JSONL_EXTENSION}`
    )
    if (await sessionFileExists(candidate)) {
      return candidate
    }
  }

  return null
}

export async function getSessionDetail(
  sessionId: string
): Promise<SessionDetail | null> {
  const targetFile = await findSessionFile(sessionId)
  if (!targetFile) {
    return null
  }

  const entries = await tryParseSessionFile(targetFile)
  return entries ? buildSessionDetail(sessionId, entries) : null
}

function getRelevantWindowFiles(files: SessionFile[], weekStart: number): string[] {
  const mtimeCutoff = weekStart - FILE_MTIME_BUFFER_MS
  return files
    .filter((file) => file.mtime === 0 || file.mtime >= mtimeCutoff)
    .map((file) => file.path)
}

export async function getWindowedUsage(): Promise<WindowedUsage> {
  const now = Date.now()
  const fiveHourStart = now - FIVE_HOUR_WINDOW_MS
  const weekStart = now - WEEK_WINDOW_MS
  const files = await findSessionFiles()
  const relevantFiles = getRelevantWindowFiles(files, weekStart)
  const totals = createWindowUsageTotals()

  for (const filePath of relevantFiles) {
    const entries = await tryParseSessionFile(filePath)
    if (!entries) {
      continue
    }

    for (const entry of entries) {
      addWindowUsageEntry(totals, entry, weekStart, fiveHourStart)
    }
  }

  return {
    fiveHour: buildWindowUsageBucketWithStart(
      totals.fiveHour,
      WINDOW_COST_MODEL,
      fiveHourStart
    ),
    weekly: buildWindowUsageBucketWithStart(
      totals.weekly,
      WINDOW_COST_MODEL,
      weekStart
    ),
    sonnetFiveHour: buildWindowUsageBucket(
      totals.sonnetFiveHour,
      WINDOW_COST_MODEL
    ),
  }
}

async function buildRecentSessionDetail(
  filePath: string
): Promise<SessionDetail | null> {
  const entries = await tryParseSessionFile(filePath)
  if (!entries || entries.length === 0) {
    return null
  }

  return buildSessionDetail(getSessionId(filePath), entries)
}

export async function getRecentSessionDetails(
  count: number = 3
): Promise<SessionDetail[]> {
  const files = await findSessionFiles()
  const details = await Promise.all(
    files.slice(0, count).map((file) => buildRecentSessionDetail(file.path))
  )
  return details.filter(isPresent)
}
