/**
 * perfStartupLog.test.ts — Tests for startup timing JSONL persistence.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((key: string) => (key === 'userData' ? mockUserData() : '/mock')),
    getVersion: vi.fn(() => '1.0.0'),
    commandLine: { appendSwitch: vi.fn() },
  },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  session: { defaultSession: { webRequest: { onHeadersReceived: vi.fn() } } },
}))

vi.mock('mica-electron', () => ({
  MicaBrowserWindow: class MicaBrowserWindowMock {},
}))

vi.mock('./logger', () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

// ─── Helpers ─────────────────────────────────────────────────────────────────

let tmpDir: string

function mockUserData(): string {
  return tmpDir
}

function logPath(): string {
  return path.join(tmpDir, 'startup-timings.jsonl')
}

function readLines(): string[] {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- logPath() returns a path inside a fresh OS tmpdir created per test
    const raw = fs.readFileSync(logPath(), 'utf-8')
    return raw.split('\n').filter((l) => l.length > 0)
  } catch {
    return []
  }
}

function makeMarks(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    phase: 'app-ready' as const,
    tsNs: BigInt(i * 1_000_000),
    deltaMs: i * 10,
  }))
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('appendStartupRecord', () => {
  beforeEach(() => {
    vi.resetModules()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates the file and appends a valid JSON line', async () => {
    const { appendStartupRecord } = await import('./perfStartupLog')
    const marks = makeMarks(2)
    appendStartupRecord(marks)

    const lines = readLines()
    expect(lines).toHaveLength(1)

    const record = JSON.parse(lines[0])
    expect(record).toHaveProperty('ts')
    expect(record.platform).toBe(process.platform)
    expect(record.version).toBe('1.0.0')
    expect(record.timings).toHaveLength(2)
  })

  it('appends multiple records over successive calls', async () => {
    const { appendStartupRecord } = await import('./perfStartupLog')
    appendStartupRecord(makeMarks(1))
    appendStartupRecord(makeMarks(1))
    appendStartupRecord(makeMarks(1))

    expect(readLines()).toHaveLength(3)
  })

  it('does not throw when timings array is empty', async () => {
    const { appendStartupRecord } = await import('./perfStartupLog')
    expect(() => appendStartupRecord([])).not.toThrow()
    expect(readLines()).toHaveLength(1)
  })
})

describe('countLines', () => {
  beforeEach(() => {
    vi.resetModules()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-count-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns 0 for a missing file', async () => {
    const { countLines } = await import('./perfStartupLog')
    expect(countLines(path.join(tmpDir, 'nonexistent.jsonl'))).toBe(0)
  })

  it('returns 0 for an empty file', async () => {
    const { countLines } = await import('./perfStartupLog')
    const p = path.join(tmpDir, 'empty.jsonl')
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- p is constructed from OS tmpdir, safe test path
    fs.writeFileSync(p, '')
    expect(countLines(p)).toBe(0)
  })

  it('counts non-empty lines correctly', async () => {
    const { countLines } = await import('./perfStartupLog')
    const p = path.join(tmpDir, 'lines.jsonl')
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- p is constructed from OS tmpdir, safe test path
    fs.writeFileSync(p, '{"a":1}\n{"b":2}\n{"c":3}\n')
    expect(countLines(p)).toBe(3)
  })
})

describe('rotation', () => {
  beforeEach(() => {
    vi.resetModules()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-rotate-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('rotates when the file is at MAX_LINES, renaming to .1.jsonl', async () => {
    const { appendStartupRecord, countLines } = await import('./perfStartupLog')

    // Pre-fill the file with exactly MAX_LINES lines via direct write
    const lp = logPath()
    const filler = '{"filler":true}\n'.repeat(10_000)
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- lp is inside OS tmpdir, safe test path
    fs.writeFileSync(lp, filler, 'utf-8')
    expect(countLines(lp)).toBe(10_000)

    appendStartupRecord(makeMarks(1))

    // Original file should now have 1 new line (fresh after rotate)
    expect(readLines()).toHaveLength(1)
    // The rotated file should exist
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- lp is inside OS tmpdir, safe test path
    expect(fs.existsSync(`${lp}.1.jsonl`)).toBe(true)
  })

  it('deletes .2.jsonl when rotating', async () => {
    const { appendStartupRecord } = await import('./perfStartupLog')

    const lp = logPath()
    const dot2 = `${lp}.2.jsonl`
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- dot2/lp are inside OS tmpdir, safe test paths
    fs.writeFileSync(dot2, '{"old":true}\n', 'utf-8')

    // Fill main file to trigger rotation
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- lp is inside OS tmpdir, safe test path
    fs.writeFileSync(lp, '{"filler":true}\n'.repeat(10_000), 'utf-8')
    appendStartupRecord(makeMarks(1))

    // eslint-disable-next-line security/detect-non-literal-fs-filename -- dot2 is inside OS tmpdir, safe test path
    expect(fs.existsSync(dot2)).toBe(false)
  })
})
