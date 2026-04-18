/**
 * promptDiff.test.ts — Unit tests for Wave 37 Phase B prompt diff logic.
 *
 * Covers: first-run (no snapshot), same version+hash, changed version,
 * changed prompt above threshold, changed prompt below threshold.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mock dependencies before importing the module under test ─────────────────

vi.mock('./config', () => ({
  getConfigValue: vi.fn(),
  setConfigValue: vi.fn(),
}))

vi.mock('./logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}))

import { execFile } from 'child_process'

import { getConfigValue, setConfigValue } from './config'
import type { PromptDiffSnapshot } from './promptDiff'
import { checkPromptChanged } from './promptDiff'

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>
const mockGetConfig = getConfigValue as unknown as ReturnType<typeof vi.fn>
const mockSetConfig = setConfigValue as unknown as ReturnType<typeof vi.fn>

function stubCliVersion(version: string): void {
  mockExecFile.mockImplementation(
    (_cmd: string, _args: string[], _opts: unknown, cb: (err: null, stdout: string) => void) => {
      cb(null, `${version}\n`)
    },
  )
}

function stubSnapshot(snapshot: PromptDiffSnapshot | null): void {
  mockGetConfig.mockReturnValue(
    snapshot ? { lastSeenSnapshot: snapshot } : null,
  )
}

function makeSnapshot(overrides: Partial<PromptDiffSnapshot> = {}): PromptDiffSnapshot {
  return {
    cliVersion: '1.0.0',
    capturedAt: Date.now() - 10000,
    promptHash: 'abc123',
    promptText: 'Hello world\nLine two\nLine three',
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('checkPromptChanged', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubCliVersion('1.0.0')
  })

  it('returns changed:false and saves snapshot on first run (no stored snapshot)', async () => {
    stubSnapshot(null)

    const result = await checkPromptChanged('My prompt text\nLine two\nLine three')

    expect(result.changed).toBe(false)
    expect(mockSetConfig).toHaveBeenCalledOnce()
    const [key, val] = mockSetConfig.mock.calls[0] as [string, { lastSeenSnapshot: PromptDiffSnapshot }]
    expect(key).toBe('ecosystem')
    expect(val.lastSeenSnapshot.cliVersion).toBe('1.0.0')
  })

  it('returns changed:false when version and hash both match', async () => {
    // Build a snapshot whose promptHash matches the text we will pass in.
    // We derive the expected hash by importing sha256 — but since it is not
    // exported, we rely on the invariant: same input → same output.
    const promptText = 'Hello world\nLine two\nLine three'
    // First call to populate the real hash.
    stubSnapshot(null)
    await checkPromptChanged(promptText)

    // Capture what was stored.
    const stored = (mockSetConfig.mock.calls[0] as [string, { lastSeenSnapshot: PromptDiffSnapshot }])[1].lastSeenSnapshot
    mockSetConfig.mockClear()
    mockGetConfig.mockClear()

    stubSnapshot(stored)
    const result = await checkPromptChanged(promptText)

    expect(result.changed).toBe(false)
  })

  it('returns changed:true when CLI version changed and diff >= 3 lines', async () => {
    const oldText = 'Line A\nLine B\nLine C\nLine D'
    const newText = 'Line A\nLine X\nLine Y\nLine Z'

    const snapshot = makeSnapshot({ cliVersion: '0.9.0', promptText: oldText })
    stubSnapshot(snapshot)
    stubCliVersion('1.0.0')

    const result = await checkPromptChanged(newText)

    expect(result.changed).toBe(true)
    if (result.changed) {
      expect(result.linesAdded + result.linesRemoved).toBeGreaterThanOrEqual(3)
      expect(result.previousText).toBe(oldText)
      expect(result.currentText).toBe(newText)
    }
  })

  it('returns changed:true when prompt hash changed and diff >= 3 lines (same version)', async () => {
    const oldText = 'alpha\nbeta\ngamma\ndelta'
    const newText = 'alpha\nXXX\nYYY\nZZZ'

    const snapshot = makeSnapshot({ cliVersion: '1.0.0', promptText: oldText, promptHash: 'stale' })
    stubSnapshot(snapshot)

    const result = await checkPromptChanged(newText)

    expect(result.changed).toBe(true)
    if (result.changed) {
      expect(result.linesAdded + result.linesRemoved).toBeGreaterThanOrEqual(3)
    }
  })

  it('returns changed:false when diff is below 3-line threshold (sub-threshold suppression)', async () => {
    const oldText = 'Line A\nLine B\nLine C'
    // Change only 1 line — below the 3-line threshold
    const newText = 'Line A\nLine B\nLine C-modified'

    const snapshot = makeSnapshot({ cliVersion: '0.9.0', promptText: oldText })
    stubSnapshot(snapshot)
    stubCliVersion('1.0.0')

    const result = await checkPromptChanged(newText)

    expect(result.changed).toBe(false)
    // Snapshot is still updated (so we don't re-fire next launch)
    expect(mockSetConfig).toHaveBeenCalled()
  })

  it('stores updated snapshot even when returning changed:false (sub-threshold)', async () => {
    const snapshot = makeSnapshot({ cliVersion: '0.8.0', promptText: 'A\nB\nC' })
    stubSnapshot(snapshot)
    stubCliVersion('1.0.0')

    await checkPromptChanged('A\nB\nC-tweaked')

    expect(mockSetConfig).toHaveBeenCalledWith(
      'ecosystem',
      expect.objectContaining({ lastSeenSnapshot: expect.objectContaining({ cliVersion: '1.0.0' }) }),
    )
  })
})
