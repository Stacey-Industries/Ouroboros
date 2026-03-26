import log from '../logger'
import { deleteModuleEntry, enforceSizeCap,readAllModuleEntries } from './contextLayerStore'
import type { ModuleContextEntry } from './contextLayerTypes'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GCOptions {
  workspaceRoot: string
  currentModuleIds: Set<string>
  maxModules: number          // Default 50
  maxSizeBytes: number        // Default 200KB
  maxStalenessMs: number      // Default 7 days = 7 * 24 * 60 * 60 * 1000
}

export interface GCResult {
  deletedOrphans: string[]
  deletedStale: string[]
  deletedOverflow: string[]
  reclaimedBytes: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AI_STALENESS_MULTIPLIER = 2

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function estimateEntryBytes(entry: ModuleContextEntry): number {
  return JSON.stringify(entry).length
}

async function safeDelete(
  workspaceRoot: string,
  moduleId: string,
): Promise<boolean> {
  try {
    await deleteModuleEntry(workspaceRoot, moduleId)
    return true
  } catch (error) {
    log.warn('[context-layer] GC: failed to delete module', moduleId, error)
    return false
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

async function sweepOrphans(
  workspaceRoot: string,
  entries: ModuleContextEntry[],
  currentModuleIds: Set<string>,
  result: GCResult,
): Promise<ModuleContextEntry[]> {
  const orphanIds: string[] = []
  for (const entry of entries) {
    const id = entry.structural.module.id
    if (!currentModuleIds.has(id)) {
      orphanIds.push(id)
    }
  }
  for (const id of orphanIds) {
    const deleted = await safeDelete(workspaceRoot, id)
    if (deleted) result.deletedOrphans.push(id)
  }
  if (result.deletedOrphans.length > 0) {
    log.info('[context-layer] GC: orphan sweep deleted', result.deletedOrphans.length, 'modules')
  }
  const orphanSet = new Set(result.deletedOrphans)
  return entries.filter((e) => !orphanSet.has(e.structural.module.id))
}

async function sweepStale(
  workspaceRoot: string,
  entries: ModuleContextEntry[],
  maxStalenessMs: number,
  result: GCResult,
): Promise<ModuleContextEntry[]> {
  const now = Date.now()
  const staleIds: string[] = []
  for (const entry of entries) {
    const id = entry.structural.module.id
    const age = now - entry.structural.lastModified
    const threshold = entry.ai ? maxStalenessMs * AI_STALENESS_MULTIPLIER : maxStalenessMs
    if (age > threshold) staleIds.push(id)
  }
  for (const id of staleIds) {
    const deleted = await safeDelete(workspaceRoot, id)
    if (deleted) result.deletedStale.push(id)
  }
  if (result.deletedStale.length > 0) {
    log.info('[context-layer] GC: staleness sweep deleted', result.deletedStale.length, 'modules')
  }
  const staleSet = new Set(result.deletedStale)
  return entries.filter((e) => !staleSet.has(e.structural.module.id))
}

async function enforceModuleCount(
  workspaceRoot: string,
  maxModules: number,
  result: GCResult,
): Promise<void> {
  const entries = await readAllModuleEntries(workspaceRoot)
  if (entries.length <= maxModules) return

  const sorted = [...entries].sort((a, b) => a.structural.fileCount - b.structural.fileCount)
  const toDelete = sorted.slice(0, entries.length - maxModules)
  for (const entry of toDelete) {
    const id = entry.structural.module.id
    const deleted = await safeDelete(workspaceRoot, id)
    if (deleted) result.deletedOverflow.push(id)
  }
  if (result.deletedOverflow.length > 0) {
    log.info('[context-layer] GC: module count enforced, deleted', result.deletedOverflow.length, 'modules')
  }
}

export async function runContextLayerGC(options: GCOptions): Promise<GCResult> {
  const { workspaceRoot, currentModuleIds, maxModules, maxSizeBytes, maxStalenessMs } = options

  const result: GCResult = {
    deletedOrphans: [],
    deletedStale: [],
    deletedOverflow: [],
    reclaimedBytes: 0,
  }

  let entries = await readAllModuleEntries(workspaceRoot)
  const bytesBefore = entries.reduce((sum, e) => sum + estimateEntryBytes(e), 0)

  entries = await sweepOrphans(workspaceRoot, entries, currentModuleIds, result)
  entries = await sweepStale(workspaceRoot, entries, maxStalenessMs, result)
  // entries variable updated but not needed after this point
  void entries

  await enforceSizeCap(workspaceRoot, maxSizeBytes)
  await enforceModuleCount(workspaceRoot, maxModules, result)

  const entriesAfter = await readAllModuleEntries(workspaceRoot)
  const bytesAfter = entriesAfter.reduce((sum, e) => sum + estimateEntryBytes(e), 0)
  result.reclaimedBytes = Math.max(0, bytesBefore - bytesAfter)

  if (result.reclaimedBytes > 0) {
    log.info('[context-layer] GC: size cap enforced, reclaimed', result.reclaimedBytes, 'bytes')
  }

  return result
}
