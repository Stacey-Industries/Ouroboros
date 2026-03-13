/**
 * usageReader.ts — Reads Claude Code's local JSONL session files to extract
 * real token usage data.
 *
 * Claude Code stores conversation data in ~/.claude/projects/{PROJECT_ID}/{SESSION_UUID}.jsonl
 * Each line is a JSON object; lines with `message.usage` contain token counts.
 */

import fs from 'fs/promises'
import { createReadStream } from 'fs'
import path from 'path'
import os from 'os'
import readline from 'readline'
import { getPricing } from '@shared/pricing'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UsageEntry {
  sessionId: string
  timestamp: number
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

export interface UsageSummary {
  /** Per-session aggregated totals */
  sessions: SessionUsage[]
  /** Grand totals */
  totals: UsageTotals
}

export interface SessionUsage {
  sessionId: string
  /** First message timestamp */
  startedAt: number
  /** Last message timestamp */
  lastActiveAt: number
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  estimatedCost: number
  messageCount: number
}

export interface UsageTotals {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  estimatedCost: number
  sessionCount: number
  messageCount: number
}

// ─── Cost estimation (pricing imported from @shared/pricing) ─────────────────

function estimateCost(entry: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; model: string }): number {
  const p = getPricing(entry.model)
  return (
    (entry.inputTokens / 1_000_000) * p.inputPer1M +
    (entry.outputTokens / 1_000_000) * p.outputPer1M +
    (entry.cacheReadTokens / 1_000_000) * p.cacheReadPer1M +
    (entry.cacheWriteTokens / 1_000_000) * p.cacheWritePer1M
  )
}

// ─── File discovery ──────────────────────────────────────────────────────────

function getClaudeProjectsDir(): string {
  return path.join(os.homedir(), '.claude', 'projects')
}

/**
 * Find all .jsonl session files across all projects.
 * Returns paths sorted by modification time (most recent first).
 */
interface SessionFile {
  path: string
  mtime: number
}

async function findSessionFiles(projectFilter?: string): Promise<SessionFile[]> {
  const projectsDir = getClaudeProjectsDir()
  const files: SessionFile[] = []

  try {
    const projectDirs = await fs.readdir(projectsDir, { withFileTypes: true })

    for (const dir of projectDirs) {
      if (!dir.isDirectory()) continue
      // If a project filter is specified, only scan matching project dirs
      if (projectFilter && !dir.name.includes(projectFilter)) continue

      const projectPath = path.join(projectsDir, dir.name)
      try {
        const entries = await fs.readdir(projectPath, { withFileTypes: true })
        for (const entry of entries) {
          if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue
          const filePath = path.join(projectPath, entry.name)
          try {
            const stat = await fs.stat(filePath)
            files.push({ path: filePath, mtime: stat.mtime.getTime() })
          } catch {
            // Skip unreadable files — include with mtime 0 so they aren't excluded
            files.push({ path: filePath, mtime: 0 })
          }
        }
      } catch {
        // Skip unreadable directories
      }
    }
  } catch {
    // ~/.claude/projects doesn't exist
  }

  files.sort((a, b) => b.mtime - a.mtime)
  return files
}

// ─── JSONL parsing ───────────────────────────────────────────────────────────

interface ParsedUsageLine {
  timestamp: number
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

/**
 * Stream-parse a JSONL file and extract usage entries.
 * Only parses lines that contain "usage" to avoid wasting time on tool results.
 */
async function parseSessionFile(filePath: string): Promise<ParsedUsageLine[]> {
  const entries: ParsedUsageLine[] = []

  const stream = createReadStream(filePath, { encoding: 'utf-8' })
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })

  for await (const line of rl) {
    // Quick check before parsing JSON — skip lines that can't have usage data
    if (!line.includes('"usage"')) continue

    try {
      const obj = JSON.parse(line)

      // Claude Code JSONL format: { message: { model, usage: {...} }, timestamp, sessionId }
      const usage = obj?.message?.usage
      if (!usage) continue

      const model = obj.message.model ?? 'unknown'
      const timestamp = obj.timestamp
        ? new Date(obj.timestamp).getTime()
        : Date.now()

      entries.push({
        timestamp,
        model,
        inputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
      })
    } catch {
      // Malformed line — skip
    }
  }

  return entries
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Read usage data from Claude Code's local storage.
 *
 * @param options.projectFilter — Only scan projects whose directory name contains this string
 * @param options.since — Only include entries after this timestamp (ms)
 * @param options.maxSessions — Maximum number of session files to scan (default 100)
 */
