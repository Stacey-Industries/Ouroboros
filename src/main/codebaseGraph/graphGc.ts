/**
 * graphGc.ts — GC pruner for stale project graphs.
 *
 * Iterates all known projects and removes those whose last_opened_at
 * is strictly older than the configured threshold. Projects with
 * last_opened_at === 0 (never opened under the new schema) are preserved.
 *
 * Also exports purgeSkippedNodes — a one-time migration pass that evicts nodes
 * whose file_path matches skip rules (e.g. .claude/worktrees subtrees). Gated
 * by the graph_metadata key `gc_schema_v2` so it runs at most once per DB.
 */

import log from '../logger'
import type { GraphDatabase } from './graphDatabase'

/** Metadata key that marks the skip-node GC pass as done for this DB. */
const GC_SCHEMA_V2_KEY = 'gc_schema_v2'

/** Worktree path substring used by the bulk-delete helper. */
const WORKTREE_SUBSTR = '.claude/worktrees/'

export interface PurgeSkippedReport {
  alreadyDone: boolean
  projectsScanned: number
  totalPurged: number
}

/**
 * One-time GC: delete all nodes whose file_path falls inside a worktree subtree.
 * Writes `gc_schema_v2 = done` on completion so subsequent calls are no-ops.
 */
export function purgeSkippedNodes(db: GraphDatabase): PurgeSkippedReport {
  if (db.getGraphMetadata(GC_SCHEMA_V2_KEY) === 'done') {
    return { alreadyDone: true, projectsScanned: 0, totalPurged: 0 }
  }

  const projects = db.listAllProjects()
  let totalPurged = 0

  db.transaction(() => {
    for (const p of projects) {
      const purged = db.deleteNodesByFilePathSubstring(p.name, WORKTREE_SUBSTR)
      if (purged > 0) {
        log.info(`[graphGc] purged ${purged} stale worktree nodes from project "${p.name}"`)
        totalPurged += purged
      }
    }
    db.setGraphMetadata(GC_SCHEMA_V2_KEY, 'done')
  })

  log.info(`[graphGc] skip-node GC complete — ${totalPurged} nodes purged across ${projects.length} projects`)
  return { alreadyDone: false, projectsScanned: projects.length, totalPurged }
}

export interface PruneReport {
  prunedCount: number
  keptCount: number
  prunedProjects: string[]
}

export function pruneExpiredProjects(
  db: GraphDatabase,
  thresholdDays: number,
): PruneReport {
  const cutoff = Date.now() - thresholdDays * 86_400_000
  const projects = db.listAllProjects()
  const prunedProjects: string[] = []
  let keptCount = 0

  for (const p of projects) {
    if (p.last_opened_at === 0 || p.last_opened_at >= cutoff) {
      keptCount++
      continue
    }
    const daysAgo = Math.floor((Date.now() - p.last_opened_at) / 86_400_000)
    const report = db.pruneProject(p.name)
    log.info(
      `Pruned graph for project ${p.name}, last opened ${daysAgo} days ago` +
        ` (${report.nodes} nodes, ${report.edges} edges)`,
    )
    prunedProjects.push(p.name)
  }

  return { prunedCount: prunedProjects.length, keptCount, prunedProjects }
}
