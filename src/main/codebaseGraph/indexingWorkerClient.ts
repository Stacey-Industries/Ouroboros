/**
 * indexingWorkerClient.ts — Main-process-side client for the indexing worker.
 *
 * Keeps a singleton Worker (lazy-spawned on first runIndex call).  Queues
 * concurrent requests so the worker processes one at a time — this matches
 * System 1's behaviour and keeps SQLite writes serialised.
 *
 * Exposes runIndex(options) => Promise<IndexingResult> which mirrors the
 * IndexingPipeline.index() signature so callers need no changes.
 */

import path from 'path'
import { Worker } from 'worker_threads'

import log from '../logger'
import type { IndexingOptions, IndexingResult } from './indexingPipelineTypes'
import type {
  IndexingWorkerResponse,
  IndexRequestOptions,
} from './indexingWorkerTypes'

// ── Path resolution (dev vs packaged asar) ────────────────────────────────────

function resolveWorkerPath(): string {
  const outMainDir = __dirname.endsWith('chunks') ? path.dirname(__dirname) : __dirname
  return path.join(outMainDir, 'indexingWorker.js')
}

// ── Pending-request bookkeeping ───────────────────────────────────────────────

interface PendingRequest {
  requestId: string
  resolve: (result: IndexingResult) => void
  reject: (err: Error) => void
  onProgress: IndexingOptions['onProgress']
}

// ── Client class ──────────────────────────────────────────────────────────────

export class IndexingWorkerClient {
  private worker: Worker | null = null
  private pending = new Map<string, PendingRequest>()
  private queue: Array<() => void> = []
  private busy = false
  private nextId = 0

  // ── Public API ──────────────────────────────────────────────────────────────

  runIndex(options: IndexingOptions): Promise<IndexingResult> {
    return new Promise((resolve, reject) => {
      this.queue.push(() => this.dispatch(options, resolve, reject))
      this.drainQueue()
    })
  }

  dispose(): void {
    this.worker?.terminate().catch(() => { /* already gone */ })
    this.worker = null
    for (const p of this.pending.values()) {
      p.reject(new Error('IndexingWorkerClient disposed'))
    }
    this.pending.clear()
    this.queue = []
    this.busy = false
  }

  // ── Worker lifecycle ────────────────────────────────────────────────────────

  private ensureWorker(): Worker {
    if (this.worker) return this.worker

    const worker = new Worker(resolveWorkerPath())
    worker.on('message', (msg: IndexingWorkerResponse) => this.handleMessage(msg))
    worker.on('error', (err) => {
      log.error('[indexingWorker] worker error:', err)
      this.rejectAll(err)
    })
    worker.on('exit', (code) => {
      if (code !== 0) log.warn(`[indexingWorker] exited with code ${code}`)
      this.worker = null
      this.rejectAll(new Error(`Worker exited with code ${code}`))
    })
    this.worker = worker
    return worker
  }

  // ── Dispatch & queue ────────────────────────────────────────────────────────

  private dispatch(
    options: IndexingOptions,
    resolve: PendingRequest['resolve'],
    reject: PendingRequest['reject'],
  ): void {
    this.busy = true
    const requestId = String(this.nextId++)
    const { onProgress, ...rest } = options
    const serialisable: IndexRequestOptions = rest

    this.pending.set(requestId, { requestId, resolve, reject, onProgress })
    this.ensureWorker().postMessage({ type: 'indexRepository', requestId, options: serialisable })
  }

  private drainQueue(): void {
    if (this.busy || this.queue.length === 0) return
    const next = this.queue.shift()
    next?.()
  }

  // ── Message handling ────────────────────────────────────────────────────────

  private handleMessage(msg: IndexingWorkerResponse): void {
    switch (msg.type) {
      case 'progress':
        this.pending.get(msg.requestId)?.onProgress?.(msg.progress)
        break
      case 'result':
        this.settle(msg.requestId, (p) => p.resolve(msg.result))
        break
      case 'error':
        this.settle(msg.requestId, (p) => p.reject(new Error(msg.message)))
        break
    }
  }

  private settle(requestId: string, fn: (p: PendingRequest) => void): void {
    const p = this.pending.get(requestId)
    if (!p) return
    this.pending.delete(requestId)
    this.busy = false
    fn(p)
    this.drainQueue()
  }

  private rejectAll(err: Error): void {
    for (const p of this.pending.values()) p.reject(err)
    this.pending.clear()
    this.busy = false
    this.queue = []
  }
}

// ── Module-level singleton ────────────────────────────────────────────────────

let _client: IndexingWorkerClient | null = null

export function getIndexingWorkerClient(): IndexingWorkerClient {
  _client ??= new IndexingWorkerClient()
  return _client
}

export function disposeIndexingWorkerClient(): void {
  _client?.dispose()
  _client = null
}
