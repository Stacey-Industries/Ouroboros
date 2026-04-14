/**
 * indexingWorkerClient.test.ts — Unit tests for IndexingWorkerClient.
 *
 * Mocks the Worker constructor so no actual worker thread is spawned.
 * Verifies: message round-trip, promise resolution on 'result', rejection on
 * 'error', progress callback invocation, and request queuing.
 */

import { EventEmitter } from 'events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ── Worker mock ───────────────────────────────────────────────────────────────

class MockWorker extends EventEmitter {
  static lastInstance: MockWorker | null = null
  postMessage = vi.fn()
  terminate = vi.fn().mockResolvedValue(0)

  constructor() {
    super()
    MockWorker.lastInstance = this
  }
}

vi.mock('worker_threads', () => ({
  Worker: MockWorker,
}))

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeResult() {
  return {
    projectName: 'proj',
    success: true,
    filesIndexed: 5,
    filesSkipped: 0,
    nodesCreated: 20,
    edgesCreated: 8,
    errors: [] as string[],
    durationMs: 100,
    incremental: false,
  }
}

function makeOptions(overrides = {}) {
  return {
    projectRoot: '/tmp/proj',
    projectName: 'proj',
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('IndexingWorkerClient', () => {
  let client: import('./indexingWorkerClient').IndexingWorkerClient

  beforeEach(async () => {
    MockWorker.lastInstance = null
    const mod = await import('./indexingWorkerClient')
    client = new mod.IndexingWorkerClient()
  })

  afterEach(() => {
    client.dispose()
    vi.resetModules()
  })

  it('resolves promise when worker posts a result message', async () => {
    const promise = client.runIndex(makeOptions())

    const worker = MockWorker.lastInstance!
    expect(worker.postMessage).toHaveBeenCalledOnce()

    const { requestId } = worker.postMessage.mock.calls[0][0] as { requestId: string }
    worker.emit('message', { type: 'result', requestId, result: makeResult() })

    const result = await promise
    expect(result.success).toBe(true)
    expect(result.filesIndexed).toBe(5)
  })

  it('rejects promise when worker posts an error message', async () => {
    const promise = client.runIndex(makeOptions())

    const worker = MockWorker.lastInstance!
    const { requestId } = worker.postMessage.mock.calls[0][0] as { requestId: string }
    worker.emit('message', { type: 'error', requestId, message: 'parse failed' })

    await expect(promise).rejects.toThrow('parse failed')
  })

  it('invokes onProgress callback for progress messages', async () => {
    const onProgress = vi.fn()
    const promise = client.runIndex(makeOptions({ onProgress }))

    const worker = MockWorker.lastInstance!
    const { requestId } = worker.postMessage.mock.calls[0][0] as { requestId: string }

    const progress = {
      phase: 'parsing',
      filesTotal: 10,
      filesProcessed: 3,
      nodesCreated: 0,
      edgesCreated: 0,
      errors: [],
      startedAt: Date.now(),
      elapsedMs: 50,
    }
    worker.emit('message', { type: 'progress', requestId, progress })
    expect(onProgress).toHaveBeenCalledWith(progress)

    // resolve so the test doesn't hang
    worker.emit('message', { type: 'result', requestId, result: makeResult() })
    await promise
  })

  it('queues a second request until first resolves', async () => {
    const p1 = client.runIndex(makeOptions({ projectName: 'p1' }))
    const p2 = client.runIndex(makeOptions({ projectName: 'p2' }))

    const worker = MockWorker.lastInstance!
    // Only one postMessage call so far — second is queued
    expect(worker.postMessage).toHaveBeenCalledTimes(1)

    const req1 = worker.postMessage.mock.calls[0][0] as { requestId: string }
    worker.emit('message', { type: 'result', requestId: req1.requestId, result: makeResult() })
    await p1

    // Now the second request should have been dispatched
    expect(worker.postMessage).toHaveBeenCalledTimes(2)
    const req2 = worker.postMessage.mock.calls[1][0] as { requestId: string }
    worker.emit('message', { type: 'result', requestId: req2.requestId, result: makeResult() })
    await p2
  })

  it('strips onProgress from the serialised options sent to worker', async () => {
    const onProgress = vi.fn()
    const promise = client.runIndex(makeOptions({ onProgress }))

    const worker = MockWorker.lastInstance!
    const msg = worker.postMessage.mock.calls[0][0] as { options: Record<string, unknown> }
    expect('onProgress' in msg.options).toBe(false)

    const { requestId } = worker.postMessage.mock.calls[0][0] as { requestId: string }
    worker.emit('message', { type: 'result', requestId, result: makeResult() })
    await promise
  })

  it('rejects all pending requests on worker error event', async () => {
    const p1 = client.runIndex(makeOptions())
    MockWorker.lastInstance!.emit('error', new Error('worker crashed'))
    await expect(p1).rejects.toThrow('worker crashed')
  })

  it('dispose rejects in-flight requests', async () => {
    const p1 = client.runIndex(makeOptions())
    client.dispose()
    await expect(p1).rejects.toThrow('disposed')
  })
})

// ── Singleton helpers ─────────────────────────────────────────────────────────

describe('module singleton', () => {
  afterEach(async () => {
    const mod = await import('./indexingWorkerClient')
    mod.disposeIndexingWorkerClient()
    vi.resetModules()
  })

  it('getIndexingWorkerClient returns the same instance on repeated calls', async () => {
    const mod = await import('./indexingWorkerClient')
    const a = mod.getIndexingWorkerClient()
    const b = mod.getIndexingWorkerClient()
    expect(a).toBe(b)
  })

  it('disposeIndexingWorkerClient clears the singleton', async () => {
    const mod = await import('./indexingWorkerClient')
    const a = mod.getIndexingWorkerClient()
    mod.disposeIndexingWorkerClient()
    const b = mod.getIndexingWorkerClient()
    expect(a).not.toBe(b)
  })
})
