import { beforeEach,describe, expect, it, vi } from 'vitest'

import type { GCOptions } from './contextLayerGC'
import { runContextLayerGC } from './contextLayerGC'
import type { ModuleAISummary,ModuleContextEntry } from './contextLayerTypes'

// ---------------------------------------------------------------------------
// Mock the store module
// ---------------------------------------------------------------------------

vi.mock('./contextLayerStore', () => ({
  readAllModuleEntries: vi.fn(),
  deleteModuleEntry: vi.fn(),
  enforceSizeCap: vi.fn(),
}))

import {
  deleteModuleEntry,
  enforceSizeCap,
  readAllModuleEntries,
} from './contextLayerStore'

const mockReadAll = vi.mocked(readAllModuleEntries)
const mockDelete = vi.mocked(deleteModuleEntry)
const mockEnforceSizeCap = vi.mocked(enforceSizeCap)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000
const SEVEN_DAYS_MS = 7 * DAY_MS

function mockEntry(id: string, overrides?: {
  lastModified?: number
  fileCount?: number
  hasAI?: boolean
}): ModuleContextEntry {
  const entry: ModuleContextEntry = {
    structural: {
      module: {
        id,
        label: id,
        rootPath: `src/${id}`,
        pattern: 'feature-folder',
      },
      fileCount: overrides?.fileCount ?? 5,
      totalLines: 200,
      languages: ['typescript'],
      exports: ['default'],
      imports: [],
      entryPoints: [`src/${id}/index.ts`],
      recentlyChanged: false,
      lastModified: overrides?.lastModified ?? Date.now(),
      contentHash: `hash-${id}`,
    },
  }

  if (overrides?.hasAI) {
    entry.ai = {
      description: `AI summary for ${id}`,
      keyResponsibilities: ['responsibility-1'],
      gotchas: [],
      generatedAt: Date.now(),
      generatedFrom: `hash-${id}`,
      tokenCount: 100,
    } satisfies ModuleAISummary
  }

  return entry
}