export async function getUsageSummary(options?: {
  projectFilter?: string
  since?: number
  maxSessions?: number
}): Promise<UsageSummary> {
  const { projectFilter, since, maxSessions = 100 } = options ?? {}

  const files = await findSessionFiles(projectFilter)
  const filesToScan = files.slice(0, maxSessions).map((f) => f.path)

  const sessionMap = new Map<string, SessionUsage>()

  for (const filePath of filesToScan) {
    // Extract sessionId from filename (e.g., "07cd8ed0-70d0-4271-869a-0e4fcea98cb7.jsonl")
    const sessionId = path.basename(filePath, '.jsonl')

    let entries: ParsedUsageLine[]
    try {
      entries = await parseSessionFile(filePath)
    } catch {
      continue
    }

    if (entries.length === 0) continue

    // Filter by timestamp if requested
    const filtered = since ? entries.filter((e) => e.timestamp >= since) : entries
    if (filtered.length === 0) continue

    // Aggregate per session
    let inputTokens = 0
    let outputTokens = 0
    let cacheReadTokens = 0
    let cacheWriteTokens = 0
    let startedAt = Infinity
    let lastActiveAt = 0
    let model = 'unknown'

    for (const entry of filtered) {
      inputTokens += entry.inputTokens
      outputTokens += entry.outputTokens
      cacheReadTokens += entry.cacheReadTokens
      cacheWriteTokens += entry.cacheWriteTokens
      if (entry.timestamp < startedAt) startedAt = entry.timestamp
      if (entry.timestamp > lastActiveAt) lastActiveAt = entry.timestamp
      model = entry.model // Use the most recent model
    }

    const session: SessionUsage = {
      sessionId,
      startedAt,
      lastActiveAt,
      model,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      estimatedCost: estimateCost({ inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, model }),
      messageCount: filtered.length,
    }

    sessionMap.set(sessionId, session)
  }

  // Build totals
  const sessions = Array.from(sessionMap.values())
  sessions.sort((a, b) => b.lastActiveAt - a.lastActiveAt)

  const totals: UsageTotals = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    estimatedCost: 0,
    sessionCount: sessions.length,
    messageCount: 0,
  }

  for (const s of sessions) {
    totals.inputTokens += s.inputTokens
    totals.outputTokens += s.outputTokens
    totals.cacheReadTokens += s.cacheReadTokens
    totals.cacheWriteTokens += s.cacheWriteTokens
    totals.estimatedCost += s.estimatedCost
    totals.messageCount += s.messageCount
  }

  return { sessions, totals }
}

// ─── Single-session detail (for "Current" tab) ──────────────────────────────

export interface SessionMessageUsage {
  timestamp: number
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

export interface SessionDetail {
  sessionId: string
  messages: SessionMessageUsage[]
  totals: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
    totalTokens: number
    estimatedCost: number
    model: string
    messageCount: number
    durationMs: number
  }
}

/**
 * Read detailed usage for a single Claude Code session by its UUID.
 * Searches across all project directories to find the matching JSONL file.
 */
