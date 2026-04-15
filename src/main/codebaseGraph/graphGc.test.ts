/**
 * graphGc.test.ts — Tests for the GC pruner.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GraphDatabase } from './graphDatabase'
import { pruneExpiredProjects } from './graphGc'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function seedProject(db: GraphDatabase, name: string, lastOpenedAt: number): void {
  db.upsertProject({ name, root_path: `/projects/${name}`, indexed_at: Date.now(), node_count: 0, edge_count: 0 })
  if (lastOpenedAt > 0) db.touchProjectOpened(name)
  // Override last_opened_at directly since touchProjectOpened sets it to Date.now()
  db['db'].prepare('UPDATE projects SET last_opened_at = ? WHERE name = ?').run(lastOpenedAt, name)
}

const DAY_MS = 86_400_000

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('pruneExpiredProjects', () => {
  let db: GraphDatabase

  beforeEach(() => {
    db = new GraphDatabase(':memory:')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    db.close()
    vi.restoreAllMocks()
  })

  it('returns zero counts when there are no projects', () => {
    const report = pruneExpiredProjects(db, 90)
    expect(report.prunedCount).toBe(0)
    expect(report.keptCount).toBe(0)
    expect(report.prunedProjects).toEqual([])
  })

  it('prunes a project that is strictly older than the threshold', () => {
    const oldTimestamp = Date.now() - 100 * DAY_MS // 100 days ago
    seedProject(db, 'old-project', oldTimestamp)

    const report = pruneExpiredProjects(db, 90)

    expect(report.prunedCount).toBe(1)
    expect(report.prunedProjects).toContain('old-project')
    expect(db.getProject('old-project')).toBeNull()
  })

  it('keeps a project that is within the threshold', () => {
    const recentTimestamp = Date.now() - 30 * DAY_MS // 30 days ago
    seedProject(db, 'fresh-project', recentTimestamp)

    const report = pruneExpiredProjects(db, 90)

    expect(report.prunedCount).toBe(0)
    expect(report.keptCount).toBe(1)
    expect(db.getProject('fresh-project')).not.toBeNull()
  })

  it('keeps a project whose last_opened_at is exactly at the threshold boundary', () => {
    // Freeze time so Date.now() at seed and Date.now() inside pruneExpiredProjects
    // are identical; otherwise the few-ms gap pushes cutoff past the seed timestamp.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T00:00:00Z'))
    try {
      const boundaryTimestamp = Date.now() - 90 * DAY_MS
      seedProject(db, 'boundary-project', boundaryTimestamp)

      const report = pruneExpiredProjects(db, 90)

      // >= cutoff means kept (boundary is not strictly older)
      expect(report.keptCount).toBe(1)
      expect(report.prunedCount).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('preserves projects with last_opened_at === 0 (never opened under new schema)', () => {
    db.upsertProject({ name: 'unseeded', root_path: '/projects/unseeded', indexed_at: Date.now(), node_count: 0, edge_count: 0 })
    // last_opened_at defaults to 0

    const report = pruneExpiredProjects(db, 90)

    expect(report.keptCount).toBe(1)
    expect(report.prunedCount).toBe(0)
    expect(db.getProject('unseeded')).not.toBeNull()
  })

  it('handles a mix of expired, fresh, and unseeded projects correctly', () => {
    seedProject(db, 'expired-a', Date.now() - 120 * DAY_MS)
    seedProject(db, 'expired-b', Date.now() - 200 * DAY_MS)
    seedProject(db, 'fresh', Date.now() - 10 * DAY_MS)
    db.upsertProject({ name: 'never-opened', root_path: '/p/n', indexed_at: Date.now(), node_count: 0, edge_count: 0 })

    const report = pruneExpiredProjects(db, 90)

    expect(report.prunedCount).toBe(2)
    expect(report.keptCount).toBe(2)
    expect(report.prunedProjects).toContain('expired-a')
    expect(report.prunedProjects).toContain('expired-b')
    expect(db.getProject('fresh')).not.toBeNull()
    expect(db.getProject('never-opened')).not.toBeNull()
  })
})
