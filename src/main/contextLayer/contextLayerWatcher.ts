import path from 'path'

import log from '../logger'
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
  /** Called when a git commit / agent session ends. If changedPaths are provided,
   *  only modules containing those files are invalidated. Otherwise falls back to full invalidation. */
  onGitCommit: (changedPaths?: string[]) => void
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
// Internal state shape
// ---------------------------------------------------------------------------

interface WatcherState {
  disposed: boolean
  debounceTimer: ReturnType<typeof setTimeout> | null
  moduleMap: Map<string, string> | null
  lastInvalidationTimestamp: number
  pendingModules: Set<string>
  pendingNewFiles: Set<string>
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
// Invalidation helpers
// ---------------------------------------------------------------------------

function emitInvalidation(
  state: WatcherState,
  type: ContextInvalidationEvent['type'],
  modules: string[],
  onInvalidation: (e: ContextInvalidationEvent) => void,
): void {
  if (state.disposed || modules.length === 0) return
  const event: ContextInvalidationEvent = { type, affectedModules: modules, timestamp: Date.now() }
  state.lastInvalidationTimestamp = event.timestamp
  log.info('[context-layer] Invalidation:', type, 'modules:', modules.join(', '))
  onInvalidation(event)
}

function collectPendingModules(state: WatcherState): string[] {
  const modules = [...state.pendingModules]
  state.pendingModules.clear()
  if (state.pendingNewFiles.size > 0) {
    modules.push(NEW_FILES_MARKER)
    state.pendingNewFiles.clear()
  }
  return modules
}

function getAllModuleIds(state: WatcherState): string[] {
  if (!state.moduleMap || state.moduleMap.size === 0) return [ALL_SENTINEL]
  return [...new Set(state.moduleMap.values())]
}

function clearDebounceTimer(state: WatcherState): void {
  if (state.debounceTimer !== null) {
    clearTimeout(state.debounceTimer)
    state.debounceTimer = null
  }
}

function fireImmediateFullInvalidation(
  state: WatcherState,
  type: ContextInvalidationEvent['type'],
  onInvalidation: (e: ContextInvalidationEvent) => void,
): void {
  clearDebounceTimer(state)
  state.pendingModules.clear()
  state.pendingNewFiles.clear()
  emitInvalidation(state, type, getAllModuleIds(state), onInvalidation)
}

// ---------------------------------------------------------------------------
// Public method implementations (module-level, accept state explicitly)
// ---------------------------------------------------------------------------

interface FileChangeCtx { state: WatcherState; normalizedRoot: string; debounceMs: number; onFire: () => void }

function routeFileToModule(state: WatcherState, normalized: string): void {
  if (!state.moduleMap) {
    state.pendingModules.add(ALL_SENTINEL)
    return
  }
  const moduleId = state.moduleMap.get(normalized)
  if (moduleId) {
    state.pendingModules.add(moduleId)
  } else {
    state.pendingNewFiles.add(normalized)
  }
}

function handleFileChange(ctx: FileChangeCtx, filePath: string): void {
  const { state, normalizedRoot, debounceMs, onFire } = ctx
  if (state.disposed) return
  const normalized = normalizePath(filePath)
  if (!isInsideWorkspace(normalized, normalizedRoot) || hasIgnoredSegment(normalized)) return

  routeFileToModule(state, normalized)
  clearDebounceTimer(state)
  state.debounceTimer = setTimeout(onFire, debounceMs)
}

function handleTargetedGitCommit(
  state: WatcherState,
  changedPaths: string[],
  normalizedRoot: string,
  onInvalidation: (e: ContextInvalidationEvent) => void,
): void {
  if (state.disposed) return
  if (!state.moduleMap || state.moduleMap.size === 0) {
    fireImmediateFullInvalidation(state, 'git_commit', onInvalidation)
    return
  }

  const affectedModules = new Set<string>()
  for (const filePath of changedPaths) {
    const normalized = normalizePath(filePath)
    if (!isInsideWorkspace(normalized, normalizedRoot) || hasIgnoredSegment(normalized)) continue
    const moduleId = state.moduleMap.get(normalized)
    if (moduleId) affectedModules.add(moduleId)
  }

  if (affectedModules.size === 0) {
    log.info('[context-layer] Git commit — no modules affected, skipping invalidation')
    return
  }

  clearDebounceTimer(state)
  state.pendingModules.clear()
  state.pendingNewFiles.clear()
  emitInvalidation(state, 'git_commit', [...affectedModules], onInvalidation)
}

function handleSetModuleMap(
  state: WatcherState,
  newModuleMap: Map<string, string>,
  onInvalidation: (e: ContextInvalidationEvent) => void,
): void {
  if (state.disposed) return
  state.moduleMap = newModuleMap
  if (state.pendingModules.has(ALL_SENTINEL)) {
    state.pendingModules.clear()
    state.pendingNewFiles.clear()
    clearDebounceTimer(state)
    fireImmediateFullInvalidation(state, 'manual', onInvalidation)
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function buildInitialState(): WatcherState {
  return {
    disposed: false,
    debounceTimer: null,
    moduleMap: null,
    lastInvalidationTimestamp: 0,
    pendingModules: new Set<string>(),
    pendingNewFiles: new Set<string>(),
  }
}

function makeDisposeMethod(state: WatcherState): () => void {
  return () => {
    if (state.disposed) return
    state.disposed = true
    clearDebounceTimer(state)
    state.pendingModules.clear()
    state.pendingNewFiles.clear()
    state.moduleMap = null
    log.info('[context-layer] Watcher disposed')
  }
}

export function createContextLayerWatcher(options: ContextLayerWatcherOptions): ContextLayerWatcher {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS
  const normalizedRoot = normalizePath(options.workspaceRoot)
  const state = buildInitialState()
  const emit = options.onInvalidation

  function fireDebounced(): void {
    state.debounceTimer = null
    if (!state.disposed) {
      const modules = collectPendingModules(state)
      if (modules.length > 0) emitInvalidation(state, 'file_changed', modules, emit)
    }
  }

  const fileChangeCtx: FileChangeCtx = { state, normalizedRoot, debounceMs, onFire: fireDebounced }

  return {
    onFileChange: (_type, filePath) => handleFileChange(fileChangeCtx, filePath),
    onGitCommit: (changedPaths?: string[]) => {
      if (state.disposed) return
      if (changedPaths && changedPaths.length > 0) {
        handleTargetedGitCommit(state, changedPaths, normalizedRoot, emit)
      } else {
        fireImmediateFullInvalidation(state, 'git_commit', emit)
      }
    },
    onSessionStart: () => {
      if (state.disposed) return
      const elapsed = Date.now() - state.lastInvalidationTimestamp
      if (state.lastInvalidationTimestamp === 0 || elapsed > SESSION_STALE_THRESHOLD_MS) {
        fireImmediateFullInvalidation(state, 'session_start', emit)
      }
    },
    forceRebuild: () => { if (!state.disposed) fireImmediateFullInvalidation(state, 'manual', emit) },
    setModuleMap: (newMap) => handleSetModuleMap(state, newMap, emit),
    dispose: makeDisposeMethod(state),
  }
}
