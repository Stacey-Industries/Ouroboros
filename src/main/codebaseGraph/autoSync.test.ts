/**
 * autoSync.test.ts — Unit tests for AutoSyncWatcher.
 *
 * Covers: 300ms application-layer debounce, onLaunchDiff stat comparison,
 * initWithLaunchDiff triggering reindex on stale files.
 */

import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Hoisted mock — AutoSyncWatcher.triggerReindex routes through the shared
// IndexingWorkerClient singleton (not pipeline.index directly). Stub the
// worker client so the unit test can observe reindex invocations without
// spawning a real worker thread.
const mockRunIndex = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    success: true,
    filesIndexed: 1,
    filesSkipped: 0,
    nodesCreated: 0,
    edgesCreated: 0,
    errors: [],
    durationMs: 10,
    incremental: true,
    projectName: 'test',
  }),
)
vi.mock('./indexingWorkerClient', () => ({
  getIndexingWorkerClient: () => ({ runIndex: mockRunIndex }),
}))

import type { AutoSyncOptions } from './autoSync'
import { AutoSyncWatcher } from './autoSync'
import type { GraphDatabase } from './graphDatabase'
import type { IndexingPipeline } from './indexingPipeline'

// ─── Helpers ──────────────────────────────────────────────────────────────────

type FakeHashRecord = {
  project: string
  rel_path: string
  content_hash: string
  mtime_ns: number
  size: number
}

function makeDb(hashes: FakeHashRecord[] = []): GraphDatabase {
  return {
    getNodeCount: vi.fn().mockReturnValue(0),
    getAllFileHashes: vi.fn().mockReturnValue(hashes),
  } as unknown as GraphDatabase
}

function makePipeline(): IndexingPipeline {
  return {
    index: vi.fn().mockResolvedValue({
      success: true,
      filesIndexed: 1,
      filesSkipped: 0,
      nodesCreated: 0,
      edgesCreated: 0,
      errors: [],
      durationMs: 10,
      incremental: true,
      projectName: 'test',
    }),
  } as unknown as IndexingPipeline
}

function makeOpts(overrides: Partial<AutoSyncOptions> = {}): AutoSyncOptions {
  return {
    projectRoot: '/tmp/test-project',
    projectName: 'test-project',
    db: makeDb(),
    pipeline: makePipeline(),
    ...overrides,
  }
}

// ─── 300ms application-layer debounce ─────────────────────────────────────────

describe('receiveWatcherEvent — 300ms app-layer debounce', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('fires onFileChange once after 300ms silence when events arrive rapidly', () => {
    const onFileChange = vi.fn()
    const watcher = new AutoSyncWatcher(makeOpts())
    // Spy on the public onFileChange to count invocations
    vi.spyOn(watcher, 'onFileChange').mockImplementation(onFileChange)

    // Fire 5 events within 100ms
    watcher.receiveWatcherEvent('/tmp/test-project/a.ts')
    watcher.receiveWatcherEvent('/tmp/test-project/b.ts')
    vi.advanceTimersByTime(50)
    watcher.receiveWatcherEvent('/tmp/test-project/c.ts')
    watcher.receiveWatcherEvent('/tmp/test-project/d.ts')
    vi.advanceTimersByTime(50)
    watcher.receiveWatcherEvent('/tmp/test-project/e.ts')

    // No drain yet — 300ms has not elapsed since last event
    expect(onFileChange).not.toHaveBeenCalled()

    // Advance past the debounce window
    vi.advanceTimersByTime(300)

    // Drain fires exactly once with all 5 deduplicated paths
    expect(onFileChange).toHaveBeenCalledTimes(1)
    const paths: string[] = onFileChange.mock.calls[0][0]
    expect(paths).toHaveLength(5)
    expect(paths).toContain('/tmp/test-project/a.ts')
    expect(paths).toContain('/tmp/test-project/e.ts')
  })

  it('deduplicates the same path sent multiple times', () => {
    const onFileChange = vi.fn()
    const watcher = new AutoSyncWatcher(makeOpts())
    vi.spyOn(watcher, 'onFileChange').mockImplementation(onFileChange)

    watcher.receiveWatcherEvent('/tmp/test-project/a.ts')
    watcher.receiveWatcherEvent('/tmp/test-project/a.ts')
    watcher.receiveWatcherEvent('/tmp/test-project/a.ts')
    vi.advanceTimersByTime(300)

    expect(onFileChange).toHaveBeenCalledTimes(1)
    const paths: string[] = onFileChange.mock.calls[0][0]
    expect(paths).toHaveLength(1)
  })

  it('resets the 300ms window on each new event', () => {
    const onFileChange = vi.fn()
    const watcher = new AutoSyncWatcher(makeOpts())
    vi.spyOn(watcher, 'onFileChange').mockImplementation(onFileChange)

    watcher.receiveWatcherEvent('/tmp/test-project/a.ts')
    vi.advanceTimersByTime(299)
    // Reset: a new event arrives before timeout fires
    watcher.receiveWatcherEvent('/tmp/test-project/b.ts')
    vi.advanceTimersByTime(299)
    // Still not fired — window was reset
    expect(onFileChange).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onFileChange).toHaveBeenCalledTimes(1)
  })

  it('does not fire after dispose', () => {
    const onFileChange = vi.fn()
    const watcher = new AutoSyncWatcher(makeOpts())
    vi.spyOn(watcher, 'onFileChange').mockImplementation(onFileChange)

    watcher.receiveWatcherEvent('/tmp/test-project/a.ts')
    watcher.dispose()
    vi.advanceTimersByTime(400)
    expect(onFileChange).not.toHaveBeenCalled()
  })
})

