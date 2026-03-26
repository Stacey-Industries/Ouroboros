import { afterEach,beforeEach, describe, expect, it, vi } from 'vitest'

import type { ModuleAISummary, ModuleStructuralSummary } from './contextLayerTypes'
import type {
  SummarizationQueue,
  SummarizationQueueOptions,
} from './summarizationQueue'
import {
  createSummarizationQueue,
} from './summarizationQueue'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('./moduleSummarizer', () => ({
  summarizeModule: vi.fn(),
  shouldSummarize: vi.fn(() => true),
  selectSourceSnippets: vi.fn(() => []),
  estimateTokens: vi.fn((t: string) => Math.ceil(t.length / 4)),
}))

vi.mock('fs/promises', () => ({
  default: { readFile: vi.fn(async () => 'mock file content') },
  readFile: vi.fn(async () => 'mock file content'),
}))

import type { SummarizationResult } from './moduleSummarizer'
import { shouldSummarize,summarizeModule } from './moduleSummarizer'

const mockSummarizeModule = vi.mocked(summarizeModule)
const mockShouldSummarize = vi.mocked(shouldSummarize)

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeAISummary(moduleId: string, contentHash: string): ModuleAISummary {
  return {
    description: `Summary of ${moduleId}`,
    keyResponsibilities: ['responsibility-1', 'responsibility-2', 'responsibility-3'],
    gotchas: [],
    generatedAt: Date.now(),
    generatedFrom: contentHash,
    tokenCount: 50,
  }
}

function makeSuccessResult(moduleId: string, contentHash: string): SummarizationResult {
  return {
    success: true,
    summary: makeAISummary(moduleId, contentHash),
    inputTokens: 100,
    outputTokens: 50,
    durationMs: 200,
  }
}

function makeStructural(id: string): ModuleStructuralSummary {
  return {
    module: { id, label: id, rootPath: `src/${id}`, pattern: 'feature-folder' as const },
    fileCount: 5,
    totalLines: 200,
    languages: ['typescript'],
    exports: ['default'],
    imports: [],
    entryPoints: ['index.ts'],
    recentlyChanged: false,
    lastModified: Date.now(),
    contentHash: `hash-${id}`,
  }
}

