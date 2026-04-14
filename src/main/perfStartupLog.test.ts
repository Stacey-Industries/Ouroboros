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

describe('readRecentStartups', () => {
  beforeEach(() => {
    vi.resetModules()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-read-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  function writeRecords(filePath: string, count: number, offset = 0): void {
    const lines = Array.from({ length: count }, (_, i) => {
      const rec = {
        ts: new Date(Date.UTC(2026, 0, 1, 0, 0, i + offset)).toISOString(),
        timings: [{ phase: 'first-render', tsNs: '1000000', deltaMs: (i + offset + 1) * 100 }],
        platform: 'linux',
        version: '1.0.0',
      }
      return JSON.stringify(rec)
    }).join('\n') + '\n'
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath is inside OS tmpdir, safe test path
    fs.writeFileSync(filePath, lines, 'utf-8')
  }

  it('returns empty array when no file exists', async () => {
    const { readRecentStartups } = await import('./perfStartupLog')
    const result = await readRecentStartups(20)
    expect(result).toEqual([])
  })

  it('returns all records from a single-record file', async () => {
    writeRecords(logPath(), 1)
    const { readRecentStartups } = await import('./perfStartupLog')
    const result = await readRecentStartups(20)
    expect(result).toHaveLength(1)
  })

  it('truncates to limit when file has more records', async () => {
    writeRecords(logPath(), 30)
    const { readRecentStartups } = await import('./perfStartupLog')
    const result = await readRecentStartups(5)
    expect(result).toHaveLength(5)
  })

  it('reads from rotation file when primary has fewer records than limit', async () => {
    // Write 3 records to rotation file, 2 to primary
    writeRecords(`${logPath()}.1.jsonl`, 3, 0)
    writeRecords(logPath(), 2, 3)
    const { readRecentStartups } = await import('./perfStartupLog')
    const result = await readRecentStartups(20)
    expect(result).toHaveLength(5)
  })

  it('skips malformed lines without crashing', async () => {
    const lp = logPath()
    const content = [
      JSON.stringify({ ts: '2026-01-01T00:00:00.000Z', timings: [], platform: 'linux', version: '1.0.0' }),
      'NOT VALID JSON {{{',
      JSON.stringify({ ts: '2026-01-01T00:01:00.000Z', timings: [], platform: 'linux', version: '1.0.0' }),
    ].join('\n') + '\n'
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- lp is inside OS tmpdir, safe test path
    fs.writeFileSync(lp, content, 'utf-8')

    const { readRecentStartups } = await import('./perfStartupLog')
    const result = await readRecentStartups(20)
    // Only the 2 valid lines should be returned
    expect(result).toHaveLength(2)
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