// ─── onLaunchDiff ─────────────────────────────────────────────────────────────

describe('onLaunchDiff', () => {
  it('returns empty result when DB has no hashes', async () => {
    const watcher = new AutoSyncWatcher(makeOpts({ db: makeDb([]) }))
    const result = await watcher.onLaunchDiff()
    expect(result.changed).toHaveLength(0)
    expect(result.deleted).toHaveLength(0)
  })

  it('classifies a missing file as deleted', async () => {
    const hash: FakeHashRecord = {
      project: 'test-project',
      rel_path: 'src/gone.ts',
      content_hash: 'abc',
      mtime_ns: 1000000,
      size: 100,
    }
    const watcher = new AutoSyncWatcher(makeOpts({ db: makeDb([hash]) }))
    const result = await watcher.onLaunchDiff()
    expect(result.deleted).toContain('src/gone.ts')
    expect(result.changed).toHaveLength(0)
  })

  it('classifies a file with different mtime as changed', async () => {
    // Use a file that actually exists on disk
    const fs = await import('fs/promises')
    const realPath = path.join(process.cwd(), 'package.json')
    const stat = await fs.stat(realPath)
    const relPath = 'package.json'
    const staleMtimeNs = Math.floor(stat.mtimeMs * 1e6) - 1_000_000 // 1ms earlier

    const hash: FakeHashRecord = {
      project: 'test-project',
      rel_path: relPath,
      content_hash: 'stale',
      mtime_ns: staleMtimeNs,
      size: stat.size,
    }
    const watcher = new AutoSyncWatcher(makeOpts({
      projectRoot: process.cwd(),
      db: makeDb([hash]),
    }))
    const result = await watcher.onLaunchDiff()
    expect(result.changed).toContain(relPath)
    expect(result.deleted).toHaveLength(0)
  })

  it('classifies a file with matching mtime+size as unchanged', async () => {
    const fs = await import('fs/promises')
    const realPath = path.join(process.cwd(), 'package.json')
    const stat = await fs.stat(realPath)
    const mtimeNs = Math.floor(stat.mtimeMs * 1e6)
    const relPath = 'package.json'

    const hash: FakeHashRecord = {
      project: 'test-project',
      rel_path: relPath,
      content_hash: 'current',
      mtime_ns: mtimeNs,
      size: stat.size,
    }
    const watcher = new AutoSyncWatcher(makeOpts({
      projectRoot: process.cwd(),
      db: makeDb([hash]),
    }))
    const result = await watcher.onLaunchDiff()
    expect(result.changed).not.toContain(relPath)
    expect(result.deleted).not.toContain(relPath)
  })
})

// ─── initWithLaunchDiff ───────────────────────────────────────────────────────

describe('initWithLaunchDiff', () => {
  it('triggers reindex when there are stale files', async () => {
    const hash: FakeHashRecord = {
      project: 'test-project',
      rel_path: 'src/gone.ts',
      content_hash: 'abc',
      mtime_ns: 1000000,
      size: 100,
    }
    mockRunIndex.mockClear()
    const pipeline = makePipeline()
    const watcher = new AutoSyncWatcher(makeOpts({ db: makeDb([hash]), pipeline }))
    await watcher.initWithLaunchDiff()
    expect(mockRunIndex).toHaveBeenCalled()
  })

  it('does not trigger reindex when catalog is current', async () => {
    mockRunIndex.mockClear()
    const pipeline = makePipeline()
    // No hashes → nothing stale
    const watcher = new AutoSyncWatcher(makeOpts({ db: makeDb([]), pipeline }))
    await watcher.initWithLaunchDiff()
    expect(mockRunIndex).not.toHaveBeenCalled()
  })
})
