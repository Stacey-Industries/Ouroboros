import type { ModuleContextEntry } from './contextLayerTypes'
import { readAllModuleEntries, deleteModuleEntry, enforceSizeCap } from './contextLayerStore'

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
    console.warn('[context-layer] GC: failed to delete module', moduleId, error)
    return false
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function runContextLayerGC(options: GCOptions): Promise<GCResult> {
  const {
    workspaceRoot,
    currentModuleIds,
    maxModules,
    maxSizeBytes,
    maxStalenessMs,
  } = options

  const result: GCResult = {
    deletedOrphans: [],
    deletedStale: [],
    deletedOverflow: [],
    reclaimedBytes: 0,
  }

  // Read all entries and compute pre-GC byte total
  let entries = await readAllModuleEntries(workspaceRoot)
  const bytesBefore = entries.reduce((sum, e) => sum + estimateEntryBytes(e), 0)

  // --------------------------------------------------
  // Pass 1: ORPHAN SWEEP
  // --------------------------------------------------

  const orphanIds: string[] = []
  for (const entry of entries) {
    const id = entry.structural.module.id
    if (!currentModuleIds.has(id)) {
      orphanIds.push(id)
    }
  }

  for (const id of orphanIds) {
    const deleted = await safeDelete(workspaceRoot, id)
    if (deleted) {
      result.deletedOrphans.push(id)
    }
  }

  if (result.deletedOrphans.length > 0) {
    console.log('[context-layer] GC: orphan sweep deleted', result.deletedOrphans.length, 'modules')
  }

  // Remove orphaned entries from the working set
  const orphanSet = new Set(result.deletedOrphans)
  entries = entries.filter((e) => !orphanSet.has(e.structural.module.id))

  // --------------------------------------------------
  // Pass 2: STALENESS SWEEP
  // --------------------------------------------------

  const now = Date.now()
  const staleIds: string[] = []

  for (const entry of entries) {
    const id = entry.structural.module.id
    const age = now - entry.structural.lastModified
    const threshold = entry.ai
      ? maxStalenessMs * AI_STALENESS_MULTIPLIER
      : maxStalenessMs

    if (age > threshold) {
      staleIds.push(id)
    }
  }

  for (const id of staleIds) {
    const deleted = await safeDelete(workspaceRoot, id)
    if (deleted) {
      result.deletedStale.push(id)
    }
  }

  if (result.deletedStale.length > 0) {
    console.log('[context-layer] GC: staleness sweep deleted', result.deletedStale.length, 'modules')
  }

  // Remove stale entries from the working set
  const staleSet = new Set(result.deletedStale)
  entries = entries.filter((e) => !staleSet.has(e.structural.module.id))

  // --------------------------------------------------
  // Pass 3: SIZE CAP ENFORCEMENT
  // --------------------------------------------------

  await enforceSizeCap(workspaceRoot, maxSizeBytes)

  // --------------------------------------------------
  // Pass 4: MODULE COUNT ENFORCEMENT
  // --------------------------------------------------

  // Re-read after size cap enforcement may have removed entries
  entries = await readAllModuleEntries(workspaceRoot)

  if (entries.length > maxModules) {
    // Sort by fileCount ascending (smallest modules first)
    const sorted = [...entries].sort(
      (a, b) => a.structural.fileCount - b.structural.fileCount,
    )

    const toDelete = sorted.slice(0, entries.length - maxModules)

    for (const entry of toDelete) {
      const id = entry.structural.module.id
      const deleted = await safeDelete(workspaceRoot, id)
      if (deleted) {
        result.deletedOverflow.push(id)
      }
    }

    if (result.deletedOverflow.length > 0) {
      console.log('[context-layer] GC: module count enforced, deleted', result.deletedOverflow.length, 'modules')
    }
  }

  // --------------------------------------------------
  // Byte tracking
  // --------------------------------------------------

  const entriesAfter = await readAllModuleEntries(workspaceRoot)
  const bytesAfter = entriesAfter.reduce((sum, e) => sum + estimateEntryBytes(e), 0)
  result.reclaimedBytes = Math.max(0, bytesBefore - bytesAfter)

  if (result.reclaimedBytes > 0) {
    console.log('[context-layer] GC: size cap enforced, reclaimed', result.reclaimedBytes, 'bytes')
  }

  return result
}