export async function getSessionDetail(sessionId: string): Promise<SessionDetail | null> {
  const projectsDir = getClaudeProjectsDir()

  // Search for the session file across all project directories
  let targetFile: string | null = null

  try {
    const projectDirs = await fs.readdir(projectsDir, { withFileTypes: true })

    for (const dir of projectDirs) {
      if (!dir.isDirectory()) continue
      const candidate = path.join(projectsDir, dir.name, `${sessionId}.jsonl`)
      try {
        await fs.access(candidate)
        targetFile = candidate
        break
      } catch {
        // Not in this directory
      }
    }
  } catch {
    return null
  }

  if (!targetFile) return null

  let entries: ParsedUsageLine[]
  try {
    entries = await parseSessionFile(targetFile)
  } catch {
    return null
  }

  if (entries.length === 0) {
    return { sessionId, messages: [], totals: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, estimatedCost: 0, model: 'unknown', messageCount: 0, durationMs: 0 } }
  }

  let inputTokens = 0
  let outputTokens = 0
  let cacheReadTokens = 0
  let cacheWriteTokens = 0
  let model = 'unknown'
  let minTs = Infinity
  let maxTs = 0

  const messages: SessionMessageUsage[] = entries.map((e) => {
    inputTokens += e.inputTokens
    outputTokens += e.outputTokens
    cacheReadTokens += e.cacheReadTokens
    cacheWriteTokens += e.cacheWriteTokens
    model = e.model
    if (e.timestamp < minTs) minTs = e.timestamp
    if (e.timestamp > maxTs) maxTs = e.timestamp

    return {
      timestamp: e.timestamp,
      model: e.model,
      inputTokens: e.inputTokens,
      outputTokens: e.outputTokens,
      cacheReadTokens: e.cacheReadTokens,
      cacheWriteTokens: e.cacheWriteTokens,
    }
  })

  return {
    sessionId,
    messages,
    totals: {
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      totalTokens: inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens,
      estimatedCost: estimateCost({ inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, model }),
      model,
      messageCount: entries.length,
      durationMs: maxTs > minTs ? maxTs - minTs : 0,
    },
  }
}

// ─── Windowed usage summary (5h / weekly / per-model) ────────────────────────

export interface WindowedUsage {
  /** Rolling 5-hour window — all models combined */
  fiveHour: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
    totalTokens: number
    estimatedCost: number
    windowStart: number
  }
  /** Rolling 7-day window — all models combined */
  weekly: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
    totalTokens: number
    estimatedCost: number
    windowStart: number
  }
  /** Rolling 5-hour window — Sonnet model only */
  sonnetFiveHour: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
    totalTokens: number
    estimatedCost: number
  }
}

/**
 * Compute rolling-window usage totals from all JSONL session files.
 * Returns 5h, weekly, and Sonnet-specific 5h buckets — the same windows
 * that Claude Code's /usage command displays for Max plan subscribers.
 */
