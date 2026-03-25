import fs from 'fs/promises'
import type {
  ContextLayerManifest,
  ModuleContextEntry,
  ModuleStructuralSummary,
} from './contextLayerTypes'
import {
  summarizeModule,
  shouldSummarize,
  selectSourceSnippets,
} from './moduleSummarizer'
import type { SummarizationContext, SummarizationResult } from './moduleSummarizer'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SummarizationQueueOptions {
  workspaceRoot: string
  /** Functions to read/write module entries — injected from the store */
  readModuleEntry: (workspaceRoot: string, moduleId: string) => Promise<ModuleContextEntry | null>
  writeModuleEntry: (workspaceRoot: string, moduleId: string, entry: ModuleContextEntry) => Promise<void>
  readManifest: (workspaceRoot: string) => Promise<ContextLayerManifest | null>
  writeManifest: (workspaceRoot: string, manifest: ContextLayerManifest) => Promise<void>
  /** Function to get files for a module — injected so queue doesn't depend on repoIndexer directly */
  getModuleFiles: (moduleId: string) => Array<{
    relativePath: string
    absolutePath: string
    size: number
    language: string
    imports: string[]
  }>
  /** Function to get the structural summary for a module */
  getModuleStructural: (moduleId: string) => ModuleStructuralSummary | null
  /** Project-level context for the summarizer */
  projectContext: { languages: string[]; frameworks: string[] }
  /** Cross-module dependency names per module */
  getDependencyContext: (moduleId: string) => string[]
  cooldownMs?: number         // Default: 5000
  maxQueueSize?: number       // Default: 20
  maxRetries?: number         // Default: 2
  enabled?: boolean           // Default: true
}

export interface SummarizationQueueStatus {
  queueLength: number
  processing: string | null
  lastCompleted: string | null
  lastError: string | null
  totalProcessed: number
  totalFailed: number
  isRateLimited: boolean
  nextJobAt: number | null
}

export interface SummarizationQueue {
  enqueue: (moduleIds: string[]) => void
  status: () => SummarizationQueueStatus
  pause: () => void
  resume: () => void
  dispose: () => void
}

// ---------------------------------------------------------------------------
// Rate limit backoff constants
// ---------------------------------------------------------------------------

const INITIAL_BACKOFF_MS = 10_000    // 10 seconds
const MAX_BACKOFF_MS = 300_000       // 5 minutes
const BACKOFF_MULTIPLIER = 2

// ---------------------------------------------------------------------------
// Snippet reader
// ---------------------------------------------------------------------------

