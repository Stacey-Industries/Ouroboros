/**
 * graphGc.ts — GC pruner for stale project graphs.
 *
 * Iterates all known projects and removes those whose last_opened_at
 * is strictly older than the configured threshold. Projects with
 * last_opened_at === 0 (never opened under the new schema) are preserved.
 */

import log from '../logger'

import type { GraphDatabase } from './graphDatabase'

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
