/**
 * gitCoChangePass.ts — Git history co-change analysis pass.
 *
 * Runs `git log --name-only -200` against the project repository and counts
 * how often each pair of files appears together in a single commit. When
 * two files co-change 3+ times, a FILE_CHANGES_WITH edge is created between
 * their corresponding File nodes in the graph.
 *
 * Commits that touch more than 20 files (large refactors, bulk renames) are
 * excluded to avoid noisy correlations.
 */

import { execSync } from 'child_process'
import type { GraphDatabase } from '../graphDatabase'
import type { GraphEdge } from '../graphDatabaseTypes'

// ─── Configuration ───────────────────────────────────────────────────────────

/** Maximum files per commit before the commit is considered too large. */
const MAX_FILES_PER_COMMIT = 20

/** Minimum number of co-changes before an edge is created. */
const CO_CHANGE_THRESHOLD = 3

/** Number of recent commits to analyse. */
const COMMIT_COUNT = 200

// ─── Pass implementation ─────────────────────────────────────────────────────

export function gitCoChangePass(
  db: GraphDatabase,
  projectName: string,
  projectRoot: string,
): void {
  // ── Retrieve commit history ────────────────────────────────────────────
  let commitFiles: string[][]
  try {
    const log = execSync(
      `git log --pretty=format:"---COMMIT---" --name-only -${COMMIT_COUNT}`,
      {
        cwd: projectRoot,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
      },
    )

    commitFiles = log
      .split('---COMMIT---')
      .filter(Boolean)
      .map((block) => block.trim().split('\n').filter(Boolean))
  } catch {
    // Not a git repo, git not available, or other error — silently skip.
    return
  }

  // ── Count co-occurrences ───────────────────────────────────────────────
  const coChangeCounts = new Map<string, number>()

  for (const files of commitFiles) {
    // Skip single-file commits (nothing to pair) and large commits (noisy).
    if (files.length < 2 || files.length > MAX_FILES_PER_COMMIT) continue

    for (let i = 0; i < files.length; i++) {
      for (let j = i + 1; j < files.length; j++) {
        // Sort the pair so (A,B) and (B,A) map to the same key.
        const key = [files[i], files[j]].sort().join('|')
        coChangeCounts.set(key, (coChangeCounts.get(key) ?? 0) + 1)
      }
    }
  }

  // ── Create edges for frequent co-changers ──────────────────────────────
  const edges: Omit<GraphEdge, 'id'>[] = []

  coChangeCounts.forEach((count, key) => {
    if (count < CO_CHANGE_THRESHOLD) return

    const [fileA, fileB] = key.split('|')
    const qnA = `${projectName}.${fileA.replace(/\//g, '.').replace(/\.[^.]+$/, '')}`
    const qnB = `${projectName}.${fileB.replace(/\//g, '.').replace(/\.[^.]+$/, '')}`

    // Only create the edge when both File nodes exist in the graph.
    if (!db.getNode(qnA) || !db.getNode(qnB)) return

    edges.push({
      project: projectName,
      source_id: qnA,
      target_id: qnB,
      type: 'FILE_CHANGES_WITH',
      props: { count },
    })
  })

  if (edges.length > 0) {
    db.insertEdges(edges)
  }
}