function createTestQueue(overrides?: Partial<SummarizationQueueOptions>): SummarizationQueue {
  return createSummarizationQueue({
    workspaceRoot: '/test/project',
    readModuleEntry: vi.fn(async () => null),
    writeModuleEntry: vi.fn(async () => {}),
    readManifest: vi.fn(async () => ({
      version: 1 as const,
      lastFullRebuild: 0,
      lastIncrementalUpdate: 0,
      repoMapHash: '',
      moduleHashes: {},
      totalSizeBytes: 0,
    })),
    writeManifest: vi.fn(async () => {}),
    getModuleFiles: vi.fn(() => [{
      relativePath: 'index.ts',
      absolutePath: '/test/project/src/index.ts',
      size: 1000,
      language: 'typescript',
      imports: [],
    }]),
    getModuleStructural: vi.fn((id: string) => makeStructural(id)),
    projectContext: { languages: ['typescript'], frameworks: ['React'] },
    getDependencyContext: vi.fn(() => []),
    cooldownMs: 100, // Short for tests
    ...overrides,
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Advance by a specific number of ms, flushing microtasks at each tick. */
async function advanceBy(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('summarizationQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockSummarizeModule.mockReset()
    mockShouldSummarize.mockReset()
    mockShouldSummarize.mockReturnValue(true)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // -----------------------------------------------------------------------
  // 1. FIFO processing
  // -----------------------------------------------------------------------
  describe('FIFO processing', () => {
    it('processes modules in enqueue order with cooldowns between them', async () => {
      const callOrder: string[] = []
      mockSummarizeModule.mockImplementation(async (ctx) => {
        callOrder.push(ctx.module.module.id)
        return makeSuccessResult(ctx.module.module.id, ctx.module.contentHash)
      })

      const q = createTestQueue()
      q.enqueue(['alpha', 'beta', 'gamma'])

      // First job fires after cooldownMs (100ms)
      await advanceBy(100)
      expect(callOrder).toEqual(['alpha'])

      // Second job fires after another cooldownMs
      await advanceBy(100)
      expect(callOrder).toEqual(['alpha', 'beta'])

      // Third job fires after another cooldownMs
      await advanceBy(100)
      expect(callOrder).toEqual(['alpha', 'beta', 'gamma'])

      q.dispose()
    })
  })

  // -----------------------------------------------------------------------
  // 2. Deduplication
  // -----------------------------------------------------------------------
  describe('deduplication', () => {
    it('processes a module only once when enqueued twice', async () => {
      const callOrder: string[] = []
      mockSummarizeModule.mockImplementation(async (ctx) => {
        callOrder.push(ctx.module.module.id)
        return makeSuccessResult(ctx.module.module.id, ctx.module.contentHash)
      })

      const q = createTestQueue()
      q.enqueue(['file-tree'])
      q.enqueue(['file-tree'])

      await advanceBy(100)
      // Only one call despite two enqueues
      expect(callOrder).toEqual(['file-tree'])
      expect(mockSummarizeModule).toHaveBeenCalledTimes(1)

      q.dispose()
    })
  })

  // -----------------------------------------------------------------------
  // 3. Cooldown between jobs
  // -----------------------------------------------------------------------
  describe('cooldown between jobs', () => {
    it('does not start the second job before cooldownMs elapses', async () => {
      const callOrder: string[] = []
      mockSummarizeModule.mockImplementation(async (ctx) => {
        callOrder.push(ctx.module.module.id)
        return makeSuccessResult(ctx.module.module.id, ctx.module.contentHash)
      })

      const q = createTestQueue({ cooldownMs: 200 })
      q.enqueue(['mod-a', 'mod-b'])

      // After 200ms — first job fires
      await advanceBy(200)
      expect(callOrder).toEqual(['mod-a'])

      // After 50ms more (total 250ms) — second job hasn't fired yet
      await advanceBy(50)
      expect(callOrder).toEqual(['mod-a'])

      // After 150ms more (total 400ms) — second job fires
      await advanceBy(150)
      expect(callOrder).toEqual(['mod-a', 'mod-b'])

      q.dispose()
    })
  })

  // -----------------------------------------------------------------------
  // 4. Rate limit backoff
  // -----------------------------------------------------------------------
  describe('rate limit backoff', () => {
    it('applies exponential backoff on rate_limited errors and re-enqueues the module', async () => {
      let callCount = 0
      mockSummarizeModule.mockImplementation(async () => {
        callCount++
        return { success: false, error: 'rate_limited' }
      })

      const q = createTestQueue({ cooldownMs: 100 })
      q.enqueue(['rate-limited-mod'])

      // First call after cooldown (100ms)
      await advanceBy(100)
      expect(callCount).toBe(1)
      let st = q.status()
      expect(st.isRateLimited).toBe(true)
      // Module should be re-enqueued
      expect(st.queueLength).toBe(1)

      // Next call after initial backoff (10s)
      await advanceBy(10_000)
      expect(callCount).toBe(2)
      st = q.status()
      expect(st.isRateLimited).toBe(true)
      expect(st.queueLength).toBe(1)

      // Next call after doubled backoff (20s)
      await advanceBy(20_000)
      expect(callCount).toBe(3)
      st = q.status()
      expect(st.isRateLimited).toBe(true)

      q.dispose()
    })
  })

  // -----------------------------------------------------------------------
  // 5. Backoff reset on success
  // -----------------------------------------------------------------------
  describe('backoff reset on success', () => {
    it('resets backoff after a successful call following rate limiting', async () => {
      let callCount = 0
      mockSummarizeModule.mockImplementation(async (ctx) => {
        callCount++
        if (callCount === 1) {
          return { success: false, error: 'rate_limited' }
        }
        return makeSuccessResult(ctx.module.module.id, ctx.module.contentHash)
      })

      const q = createTestQueue({ cooldownMs: 100 })
      q.enqueue(['mod-x'])

      // First call — rate limited
      await advanceBy(100)
      expect(callCount).toBe(1)
      expect(q.status().isRateLimited).toBe(true)

      // Second call after backoff — succeeds
      await advanceBy(10_000)
      expect(callCount).toBe(2)
      expect(q.status().isRateLimited).toBe(false)

      q.dispose()
    })
  })

  // -----------------------------------------------------------------------
  // 6. Auth failure pauses queue
  // -----------------------------------------------------------------------
  describe('auth failure pauses queue', () => {
    it('pauses the queue and sets lastError to no_auth', async () => {
      mockSummarizeModule.mockResolvedValue({ success: false, error: 'no_auth' })

      const q = createTestQueue({ cooldownMs: 100 })
      q.enqueue(['auth-mod', 'other-mod'])

      await advanceBy(100)
      const st = q.status()
      expect(st.lastError).toBe('no_auth')
      // Queue should be paused — advancing timers should not process more
      expect(st.processing).toBeNull()

      // Verify other-mod is still in queue but not processing
      await advanceBy(500)
      expect(mockSummarizeModule).toHaveBeenCalledTimes(1)

      q.dispose()
    })
  })

  // -----------------------------------------------------------------------
  // 7. Pause/resume
  // -----------------------------------------------------------------------
  describe('pause/resume', () => {
    it('pauses processing and resumes on resume()', async () => {
      const callOrder: string[] = []
      mockSummarizeModule.mockImplementation(async (ctx) => {
        callOrder.push(ctx.module.module.id)
        return makeSuccessResult(ctx.module.module.id, ctx.module.contentHash)
      })

      const q = createTestQueue({ cooldownMs: 100 })
      q.enqueue(['paused-mod'])

      // Pause before the timer fires
      q.pause()

      // Advance well past cooldown — nothing should process
      await advanceBy(500)
      expect(callOrder).toEqual([])

      // Resume
      q.resume()

      // Now the cooldown starts again
      await advanceBy(100)
      expect(callOrder).toEqual(['paused-mod'])

      q.dispose()
    })
  })

  // -----------------------------------------------------------------------
  // 8. Dispose clears everything
  // -----------------------------------------------------------------------
  describe('dispose', () => {
    it('clears queue and stops processing; subsequent enqueue is a no-op', async () => {
      mockSummarizeModule.mockImplementation(async (ctx) => {
        return makeSuccessResult(ctx.module.module.id, ctx.module.contentHash)
      })

      const q = createTestQueue({ cooldownMs: 100 })
      q.enqueue(['a', 'b', 'c'])

      q.dispose()

      const st = q.status()
      expect(st.queueLength).toBe(0)
      expect(st.processing).toBeNull()

      // Subsequent enqueue should be no-op
      q.enqueue(['d', 'e'])
      expect(q.status().queueLength).toBe(0)

      // Advance timers — nothing should happen
      await advanceBy(1000)
      expect(mockSummarizeModule).not.toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // 9. Stale summary detection
  // -----------------------------------------------------------------------
  describe('stale summary detection', () => {
    it('skips summarization when existing AI summary matches contentHash', async () => {
      const moduleId = 'stale-mod'
      const structural = makeStructural(moduleId)
      const existingEntry = {
        structural,
        ai: makeAISummary(moduleId, structural.contentHash), // Same hash
      }

      const q = createTestQueue({
        cooldownMs: 100,
        readModuleEntry: vi.fn(async () => existingEntry),
        getModuleStructural: vi.fn(() => structural),
      })

      q.enqueue([moduleId])
      await advanceBy(100)

      // Should not call the summarizer
      expect(mockSummarizeModule).not.toHaveBeenCalled()

      q.dispose()
    })
  })

  // -----------------------------------------------------------------------
  // 10. shouldSummarize false skips module
  // -----------------------------------------------------------------------
  describe('shouldSummarize false', () => {
    it('skips a module without calling the API when shouldSummarize returns false', async () => {
      mockShouldSummarize.mockReturnValue(false)

      const q = createTestQueue({ cooldownMs: 100 })
      q.enqueue(['tiny-mod'])

      await advanceBy(100)
      expect(mockSummarizeModule).not.toHaveBeenCalled()

      q.dispose()
    })
  })

  // -----------------------------------------------------------------------
  // 11. Queue overflow
  // -----------------------------------------------------------------------
  describe('queue overflow', () => {
    it('drops oldest entries when queue exceeds maxQueueSize', async () => {
      // We use a large cooldown so nothing processes before we check size
      const q = createTestQueue({ cooldownMs: 60_000, maxQueueSize: 3 })
      q.pause() // Prevent processing so we can inspect the queue

      q.enqueue(['m1', 'm2', 'm3', 'm4', 'm5'])

      const st = q.status()
      expect(st.queueLength).toBe(3)

      q.dispose()
    })
  })

  // -----------------------------------------------------------------------
  // 12. Write module entry on success
  // -----------------------------------------------------------------------
  describe('write module entry on success', () => {
    it('calls writeModuleEntry with structural + AI data after successful summarization', async () => {
      const writeModuleEntry = vi.fn(async () => {})
      const structural = makeStructural('write-mod')

      mockSummarizeModule.mockImplementation(async () => {
        return makeSuccessResult('write-mod', structural.contentHash)
      })

      const q = createTestQueue({
        cooldownMs: 100,
        writeModuleEntry,
        getModuleStructural: vi.fn(() => structural),
      })

      q.enqueue(['write-mod'])
      await advanceBy(100)

      expect(writeModuleEntry).toHaveBeenCalledTimes(1)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [wsRoot, modId, entry] = writeModuleEntry.mock.calls[0] as any[]
      expect(wsRoot).toBe('/test/project')
      expect(modId).toBe('write-mod')
      expect(entry?.structural).toEqual(structural)
      expect(entry?.ai).toBeDefined()
      expect(entry?.ai!.description).toContain('write-mod')

      q.dispose()
    })
  })

  // -----------------------------------------------------------------------
  // 13. Manifest update on success
  // -----------------------------------------------------------------------
  describe('manifest update on success', () => {
    it('calls writeManifest with updated lastIncrementalUpdate and moduleHashes', async () => {
      const writeManifest = vi.fn(async () => {})
      const manifest = {
        version: 1 as const,
        lastFullRebuild: 0,
        lastIncrementalUpdate: 0,
        repoMapHash: '',
        moduleHashes: {},
        totalSizeBytes: 0,
      }
      const readManifest = vi.fn(async () => manifest)
      const structural = makeStructural('manifest-mod')

      mockSummarizeModule.mockImplementation(async () => {
        return makeSuccessResult('manifest-mod', structural.contentHash)
      })

      const q = createTestQueue({
        cooldownMs: 100,
        readManifest,
        writeManifest,
        getModuleStructural: vi.fn(() => structural),
      })

      q.enqueue(['manifest-mod'])
      await advanceBy(100)

      expect(writeManifest).toHaveBeenCalledTimes(1)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [wsRoot, writtenManifest] = writeManifest.mock.calls[0] as any[]
      expect(wsRoot).toBe('/test/project')
      expect(writtenManifest?.lastIncrementalUpdate).toBeGreaterThan(0)
      expect(writtenManifest?.moduleHashes['manifest-mod']).toBe(structural.contentHash)

      q.dispose()
    })
  })

  // -----------------------------------------------------------------------
  // 14. Network error with retries
  // -----------------------------------------------------------------------
  describe('network error with retries', () => {
    it('retries up to maxRetries times and eventually succeeds', async () => {
      let callCount = 0
      mockSummarizeModule.mockImplementation(async (ctx) => {
        callCount++
        if (callCount <= 2) {
          return { success: false, error: 'network_error' }
        }
        return makeSuccessResult(ctx.module.module.id, ctx.module.contentHash)
      })

      const writeModuleEntry = vi.fn(async () => {})
      const q = createTestQueue({
        cooldownMs: 100,
        maxRetries: 2,
        writeModuleEntry,
      })

      q.enqueue(['net-mod'])
      await advanceBy(100)

      // 3 total calls: initial + 2 retries
      expect(callCount).toBe(3)
      // Should succeed on the third call
      expect(writeModuleEntry).toHaveBeenCalledTimes(1)
      expect(q.status().totalProcessed).toBe(1)
      expect(q.status().totalFailed).toBe(0)

      q.dispose()
    })

    it('fails after exhausting retries', async () => {
      mockSummarizeModule.mockResolvedValue({ success: false, error: 'network_error' })

      const writeModuleEntry = vi.fn(async () => {})
      const q = createTestQueue({
        cooldownMs: 100,
        maxRetries: 2,
        writeModuleEntry,
      })

      q.enqueue(['fail-mod'])
      await advanceBy(100)

      // 3 total calls: initial + 2 retries, all fail
      expect(mockSummarizeModule).toHaveBeenCalledTimes(3)
      expect(writeModuleEntry).not.toHaveBeenCalled()
      expect(q.status().totalFailed).toBe(1)
      expect(q.status().lastError).toBe('network_error')

      q.dispose()
    })
  })

  // -----------------------------------------------------------------------
  // 15. Parse failure retries
  // -----------------------------------------------------------------------
  describe('parse failure retries', () => {
    it('does not retry parse_failure at queue level (summarizeModule already retried internally)', async () => {
      mockSummarizeModule.mockResolvedValue({ success: false, error: 'parse_failure' })

      const q = createTestQueue({ cooldownMs: 100, maxRetries: 2 })
      q.enqueue(['parse-mod'])

      await advanceBy(100)

      // parse_failure breaks immediately — summarizeModule already retried internally
      expect(mockSummarizeModule).toHaveBeenCalledTimes(1)
      expect(q.status().totalFailed).toBe(1)
      expect(q.status().lastError).toBe('parse_failure')

      q.dispose()
    })
  })

  // -----------------------------------------------------------------------
  // 16. Status reporting
  // -----------------------------------------------------------------------
  describe('status reporting', () => {
    it('reports correct counts after processing', async () => {
      let callIdx = 0
      mockSummarizeModule.mockImplementation(async (ctx) => {
        callIdx++
        if (callIdx === 2) {
          return { success: false, error: 'network_error' }
        }
        return makeSuccessResult(ctx.module.module.id, ctx.module.contentHash)
      })

      const q = createTestQueue({ cooldownMs: 100, maxRetries: 0 })
      q.enqueue(['s1', 's2', 's3'])

      // Process all three
      await advanceBy(100) // s1 succeeds
      await advanceBy(100) // s2 fails
      await advanceBy(100) // s3 succeeds

      const st = q.status()
      expect(st.totalProcessed).toBe(2)
      expect(st.totalFailed).toBe(1)
      expect(st.queueLength).toBe(0)
      expect(st.processing).toBeNull()
      expect(st.lastCompleted).toBe('s3')
      expect(st.lastError).toBe('network_error')

      q.dispose()
    })
  })

  // -----------------------------------------------------------------------
  // 17. Enabled=false
  // -----------------------------------------------------------------------
  describe('enabled=false', () => {
    it('does not process anything when queue is created with enabled=false', async () => {
      mockSummarizeModule.mockImplementation(async (ctx) => {
        return makeSuccessResult(ctx.module.module.id, ctx.module.contentHash)
      })

      const q = createTestQueue({ enabled: false, cooldownMs: 100 })
      q.enqueue(['disabled-mod'])

      await advanceBy(500)
      expect(mockSummarizeModule).not.toHaveBeenCalled()
      expect(q.status().queueLength).toBe(0)

      q.dispose()
    })
  })

  // -----------------------------------------------------------------------
  // Additional edge cases
  // -----------------------------------------------------------------------
  describe('edge cases', () => {
    it('skips sentinel values (__all__, __new_files__)', async () => {
      mockSummarizeModule.mockImplementation(async (ctx) => {
        return makeSuccessResult(ctx.module.module.id, ctx.module.contentHash)
      })

      const q = createTestQueue({ cooldownMs: 100 })
      q.enqueue(['__all__', '__new_files__', 'real-mod'])

      await advanceBy(100)
      expect(mockSummarizeModule).toHaveBeenCalledTimes(1)
      expect(q.status().queueLength).toBe(0)

      q.dispose()
    })

    it('handles null from getModuleStructural gracefully', async () => {
      const q = createTestQueue({
        cooldownMs: 100,
        getModuleStructural: vi.fn(() => null),
      })

      q.enqueue(['missing-structural'])
      await advanceBy(100)

      // Should not call summarizer
      expect(mockSummarizeModule).not.toHaveBeenCalled()
      // Should not count as a failure either
      expect(q.status().totalFailed).toBe(0)

      q.dispose()
    })

    it('continues processing remaining modules after one is skipped', async () => {
      const callOrder: string[] = []
      mockSummarizeModule.mockImplementation(async (ctx) => {
        callOrder.push(ctx.module.module.id)
        return makeSuccessResult(ctx.module.module.id, ctx.module.contentHash)
      })

      const getModuleStructural = vi.fn((id: string) => {
        if (id === 'skip-me') return null
        return makeStructural(id)
      })

      const q = createTestQueue({
        cooldownMs: 100,
        getModuleStructural,
      })

      q.enqueue(['skip-me', 'keep-me'])

      // First job — skip-me returns null, so it schedules next
      await advanceBy(100)
      // Second job — keep-me should process
      await advanceBy(100)

      expect(callOrder).toEqual(['keep-me'])

      q.dispose()
    })
  })
})
