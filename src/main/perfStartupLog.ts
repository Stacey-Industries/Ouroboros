/**
 * perfStartupLog.ts — Startup timing persistence helpers.
 *
 * Appends one JSON line per startup to `{userData}/startup-timings.jsonl`.
 * Rotates at 10 000 lines: the current file is renamed to `.1.jsonl` and any
 * `.2.jsonl` (and older) is deleted before opening a fresh file.
 */

import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'

import { app } from 'electron'

import log from './logger'
import type { StartupMark } from './perfMetrics'

// ─── Constants ───────────────────────────────────────────────────────────────

const JSONL_FILENAME = 'startup-timings.jsonl'
const MAX_LINES = 10_000

// ─── Types ───────────────────────────────────────────────────────────────────

interface SerializedMark {
  phase: StartupMark['phase']
  tsNs: string
  deltaMs: number
}

interface StartupTimingRecord {
  ts: string
  timings: SerializedMark[]
  platform: NodeJS.Platform
  version: string
}

/** Public record shape returned by readRecentStartups. */
export interface StartupRecord {
  ts: string
  timings: SerializedMark[]
  platform: string
  version: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolveLogPath(): string {
  return path.join(app.getPath('userData'), JSONL_FILENAME)
}

export function countLines(filePath: string): number {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath derived from app.getPath('userData'), a trusted internal path
    const content = fs.readFileSync(filePath, 'utf-8')
    if (content.length === 0) return 0
    return content.split('\n').filter((l) => l.length > 0).length
  } catch {
    return 0
  }
}

function rotateLog(logPath: string): void {
  const dot1 = `${logPath}.1.jsonl`
  const dot2 = `${logPath}.2.jsonl`

  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted path; see resolveLogPath
    if (fs.existsSync(dot2)) fs.unlinkSync(dot2)
  } catch {
    // best effort
  }

  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted path; see resolveLogPath
    if (fs.existsSync(logPath)) fs.renameSync(logPath, dot1)
  } catch {
    // best effort
  }
}

function shouldRotate(logPath: string): boolean {
  return countLines(logPath) >= MAX_LINES
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function appendStartupRecord(timings: StartupMark[]): void {
  const logPath = resolveLogPath()

  if (shouldRotate(logPath)) {
    rotateLog(logPath)
  }

  const record: StartupTimingRecord = {
    ts: new Date().toISOString(),
    timings: timings.map((m) => ({ phase: m.phase, tsNs: m.tsNs.toString(), deltaMs: m.deltaMs })),
    platform: process.platform,
    version: app.getVersion(),
  }

  const line = JSON.stringify(record) + '\n'

  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- logPath derived from app.getPath('userData'), a trusted internal path
    fs.appendFileSync(logPath, line, 'utf-8')
  } catch (err) {
    log.warn('[perf] Failed to append startup-timings.jsonl:', err)
  }
}

// ─── Read helpers ─────────────────────────────────────────────────────────────

/** Read all parseable records from a single JSONL file using a readline stream. */
async function readJsonlFile(filePath: string): Promise<StartupRecord[]> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath derived from app.getPath('userData'), a trusted internal path
  if (!fs.existsSync(filePath)) return []

  const records: StartupRecord[] = []
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath derived from app.getPath('userData'), a trusted internal path
  const stream = fs.createReadStream(filePath, { encoding: 'utf-8' })
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })

  for await (const line of rl) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    try {
      const parsed = JSON.parse(trimmed) as StartupRecord
      records.push(parsed)
    } catch {
      log.warn('[perf] readRecentStartups: skipping malformed line in startup-timings.jsonl')
    }
  }

  return records
}

/**
 * Read the last `limit` startup records from the JSONL log.
 *
 * Reads the primary file first; if fewer than `limit` records are found,
 * continues reading from the rotation file (`.1.jsonl`) for continuity.
 * Malformed lines are skipped. Read errors return whatever was parsed.
 */
export async function readRecentStartups(limit: number): Promise<StartupRecord[]> {
  const logPath = resolveLogPath()
  const rotatedPath = `${logPath}.1.jsonl`

  let records: StartupRecord[] = []

  try {
    records = await readJsonlFile(logPath)
  } catch (err) {
    log.warn('[perf] readRecentStartups: error reading primary file:', err)
  }

  if (records.length < limit) {
    try {
      const rotated = await readJsonlFile(rotatedPath)
      records = [...rotated, ...records]
    } catch (err) {
      log.warn('[perf] readRecentStartups: error reading rotation file:', err)
    }
  }

  return records.slice(-limit)
}