export async function getWindowedUsage(): Promise<WindowedUsage> {
  const now = Date.now()
  const fiveHourStart = now - 5 * 60 * 60 * 1000
  const weekStart = now - 7 * 24 * 60 * 60 * 1000

  const files = await findSessionFiles()

  let fiveHourIn = 0, fiveHourOut = 0, fiveHourCacheRead = 0, fiveHourCacheWrite = 0
  let weeklyIn = 0, weeklyOut = 0, weeklyCacheRead = 0, weeklyCacheWrite = 0
  let sonnetIn = 0, sonnetOut = 0, sonnetCacheRead = 0, sonnetCacheWrite = 0

  // Only scan files modified within the weekly window (+ 1h buffer for safety).
  // A file not modified since before the window can't contain entries in the window.
  // Files with mtime === 0 (stat failed) are always included to be conservative.
  const bufferMs = 60 * 60 * 1000 // 1 hour
  const mtimeCutoff = weekStart - bufferMs
  const relevantFiles = files
    .filter((f) => f.mtime === 0 || f.mtime >= mtimeCutoff)
    .map((f) => f.path)

  for (const filePath of relevantFiles) {
    let entries: ParsedUsageLine[]
    try {
      entries = await parseSessionFile(filePath)
    } catch {
      continue
    }

    for (const e of entries) {
      const inWeekly = e.timestamp >= weekStart
      const inFiveHour = e.timestamp >= fiveHourStart
      const isSonnet = e.model.toLowerCase().includes('sonnet')

      if (inWeekly) {
        weeklyIn += e.inputTokens
        weeklyOut += e.outputTokens
        weeklyCacheRead += e.cacheReadTokens
        weeklyCacheWrite += e.cacheWriteTokens
      }

      if (inFiveHour) {
        fiveHourIn += e.inputTokens
        fiveHourOut += e.outputTokens
        fiveHourCacheRead += e.cacheReadTokens
        fiveHourCacheWrite += e.cacheWriteTokens

        if (isSonnet) {
          sonnetIn += e.inputTokens
          sonnetOut += e.outputTokens
          sonnetCacheRead += e.cacheReadTokens
          sonnetCacheWrite += e.cacheWriteTokens
        }
      }
    }
  }

  const fiveHourTotal = fiveHourIn + fiveHourOut + fiveHourCacheRead + fiveHourCacheWrite
  const weeklyTotal = weeklyIn + weeklyOut + weeklyCacheRead + weeklyCacheWrite
  const sonnetTotal = sonnetIn + sonnetOut + sonnetCacheRead + sonnetCacheWrite

  const fiveHourModel = 'claude-sonnet-4' // best guess for cost estimate
  const fiveHourCost = estimateCost({ inputTokens: fiveHourIn, outputTokens: fiveHourOut, cacheReadTokens: fiveHourCacheRead, cacheWriteTokens: fiveHourCacheWrite, model: fiveHourModel })
  const weeklyCost = estimateCost({ inputTokens: weeklyIn, outputTokens: weeklyOut, cacheReadTokens: weeklyCacheRead, cacheWriteTokens: weeklyCacheWrite, model: fiveHourModel })
  const sonnetCost = estimateCost({ inputTokens: sonnetIn, outputTokens: sonnetOut, cacheReadTokens: sonnetCacheRead, cacheWriteTokens: sonnetCacheWrite, model: 'claude-sonnet-4' })

  return {
    fiveHour: { inputTokens: fiveHourIn, outputTokens: fiveHourOut, cacheReadTokens: fiveHourCacheRead, cacheWriteTokens: fiveHourCacheWrite, totalTokens: fiveHourTotal, estimatedCost: fiveHourCost, windowStart: fiveHourStart },
    weekly: { inputTokens: weeklyIn, outputTokens: weeklyOut, cacheReadTokens: weeklyCacheRead, cacheWriteTokens: weeklyCacheWrite, totalTokens: weeklyTotal, estimatedCost: weeklyCost, windowStart: weekStart },
    sonnetFiveHour: { inputTokens: sonnetIn, outputTokens: sonnetOut, cacheReadTokens: sonnetCacheRead, cacheWriteTokens: sonnetCacheWrite, totalTokens: sonnetTotal, estimatedCost: sonnetCost },
  }
}

/**
 * Get detailed usage for the N most recently modified session files.
 * This is the "Current" view — it finds active/recent sessions purely from
 * file modification times, independent of the agent monitor.
 * This mirrors what `/usage` does in the Claude Code CLI.
 */
export async function getRecentSessionDetails(count: number = 3): Promise<SessionDetail[]> {
  const files = await findSessionFiles()
  const results: SessionDetail[] = []

  for (const filePath of files.slice(0, count).map((f) => f.path)) {
    const sessionId = path.basename(filePath, '.jsonl')
    let entries: ParsedUsageLine[]
    try {
      entries = await parseSessionFile(filePath)
    } catch {
      continue
    }
    if (entries.length === 0) continue

    let inputTokens = 0
    let outputTokens = 0
    let cacheReadTokens = 0
    let cacheWriteTokens = 0
    let model = 'unknown'
    let minTs = Infinity
    let maxTs = 0

    const messages: SessionMessageUsage[] = entries.map((e) => {
      inputTokens += e.inputTokens
      outputTokens += e.outputTokens
      cacheReadTokens += e.cacheReadTokens
      cacheWriteTokens += e.cacheWriteTokens
      model = e.model
      if (e.timestamp < minTs) minTs = e.timestamp
      if (e.timestamp > maxTs) maxTs = e.timestamp
      return { timestamp: e.timestamp, model: e.model, inputTokens: e.inputTokens, outputTokens: e.outputTokens, cacheReadTokens: e.cacheReadTokens, cacheWriteTokens: e.cacheWriteTokens }
    })

    results.push({
      sessionId,
      messages,
      totals: {
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheWriteTokens,
        totalTokens: inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens,
        estimatedCost: estimateCost({ inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, model }),
        model,
        messageCount: entries.length,
        durationMs: maxTs > minTs ? maxTs - minTs : 0,
      },
    })
  }

  return results
}
