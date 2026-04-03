import log from '../logger'
import type {
  ContextLayerManifest,
  ModuleContextEntry,
  ModuleStructuralSummary,
} from './contextLayerTypes'
import type { SummarizationContext, SummarizationResult } from './moduleSummarizer'
import {
  selectSourceSnippets,
  shouldSummarize,
  summarizeModule,
} from './moduleSummarizer'
import {
  applyRateLimitBackoff,
  broadcastProgress,
  makeEnqueue,
  makeRunLoop,
  makeStatus,
  type ProcessCtx,
  type QueueState,
  readSnippetContents,
  resetBackoff,
  type SchedulerConfig,
} from './summarizationQueueHelpers'

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
  /** Called when progress changes — used to broadcast to the renderer */
  onProgress?: (progress: SummarizationQueueProgress) => void
}

export interface SummarizationQueueProgress {
  type: 'summarizing' | 'idle'
  total: number
  processed: number
  failed: number
  currentModule: string | null
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
// Persist summarization result
// ---------------------------------------------------------------------------

async function persistSummaryResult(
  moduleId: string,
  structural: ModuleStructuralSummary,
  result: SummarizationResult,
  ctx: ProcessCtx,
): Promise<void> {
  const { options, state } = ctx
  if (!result.success || !result.summary) {
    state.lastError = result.error ?? 'unknown'
    state.totalFailed++
    log.info('[context-layer] Failed to summarize module:', moduleId, 'error:', state.lastError)
    return
  }

  const enrichedStructural = buildEnrichedStructural(structural, result)
  const entry: ModuleContextEntry = { structural: enrichedStructural, ai: result.summary }
  await options.writeModuleEntry(options.workspaceRoot, moduleId, entry)

  const manifest = await options.readManifest(options.workspaceRoot)
  if (manifest) {
    manifest.lastIncrementalUpdate = Date.now()
    // eslint-disable-next-line security/detect-object-injection -- moduleId is a validated string from the module registry; not user input
    manifest.moduleHashes[moduleId] = structural.contentHash
    await options.writeManifest(options.workspaceRoot, manifest)
  }

  state.lastCompleted = moduleId
  state.totalProcessed++
  resetBackoff(state)
  log.info('[context-layer] Summarized module:', moduleId)
}

function buildEnrichedStructural(
  structural: ModuleStructuralSummary,
  result: SummarizationResult,
): ModuleStructuralSummary {
  if (!result.extractedSymbols || result.extractedSymbols.length === 0) {
    return structural
  }
  return {
    ...structural,
    exports: result.extractedSymbols.map((s) => s.name).slice(0, 20),
    extractedSymbols: result.extractedSymbols.map((s) => ({
      name: s.name,
      kind: (s.kind === 'const' || s.kind === 'enum') ? 'variable' as const : s.kind as 'function' | 'class' | 'interface' | 'type' | 'other',
      signature: s.signature ?? undefined,
    })),
  } as ModuleStructuralSummary
}

// ---------------------------------------------------------------------------
// Module processing
// ---------------------------------------------------------------------------

async function runSummarizationLoop(
  moduleId: string,
  context: SummarizationContext,
  maxRetries: number,
  ctx: ProcessCtx,
): Promise<void> {
  const { state } = ctx
  let retriesLeft = maxRetries
  let result: SummarizationResult | undefined

  while (true) {
    if (state.disposed) return

    state.activeAbortController = new AbortController()
    result = await summarizeModule(context)
    state.activeAbortController = null

    if (state.disposed) return
    if (result.success) break

    if (result.error === 'rate_limited') {
      applyRateLimitBackoff(state)
      state.queue.set(moduleId, Date.now())
      log.info('[context-layer] Rate limited — re-enqueuing', moduleId, 'backoff:', state.backoffMs, 'ms')
      return
    }

    if (result.error === 'no_auth') {
      state.paused = true
      state.lastError = 'no_auth'
      log.info('[context-layer] No auth — pausing summarization queue')
      return
    }

    if (result.error === 'parse_failure') break
    if (retriesLeft <= 0) break
    retriesLeft--
  }

  await persistSummaryResult(moduleId, context.module, result ?? { success: false, error: 'unknown' }, ctx)
}

async function processModule(moduleId: string, ctx: ProcessCtx, maxRetries: number): Promise<void> {
  const { options } = ctx
  const structural = options.getModuleStructural(moduleId)
  if (!structural || !shouldSummarize(structural)) return

  const existing = await options.readModuleEntry(options.workspaceRoot, moduleId)
  if (existing?.ai?.generatedFrom === structural.contentHash) return

  const moduleFiles = options.getModuleFiles(moduleId)
  const snippetPaths = selectSourceSnippets({
    files: moduleFiles,
    workspaceRoot: options.workspaceRoot,
    moduleRootPath: structural.module.rootPath,
  })
  const sourceSnippets = await readSnippetContents(snippetPaths, 2000)

  const context: SummarizationContext = {
    module: structural,
    sourceSnippets,
    dependencyContext: options.getDependencyContext(moduleId),
    projectContext: options.projectContext,
  }

  await runSummarizationLoop(moduleId, context, maxRetries, ctx)
}

// ---------------------------------------------------------------------------
// Queue scheduler
// ---------------------------------------------------------------------------

function makeScheduler(ctx: ProcessCtx, cfg: SchedulerConfig): SummarizationQueue {
  const { state } = ctx
  const { cooldownMs } = cfg

  function scheduleNext(): void {
    if (state.disposed || state.paused || state.queue.size === 0 || state.processing) {
      if (!state.processing && state.queue.size === 0) broadcastProgress(ctx)
      return
    }
    state.nextJobTimer = setTimeout(runNext, state.isRateLimited ? state.backoffMs : cooldownMs)
  }

  const runNext = makeRunLoop(ctx, cfg, scheduleNext, processModule)
  const enqueue = makeEnqueue(ctx, cfg, scheduleNext)
  const status = makeStatus(ctx, cfg)

  function pause(): void {
    if (state.disposed) return
    state.paused = true
    if (state.nextJobTimer) { clearTimeout(state.nextJobTimer); state.nextJobTimer = null }
  }

  function dispose(): void {
    state.disposed = true; state.paused = true
    if (state.nextJobTimer) { clearTimeout(state.nextJobTimer); state.nextJobTimer = null }
    state.activeAbortController?.abort(); state.activeAbortController = null
    state.queue.clear(); state.processing = null
  }

  function resume(): void { if (!state.disposed) { state.paused = false; scheduleNext() } }

  return { enqueue, status, pause, resume, dispose }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createSummarizationQueue(options: SummarizationQueueOptions): SummarizationQueue {
  const cooldownMs = options.cooldownMs ?? 5000
  const maxQueueSize = options.maxQueueSize ?? 20
  const maxRetries = options.maxRetries ?? 2
  const enabled = options.enabled ?? true

  const state: QueueState = {
    queue: new Map<string, number>(),
    processing: null,
    paused: false,
    disposed: false,
    lastCompleted: null,
    lastError: null,
    totalProcessed: 0,
    totalFailed: 0,
    initialTotal: 0,
    isRateLimited: false,
    backoffMs: 0,
    nextJobTimer: null,
    activeAbortController: null,
  }

  return makeScheduler({ options, state }, { cooldownMs, maxRetries, maxQueueSize, enabled })
}