async function readSnippetContents(
  snippets: Array<{ relativePath: string; absolutePath: string }>,
  maxChars: number,
): Promise<Array<{ relativePath: string; content: string }>> {
  const results: Array<{ relativePath: string; content: string }> = []
  for (const snippet of snippets) {
    try {
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
// Factory
// ---------------------------------------------------------------------------

export function createSummarizationQueue(options: SummarizationQueueOptions): SummarizationQueue {
  const cooldownMs = options.cooldownMs ?? 5000
  const maxQueueSize = options.maxQueueSize ?? 20
  const maxRetries = options.maxRetries ?? 2
  const enabled = options.enabled ?? true

  // Internal state
  const queue = new Map<string, number>()
  let processing: string | null = null
  let paused = false
  let disposed = false
  let lastCompleted: string | null = null
  let lastError: string | null = null
  let totalProcessed = 0
  let totalFailed = 0
  let isRateLimited = false
  let backoffMs = 0
  let nextJobTimer: ReturnType<typeof setTimeout> | null = null
  let activeAbortController: AbortController | null = null

  // -------------------------------------------------------------------------
  // Rate limit backoff
  // -------------------------------------------------------------------------

  function applyRateLimitBackoff(): void {
    isRateLimited = true
    backoffMs = backoffMs === 0
      ? INITIAL_BACKOFF_MS
      : Math.min(backoffMs * BACKOFF_MULTIPLIER, MAX_BACKOFF_MS)
  }

  function resetBackoff(): void {
    isRateLimited = false
    backoffMs = 0
  }

  // -------------------------------------------------------------------------
  // Scheduling
  // -------------------------------------------------------------------------

  function scheduleNext(): void {
    if (disposed || paused || queue.size === 0 || processing) return

    const delay = isRateLimited ? backoffMs : cooldownMs
    nextJobTimer = setTimeout(processNext, delay)
  }

  // -------------------------------------------------------------------------
  // Core processing loop
  // -------------------------------------------------------------------------

  async function processNext(): Promise<void> {
    nextJobTimer = null

    if (disposed || paused || queue.size === 0) return

    // Dequeue the oldest entry (FIFO by enqueue timestamp)
    const sorted = [...queue.entries()].sort((a, b) => a[1] - b[1])
    const [moduleId] = sorted[0]
    queue.delete(moduleId)
    processing = moduleId

    try {
      await processModule(moduleId)
    } catch (err) {
      console.log('[context-layer] Unexpected error processing module:', moduleId, err)
      lastError = err instanceof Error ? err.message : 'unknown'
      totalFailed++
    }

    processing = null
    scheduleNext()
  }

  async function processModule(moduleId: string): Promise<void> {
    // Get structural summary
    const structural = options.getModuleStructural(moduleId)
    if (!structural) {
      return
    }

    // Check if module meets summarization threshold
    if (!shouldSummarize(structural)) {
      return
    }

    // Stale summary detection — skip if content hash matches existing summary
    const existing = await options.readModuleEntry(options.workspaceRoot, moduleId)
    if (existing?.ai?.generatedFrom === structural.contentHash) {
      return
    }

    // Read source files
    const moduleFiles = options.getModuleFiles(moduleId)
    const snippetPaths = selectSourceSnippets({
      files: moduleFiles,
      workspaceRoot: options.workspaceRoot,
      moduleRootPath: structural.module.rootPath,
    })

    // Read file contents (with truncation to 2000 chars each)
    const sourceSnippets = await readSnippetContents(snippetPaths, 2000)

    // Build summarization context
    const context: SummarizationContext = {
      module: structural,
      sourceSnippets,
      dependencyContext: options.getDependencyContext(moduleId),
      projectContext: options.projectContext,
    }

    // Call summarizer with retry logic
    let retriesLeft = maxRetries
    let result: SummarizationResult | undefined

    while (true) {
      if (disposed) return

      activeAbortController = new AbortController()
      result = await summarizeModule(context)
      activeAbortController = null

      if (disposed) return

      if (result.success) break

      if (result.error === 'rate_limited') {
        applyRateLimitBackoff()
        // Re-enqueue this module and wait
        queue.set(moduleId, Date.now())
        console.log('[context-layer] Rate limited — re-enqueuing', moduleId, 'backoff:', backoffMs, 'ms')
        return
      }

      if (result.error === 'no_auth') {
        // Pause the queue — no point continuing without auth
        paused = true
        lastError = 'no_auth'
        console.log('[context-layer] No auth — pausing summarization queue')
        return
      }

      // parse_failure already retried inside summarizeModule — don't retry again here
      if (result.error === 'parse_failure') break

      if (retriesLeft <= 0) break
      retriesLeft--
    }

    if (result?.success && result.summary) {
      // Enrich structural summary with extracted symbols (from symbol extractor)
      const enrichedStructural = result.extractedSymbols && result.extractedSymbols.length > 0
        ? {
            ...structural,
            exports: result.extractedSymbols.map(s => s.name).slice(0, 20),
            extractedSymbols: result.extractedSymbols,
          }
        : structural

      // Write the updated module entry
      const entry: ModuleContextEntry = {
        structural: enrichedStructural,
        ai: result.summary,
      }
      await options.writeModuleEntry(options.workspaceRoot, moduleId, entry)

      // Update manifest
      const manifest = await options.readManifest(options.workspaceRoot)
      if (manifest) {
        manifest.lastIncrementalUpdate = Date.now()
        manifest.moduleHashes[moduleId] = structural.contentHash
        await options.writeManifest(options.workspaceRoot, manifest)
      }

      lastCompleted = moduleId
      totalProcessed++
      resetBackoff()
      console.log('[context-layer] Summarized module:', moduleId)
    } else {
      lastError = result?.error ?? 'unknown'
      totalFailed++
      console.log('[context-layer] Failed to summarize module:', moduleId, 'error:', lastError)
    }
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  function enqueue(moduleIds: string[]): void {
    if (disposed || !enabled) return

    const now = Date.now()
    for (const moduleId of moduleIds) {
      // Skip sentinel values
      if (moduleId === '__all__' || moduleId === '__new_files__') continue
      queue.set(moduleId, now) // Overwrites existing entry — deduplication
    }

    // Enforce max queue size — drop oldest if over
    while (queue.size > maxQueueSize) {
      const oldest = [...queue.entries()].sort((a, b) => a[1] - b[1])[0]
      if (oldest) queue.delete(oldest[0])
    }

    scheduleNext()
  }

  function status(): SummarizationQueueStatus {
    return {
      queueLength: queue.size,
      processing,
      lastCompleted,
      lastError,
      totalProcessed,
      totalFailed,
      isRateLimited,
      nextJobAt: nextJobTimer
        ? Date.now() + (isRateLimited ? backoffMs : cooldownMs)
        : null,
    }
  }

  function pause(): void {
    if (disposed) return
    paused = true
    if (nextJobTimer) {
      clearTimeout(nextJobTimer)
      nextJobTimer = null
    }
  }

  function resume(): void {
    if (disposed) return
    paused = false
    scheduleNext()
  }

  function dispose(): void {
    disposed = true
    paused = true
    if (nextJobTimer) {
      clearTimeout(nextJobTimer)
      nextJobTimer = null
    }
    activeAbortController?.abort()
    activeAbortController = null
    queue.clear()
    processing = null
  }

  return { enqueue, status, pause, resume, dispose }
}
