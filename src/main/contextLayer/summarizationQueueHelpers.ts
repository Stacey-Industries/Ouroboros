/**
 * summarizationQueueHelpers.ts — Internal helpers for summarizationQueue.ts.
 * Extracted to stay under the 300-line limit.
 */

import fs from 'fs/promises'

import log from '../logger'
import type { SummarizationQueueOptions } from './summarizationQueue'
import type { SummarizationQueueStatus } from './summarizationQueue'

// ---------------------------------------------------------------------------
// Rate limit backoff constants
// ---------------------------------------------------------------------------

export const INITIAL_BACKOFF_MS = 10_000    // 10 seconds
export const MAX_BACKOFF_MS = 300_000       // 5 minutes
export const BACKOFF_MULTIPLIER = 2

// ---------------------------------------------------------------------------
// Snippet reader
// ---------------------------------------------------------------------------

export async function readSnippetContents(
  snippets: Array<{ relativePath: string; absolutePath: string }>,
  maxChars: number,
): Promise<Array<{ relativePath: string; content: string }>> {
  const results: Array<{ relativePath: string; content: string }> = []
  for (const snippet of snippets) {
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- path comes from selectSourceSnippets which uses trusted workspace root + relative file paths
      const content = await fs.readFile(snippet.absolutePath, 'utf-8')
      results.push({
        relativePath: snippet.relativePath,
        content: content.length > maxChars ? content.slice(0, maxChars) : content,
      })
    } catch {
      // File unreadable — skip it
    }
  }
  return results
}

// ---------------------------------------------------------------------------
// Queue state type (shared between factory and helpers)
// ---------------------------------------------------------------------------

export interface QueueState {
  queue: Map<string, number>
  processing: string | null
  paused: boolean
  disposed: boolean
  lastCompleted: string | null
  lastError: string | null
  totalProcessed: number
  totalFailed: number
  /** Stable denominator for progress — set once on first enqueue, grows only when new items are added. */
  initialTotal: number
  isRateLimited: boolean
  backoffMs: number
  nextJobTimer: ReturnType<typeof setTimeout> | null
  activeAbortController: AbortController | null
}

// ---------------------------------------------------------------------------
// Shared context + config types
// ---------------------------------------------------------------------------

export interface ProcessCtx {
  options: SummarizationQueueOptions
  state: QueueState
}

export interface SchedulerConfig {
  cooldownMs: number
  maxRetries: number
  maxQueueSize: number
  enabled: boolean
}

// ---------------------------------------------------------------------------
// Backoff helpers
// ---------------------------------------------------------------------------

export function applyRateLimitBackoff(state: QueueState): void {
  state.isRateLimited = true
  state.backoffMs = state.backoffMs === 0
    ? INITIAL_BACKOFF_MS
    : Math.min(state.backoffMs * BACKOFF_MULTIPLIER, MAX_BACKOFF_MS)
}

export function resetBackoff(state: QueueState): void {
  state.isRateLimited = false
  state.backoffMs = 0
}

// ---------------------------------------------------------------------------
// Progress broadcast
// ---------------------------------------------------------------------------

export function broadcastProgress(ctx: ProcessCtx): void {
  const { state, options } = ctx
  if (!options.onProgress) return
  const isIdle = !state.processing && state.queue.size === 0
  options.onProgress({
    type: isIdle ? 'idle' : 'summarizing',
    total: state.initialTotal,
    processed: state.totalProcessed,
    failed: state.totalFailed,
    currentModule: state.processing,
  })
}

// ---------------------------------------------------------------------------
// Scheduler action factories
// ---------------------------------------------------------------------------

export function makeEnqueue(ctx: ProcessCtx, cfg: SchedulerConfig, scheduleNext: () => void) {
  return function enqueue(moduleIds: string[]): void {
    const { state } = ctx
    if (state.disposed || !cfg.enabled) return
    const now = Date.now()
    const sizeBefore = state.queue.size
    for (const moduleId of moduleIds) {
      if (moduleId === '__all__' || moduleId === '__new_files__') continue
      state.queue.set(moduleId, now)
    }
    const newlyAdded = state.queue.size - sizeBefore
    state.initialTotal += newlyAdded
    while (state.queue.size > cfg.maxQueueSize) {
      const oldest = [...state.queue.entries()].sort((a, b) => a[1] - b[1])[0]
      if (oldest) state.queue.delete(oldest[0])
    }
    broadcastProgress(ctx)
    scheduleNext()
  }
}

export function makeStatus(ctx: ProcessCtx, cfg: SchedulerConfig) {
  return function status(): SummarizationQueueStatus {
    const { state } = ctx
    const nextAt = state.nextJobTimer
      ? Date.now() + (state.isRateLimited ? state.backoffMs : cfg.cooldownMs)
      : null
    return {
      queueLength: state.queue.size, processing: state.processing,
      lastCompleted: state.lastCompleted, lastError: state.lastError,
      totalProcessed: state.totalProcessed, totalFailed: state.totalFailed,
      isRateLimited: state.isRateLimited, nextJobAt: nextAt,
    }
  }
}

// ---------------------------------------------------------------------------
// Run-loop factory
// ---------------------------------------------------------------------------

type RunNextFn = () => Promise<void>

export function makeRunLoop(
  ctx: ProcessCtx,
  cfg: SchedulerConfig,
  scheduleNext: () => void,
  processModuleFn: (moduleId: string, ctx: ProcessCtx, maxRetries: number) => Promise<void>,
): RunNextFn {
  const { state } = ctx
  return async function runNext(): Promise<void> {
    state.nextJobTimer = null
    if (state.disposed || state.paused || state.queue.size === 0) return
    const sorted = [...state.queue.entries()].sort((a, b) => a[1] - b[1])
    const [moduleId] = sorted[0]
    state.queue.delete(moduleId)
    state.processing = moduleId
    broadcastProgress(ctx)
    try {
      await processModuleFn(moduleId, ctx, cfg.maxRetries)
    } catch (err) {
      log.info('[context-layer] Unexpected error processing module:', moduleId, err)
      state.lastError = err instanceof Error ? err.message : 'unknown'
      state.totalFailed++
    }
    state.processing = null
    broadcastProgress(ctx)
    scheduleNext()
  }
}