function defaultOptions(overrides?: Partial<GCOptions>): GCOptions {
  return {
    workspaceRoot: '/test/workspace',
    currentModuleIds: new Set<string>(),
    maxModules: 50,
    maxSizeBytes: 200 * 1024,
    maxStalenessMs: SEVEN_DAYS_MS,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('contextLayerGC', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDelete.mockResolvedValue(undefined)
    mockEnforceSizeCap.mockResolvedValue(undefined)
  })

  // -----------------------------------------------------------------------
  // 1. Orphan sweep — deletes modules not in currentModuleIds
  // -----------------------------------------------------------------------

  it('orphan sweep — deletes modules not in currentModuleIds', async () => {
    const entries = [
      mockEntry('alpha'),
      mockEntry('beta'),
      mockEntry('gamma'),
      mockEntry('delta'),
      mockEntry('epsilon'),
    ]

    // First call: initial read; second call (pass 4): after size cap
    mockReadAll
      .mockResolvedValueOnce(entries)
      .mockResolvedValueOnce([entries[0], entries[2], entries[4]])
      .mockResolvedValueOnce([entries[0], entries[2], entries[4]])

    const result = await runContextLayerGC(defaultOptions({
      currentModuleIds: new Set(['alpha', 'gamma', 'epsilon']),
    }))

    expect(result.deletedOrphans).toContain('beta')
    expect(result.deletedOrphans).toContain('delta')
    expect(result.deletedOrphans).toHaveLength(2)
    expect(mockDelete).toHaveBeenCalledWith('/test/workspace', 'beta')
    expect(mockDelete).toHaveBeenCalledWith('/test/workspace', 'delta')
  })

  // -----------------------------------------------------------------------
  // 2. Orphan sweep — no orphans
  // -----------------------------------------------------------------------

  it('orphan sweep — no orphans when all entries are in currentModuleIds', async () => {
    const entries = [
      mockEntry('alpha'),
      mockEntry('beta'),
    ]

    mockReadAll
      .mockResolvedValueOnce(entries)
      .mockResolvedValueOnce(entries)
      .mockResolvedValueOnce(entries)

    const result = await runContextLayerGC(defaultOptions({
      currentModuleIds: new Set(['alpha', 'beta']),
    }))

    expect(result.deletedOrphans).toEqual([])
  })

  // -----------------------------------------------------------------------
  // 3. Staleness sweep — deletes old modules
  // -----------------------------------------------------------------------

  it('staleness sweep — deletes modules older than maxStalenessMs', async () => {
    const eightDaysAgo = Date.now() - 8 * DAY_MS
    const entries = [
      mockEntry('fresh', { lastModified: Date.now() }),
      mockEntry('stale', { lastModified: eightDaysAgo }),
    ]

    mockReadAll
      .mockResolvedValueOnce(entries)
      .mockResolvedValueOnce([entries[0]])
      .mockResolvedValueOnce([entries[0]])

    const result = await runContextLayerGC(defaultOptions({
      currentModuleIds: new Set(['fresh', 'stale']),
    }))

    expect(result.deletedStale).toContain('stale')
    expect(result.deletedStale).toHaveLength(1)
    expect(result.deletedOrphans).toEqual([])
  })

  // -----------------------------------------------------------------------
  // 4. Staleness sweep — keeps recent modules
  // -----------------------------------------------------------------------

  it('staleness sweep — keeps modules newer than maxStalenessMs', async () => {
    const twoDaysAgo = Date.now() - 2 * DAY_MS
    const entries = [
      mockEntry('recent', { lastModified: twoDaysAgo }),
    ]

    mockReadAll
      .mockResolvedValueOnce(entries)
      .mockResolvedValueOnce(entries)
      .mockResolvedValueOnce(entries)

    const result = await runContextLayerGC(defaultOptions({
      currentModuleIds: new Set(['recent']),
    }))

    expect(result.deletedStale).toEqual([])
  })

  // -----------------------------------------------------------------------
  // 5. Staleness sweep — AI entries get double threshold
  // -----------------------------------------------------------------------

  it('staleness sweep — AI entries get double staleness threshold', async () => {
    const tenDaysAgo = Date.now() - 10 * DAY_MS
    const fifteenDaysAgo = Date.now() - 15 * DAY_MS

    const entries = [
      mockEntry('ai-recent', { lastModified: tenDaysAgo, hasAI: true }),
      mockEntry('ai-old', { lastModified: fifteenDaysAgo, hasAI: true }),
    ]

    mockReadAll
      .mockResolvedValueOnce(entries)
      .mockResolvedValueOnce([entries[0]])
      .mockResolvedValueOnce([entries[0]])

    const result = await runContextLayerGC(defaultOptions({
      currentModuleIds: new Set(['ai-recent', 'ai-old']),
    }))

    // 10 days < 14 days threshold → kept
    expect(result.deletedStale).not.toContain('ai-recent')
    // 15 days > 14 days threshold → deleted
    expect(result.deletedStale).toContain('ai-old')
    expect(result.deletedStale).toHaveLength(1)
  })

  // -----------------------------------------------------------------------
  // 6. Size cap enforcement — calls enforceSizeCap with correct args
  // -----------------------------------------------------------------------

  it('size cap enforcement — calls enforceSizeCap with correct args', async () => {
    const entries = [mockEntry('alpha')]

    mockReadAll
      .mockResolvedValueOnce(entries)
      .mockResolvedValueOnce(entries)
      .mockResolvedValueOnce(entries)

    const maxSizeBytes = 150 * 1024

    await runContextLayerGC(defaultOptions({
      currentModuleIds: new Set(['alpha']),
      maxSizeBytes,
    }))

    expect(mockEnforceSizeCap).toHaveBeenCalledWith('/test/workspace', maxSizeBytes)
    expect(mockEnforceSizeCap).toHaveBeenCalledTimes(1)
  })

  // -----------------------------------------------------------------------
  // 7. Module count enforcement — deletes smallest
  // -----------------------------------------------------------------------

  it('module count enforcement — deletes smallest modules when over limit', async () => {
    const maxModules = 50
    const entries: ModuleContextEntry[] = []
    for (let i = 0; i < 55; i++) {
      entries.push(mockEntry(`mod-${i}`, { fileCount: i + 1 }))
    }

    // First call: initial read (all 55 present, none orphaned/stale)
    mockReadAll
      .mockResolvedValueOnce(entries)
      // After size cap: still all 55 (size cap didn't evict any)
      .mockResolvedValueOnce(entries)
      // After count enforcement: for byte tracking
      .mockResolvedValueOnce(entries.slice(5))

    const result = await runContextLayerGC(defaultOptions({
      currentModuleIds: new Set(entries.map((e) => e.structural.module.id)),
      maxModules,
    }))

    // Smallest 5 modules should be deleted (fileCount 1..5 → mod-0..mod-4)
    expect(result.deletedOverflow).toHaveLength(5)
    expect(result.deletedOverflow).toContain('mod-0')
    expect(result.deletedOverflow).toContain('mod-1')
    expect(result.deletedOverflow).toContain('mod-2')
    expect(result.deletedOverflow).toContain('mod-3')
    expect(result.deletedOverflow).toContain('mod-4')
  })

  // -----------------------------------------------------------------------
  // 8. Module count enforcement — already under limit
  // -----------------------------------------------------------------------

  it('module count enforcement — no deletions when under limit', async () => {
    const entries: ModuleContextEntry[] = []
    for (let i = 0; i < 30; i++) {
      entries.push(mockEntry(`mod-${i}`))
    }

    mockReadAll
      .mockResolvedValueOnce(entries)
      .mockResolvedValueOnce(entries)
      .mockResolvedValueOnce(entries)

    const result = await runContextLayerGC(defaultOptions({
      currentModuleIds: new Set(entries.map((e) => e.structural.module.id)),
      maxModules: 50,
    }))

    expect(result.deletedOverflow).toEqual([])
  })

  // -----------------------------------------------------------------------
  // 9. Empty store — all results empty
  // -----------------------------------------------------------------------

  it('empty store — readAllModuleEntries returns [] → all results empty', async () => {
    mockReadAll
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    const result = await runContextLayerGC(defaultOptions())

    expect(result.deletedOrphans).toEqual([])
    expect(result.deletedStale).toEqual([])
    expect(result.deletedOverflow).toEqual([])
    expect(result.reclaimedBytes).toBe(0)
    expect(mockDelete).not.toHaveBeenCalled()
  })

  // -----------------------------------------------------------------------
  // 10. All orphaned — currentModuleIds is empty
  // -----------------------------------------------------------------------

  it('all orphaned — empty currentModuleIds deletes everything in pass 1', async () => {
    const entries = [
      mockEntry('alpha'),
      mockEntry('beta'),
      mockEntry('gamma'),
    ]

    // After orphan sweep, all are deleted → subsequent reads return empty
    mockReadAll
      .mockResolvedValueOnce(entries)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    const result = await runContextLayerGC(defaultOptions({
      currentModuleIds: new Set(),
    }))

    expect(result.deletedOrphans).toHaveLength(3)
    expect(result.deletedOrphans).toContain('alpha')
    expect(result.deletedOrphans).toContain('beta')
    expect(result.deletedOrphans).toContain('gamma')
    // Passes 2-4 are no-ops since entries are empty
    expect(result.deletedStale).toEqual([])
    expect(result.deletedOverflow).toEqual([])
  })

  // -----------------------------------------------------------------------
  // 11. Delete failure handled gracefully
  // -----------------------------------------------------------------------

  it('delete failure handled gracefully — continues with other modules', async () => {
    const entries = [
      mockEntry('good'),
      mockEntry('bad'),
      mockEntry('also-good'),
    ]

    mockDelete
      .mockResolvedValueOnce(undefined)  // good → success
      .mockRejectedValueOnce(new Error('disk failure'))  // bad → fails
      .mockResolvedValueOnce(undefined)  // also-good → success

    // All are orphans (currentModuleIds is empty)
    mockReadAll
      .mockResolvedValueOnce(entries)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    const result = await runContextLayerGC(defaultOptions({
      currentModuleIds: new Set(),
    }))

    // 'bad' is not in the result because its delete failed
    expect(result.deletedOrphans).toContain('good')
    expect(result.deletedOrphans).toContain('also-good')
    expect(result.deletedOrphans).not.toContain('bad')
    expect(result.deletedOrphans).toHaveLength(2)
  })

  // -----------------------------------------------------------------------
  // 12. reclaimedBytes tracking
  // -----------------------------------------------------------------------

  it('reclaimedBytes tracking — reports correct byte difference', async () => {
    const entries = [
      mockEntry('alpha'),
      mockEntry('beta'),
      mockEntry('gamma'),
    ]
    const survivingEntries = [entries[0]]

    // Pre-GC: all 3; post-size-cap re-read: 1 survivor; final re-read: 1 survivor
    mockReadAll
      .mockResolvedValueOnce(entries)
      .mockResolvedValueOnce(survivingEntries)
      .mockResolvedValueOnce(survivingEntries)

    const totalBefore = entries.reduce((s, e) => s + JSON.stringify(e).length, 0)
    const totalAfter = survivingEntries.reduce((s, e) => s + JSON.stringify(e).length, 0)
    const expectedReclaimed = totalBefore - totalAfter

    const result = await runContextLayerGC(defaultOptions({
      currentModuleIds: new Set(['alpha']),
    }))

    expect(result.reclaimedBytes).toBe(expectedReclaimed)
    expect(result.reclaimedBytes).toBeGreaterThan(0)
  })

  // -----------------------------------------------------------------------
  // 13. No-op result — nothing to delete
  // -----------------------------------------------------------------------

  it('no-op result — all arrays empty and reclaimedBytes is 0', async () => {
    const entries = [mockEntry('alpha')]

    mockReadAll
      .mockResolvedValueOnce(entries)
      .mockResolvedValueOnce(entries)
      .mockResolvedValueOnce(entries)

    const result = await runContextLayerGC(defaultOptions({
      currentModuleIds: new Set(['alpha']),
      maxModules: 50,
    }))

    expect(result.deletedOrphans).toEqual([])
    expect(result.deletedStale).toEqual([])
    expect(result.deletedOverflow).toEqual([])
    expect(result.reclaimedBytes).toBe(0)
  })
})
