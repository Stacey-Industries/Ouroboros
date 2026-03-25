import path from 'path'
import type { ContextInvalidationEvent } from './contextLayerTypes'

// ---------------------------------------------------------------------------
// Ignore patterns — skip these path segments entirely
// ---------------------------------------------------------------------------

const IGNORED_SEGMENTS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
  '.vite',
  '.parcel-cache',
  'target',
  '.context',
])

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_DEBOUNCE_MS = 5_000
const SESSION_STALE_THRESHOLD_MS = 60_000
const ALL_SENTINEL = '__all__'
const NEW_FILES_MARKER = '__new_files__'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContextLayerWatcherOptions {
  workspaceRoot: string
  debounceMs?: number
  onInvalidation: (event: ContextInvalidationEvent) => void
}

export interface ContextLayerWatcher {
  /** Called when a file changes (from broadcastFileChange in files.ts) */
  onFileChange: (type: string, filePath: string) => void
  /** Called when a git commit / agent session ends */
  onGitCommit: () => void
  /** Called when a new Claude Code session starts */
  onSessionStart: () => void
  /** Force a full rebuild */
  forceRebuild: () => void
  /** Update the module map (called after module detection completes) */
  setModuleMap: (moduleMap: Map<string, string>) => void
  /** Clean up timers */
  dispose: () => void
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function normalizePath(filePath: string): string {
  const normalized = path.normalize(filePath)
  if (process.platform === 'win32') {
    return normalized.toLowerCase()
  }
  return normalized
}

function isInsideWorkspace(filePath: string, workspaceRoot: string): boolean {
  return filePath.startsWith(workspaceRoot + path.sep) || filePath === workspaceRoot
}

function hasIgnoredSegment(filePath: string): boolean {
  return filePath.split(path.sep).some((seg) => IGNORED_SEGMENTS.has(seg))
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createContextLayerWatcher(options: ContextLayerWatcherOptions): ContextLayerWatcher {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS
  const normalizedRoot = normalizePath(options.workspaceRoot)

  let disposed = false
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let moduleMap: Map<string, string> | null = null
  let lastInvalidationTimestamp = 0

  // Pending invalidation state
  const pendingModules = new Set<string>()
  const pendingNewFiles = new Set<string>()

  // --------------------------------------------------
  // Timer management
  // --------------------------------------------------

  function clearDebounceTimer(): void {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
  }

  function resetDebounceTimer(): void {
    clearDebounceTimer()
    debounceTimer = setTimeout(fireDebounced, debounceMs)
  }

  // --------------------------------------------------
  // Invalidation dispatch
  // --------------------------------------------------

  function emitInvalidation(type: ContextInvalidationEvent['type'], modules: string[]): void {
    if (disposed || modules.length === 0) {
      return
    }
    const event: ContextInvalidationEvent = {
      type,
      affectedModules: modules,
      timestamp: Date.now(),
    }
    lastInvalidationTimestamp = event.timestamp
    console.log('[context-layer] Invalidation:', type, 'modules:', modules.join(', '))
    options.onInvalidation(event)
  }

  function fireDebounced(): void {
    debounceTimer = null
    if (disposed) {
      return
    }

    const modules = collectPendingModules()
    if (modules.length === 0) {
      return
    }

    emitInvalidation('file_changed', modules)
  }

  function collectPendingModules(): string[] {
    const modules = [...pendingModules]
    pendingModules.clear()

    if (pendingNewFiles.size > 0) {
      modules.push(NEW_FILES_MARKER)
      pendingNewFiles.clear()
    }

    return modules
  }

  function getAllModuleIds(): string[] {
    if (!moduleMap || moduleMap.size === 0) {
      return [ALL_SENTINEL]
    }
    const ids = new Set(moduleMap.values())
    return [...ids]
  }

  function fireImmediateFullInvalidation(type: ContextInvalidationEvent['type']): void {
    // Absorb any pending debounced changes — they are included in the full rebuild
    clearDebounceTimer()
    pendingModules.clear()
    pendingNewFiles.clear()

    emitInvalidation(type, getAllModuleIds())
  }

  // --------------------------------------------------
  // Public methods
  // --------------------------------------------------

  function onFileChange(type: string, filePath: string): void {
    if (disposed) {
      return
    }

    const normalized = normalizePath(filePath)

    // Ignore files outside workspace root
    if (!isInsideWorkspace(normalized, normalizedRoot)) {
      return
    }

    // Ignore files in excluded directories
    if (hasIgnoredSegment(normalized)) {
      return
    }

    // Module map not yet populated — accumulate as __all__
    if (!moduleMap) {
      pendingModules.add(ALL_SENTINEL)
      resetDebounceTimer()
      return
    }

    // Look up the file in the module map
    const moduleId = moduleMap.get(normalized)
    if (moduleId) {
      pendingModules.add(moduleId)
    } else {
      // Unknown file — might be newly created, trigger re-detection
      pendingNewFiles.add(normalized)
    }

    resetDebounceTimer()
  }

  function onGitCommit(): void {
    if (disposed) {
      return
    }
    fireImmediateFullInvalidation('git_commit')
  }

  function onSessionStart(): void {
    if (disposed) {
      return
    }

    const now = Date.now()
    const elapsed = now - lastInvalidationTimestamp
    if (lastInvalidationTimestamp === 0 || elapsed > SESSION_STALE_THRESHOLD_MS) {
      fireImmediateFullInvalidation('session_start')
    }
  }

  function forceRebuild(): void {
    if (disposed) {
      return
    }
    fireImmediateFullInvalidation('manual')
  }

  function setModuleMap(newModuleMap: Map<string, string>): void {
    if (disposed) {
      return
    }

    moduleMap = newModuleMap

    // If there are pending __all__ invalidations from before the module map
    // was available, trigger a full rebuild now
    if (pendingModules.has(ALL_SENTINEL)) {
      pendingModules.clear()
      pendingNewFiles.clear()
      clearDebounceTimer()
      fireImmediateFullInvalidation('manual')
    }
  }

  function dispose(): void {
    if (disposed) {
      return
    }
    disposed = true
    clearDebounceTimer()
    pendingModules.clear()
    pendingNewFiles.clear()
    moduleMap = null
    console.log('[context-layer] Watcher disposed')
  }

  return {
    onFileChange,
    onGitCommit,
    onSessionStart,
    forceRebuild,
    setModuleMap,
    dispose,
  }
}
