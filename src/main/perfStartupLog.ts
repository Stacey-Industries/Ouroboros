/**
 * perfStartupLog.ts — Startup timing persistence helpers.
 *
 * Appends one JSON line per startup to `{userData}/startup-timings.jsonl`.
 * Rotates at 10 000 lines: the current file is renamed to `.1.jsonl` and any
 * `.2.jsonl` (and older) is deleted before opening a fresh file.
 */

import fs from 'node:fs'
import path from 'node:path'

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
