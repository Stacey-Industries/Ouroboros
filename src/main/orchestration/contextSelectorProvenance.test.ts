/**
 * contextSelectorProvenance.test.ts — Unit tests for Wave 19 provenance helpers.
 *
 * Coverage:
 * - resolveEditReasonKind: null provenance, pure-user, pure-agent, mixed, stale-agent
 * - isDiffAgentAuthored: provenance fast path, commit-trailer slow path, mixed hunks
 * - isRecentUserEdit: delegates to resolveEditReasonKind correctly
 */

import { describe, expect, it } from 'vitest'

import {
  isDiffAgentAuthored,
  isRecentUserEdit,
  resolveEditReasonKind,
} from './contextSelectorProvenance'
import type { RepoFacts } from './types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FILE = '/src/foo.ts'

function makeProvenance(lastAgentEditAt: number, lastUserEditAt: number) {
  return () => ({ lastAgentEditAt, lastUserEditAt })
}

function nullProvenance() {
  return () => null
}

function makeRepoFacts(overrides: Partial<RepoFacts['gitDiff']> = {}): RepoFacts {
  return {
    workspaceRoots: [],
    roots: [],
    recentEdits: { files: [], generatedAt: 0 },
    diagnostics: {
      files: [],
      totalErrors: 0,
      totalWarnings: 0,
      totalInfos: 0,
      totalHints: 0,
      generatedAt: 0,
    },
    gitDiff: {
      changedFiles: [],
      totalAdditions: 0,
      totalDeletions: 0,
      changedFileCount: 0,
      generatedAt: 0,
      ...overrides,
    },
  }
}

// ─── resolveEditReasonKind ────────────────────────────────────────────────────

describe('resolveEditReasonKind', () => {
  it('returns recent_edit when provenance is null (safe fallback)', () => {
    expect(resolveEditReasonKind(FILE, nullProvenance())).toBe('recent_edit')
  })

  it('returns recent_edit when both timestamps are 0', () => {
    expect(resolveEditReasonKind(FILE, makeProvenance(0, 0))).toBe('recent_edit')
  })

  it('returns recent_user_edit when user edit is more recent than agent edit', () => {
    const now = Date.now()
    expect(resolveEditReasonKind(FILE, makeProvenance(now - 5000, now - 1000))).toBe('recent_user_edit')
  })

  it('returns recent_agent_edit when agent edit is more recent and within window', () => {
    const now = Date.now()
    // Agent edited 30 seconds ago, user never edited
    expect(resolveEditReasonKind(FILE, makeProvenance(now - 30_000, 0))).toBe('recent_agent_edit')
  })

  it('returns recent_user_edit when agent edit is older than 10-minute window', () => {
    const now = Date.now()
    const elevenMinutesAgo = now - 11 * 60 * 1000
    expect(resolveEditReasonKind(FILE, makeProvenance(elevenMinutesAgo, 0))).toBe('recent_user_edit')
  })

  it('returns recent_user_edit when user and agent timestamps are equal', () => {
    // Equal timestamps: user edit wins (not strictly greater)
    const ts = Date.now() - 1000
    expect(resolveEditReasonKind(FILE, makeProvenance(ts, ts))).toBe('recent_user_edit')
  })

  it('returns recent_agent_edit when agent edited very recently and user never edited', () => {
    const now = Date.now()
    expect(resolveEditReasonKind(FILE, makeProvenance(now - 100, 0))).toBe('recent_agent_edit')
  })
})

// ─── isDiffAgentAuthored ──────────────────────────────────────────────────────

describe('isDiffAgentAuthored', () => {
  it('returns false when provenance is null and no diff entry exists', () => {
    const result = isDiffAgentAuthored(FILE, makeRepoFacts(), nullProvenance())
    expect(result).toBe(false)
  })

  it('returns true via provenance fast path when agent edited more recently', () => {
    const now = Date.now()
    const prov = makeProvenance(now - 100, 0)
    const result = isDiffAgentAuthored(FILE, makeRepoFacts(), prov)
    expect(result).toBe(true)
  })

  it('returns false via provenance fast path when user edited more recently', () => {
    const now = Date.now()
    const prov = makeProvenance(now - 5000, now - 100)
    const result = isDiffAgentAuthored(FILE, makeRepoFacts(), prov)
    expect(result).toBe(false)
  })

  it('returns true when all diff hunks carry Co-Authored-By: Claude trailer', () => {
    const repoFacts = makeRepoFacts({
      changedFiles: [
        {
          filePath: 'src/foo.ts',
          status: 'modified',
          additions: 3,
          deletions: 1,
          hunks: [
            { header: '@@ -1 +1 @@', lines: [], commitMessage: 'fix: thing\n\nCo-Authored-By: Claude Sonnet <noreply@anthropic.com>' },
            { header: '@@ -5 +5 @@', lines: [], commitMessage: 'chore: tidy\n\nCo-Authored-By: Claude Opus 4 <noreply@anthropic.com>' },
          ] as unknown as never,
        },
      ],
    })
    const result = isDiffAgentAuthored(FILE, repoFacts, nullProvenance())
    expect(result).toBe(true)
  })

  it('returns false when any hunk lacks the Claude trailer', () => {
    const repoFacts = makeRepoFacts({
      changedFiles: [
        {
          filePath: 'src/foo.ts',
          status: 'modified',
          additions: 2,
          deletions: 0,
          hunks: [
            { header: '@@ -1 +1 @@', lines: [], commitMessage: 'feat: human work' },
            { header: '@@ -5 +5 @@', lines: [], commitMessage: 'fix\n\nCo-Authored-By: Claude <noreply@anthropic.com>' },
          ] as unknown as never,
        },
      ],
    })
    const result = isDiffAgentAuthored(FILE, repoFacts, nullProvenance())
    expect(result).toBe(false)
  })

  it('returns false when hunks have no commit messages', () => {
    const repoFacts = makeRepoFacts({
      changedFiles: [
        {
          filePath: 'src/foo.ts',
          status: 'modified',
          additions: 1,
          deletions: 0,
          hunks: [{ header: '@@ -1 +1 @@', lines: [] }] as unknown as never,
        },
      ],
    })
    const result = isDiffAgentAuthored(FILE, repoFacts, nullProvenance())
    expect(result).toBe(false)
  })
})

// ─── isRecentUserEdit ─────────────────────────────────────────────────────────

describe('isRecentUserEdit', () => {
  it('returns true when provenance is null (safe: treat unknown as user)', () => {
    expect(isRecentUserEdit(FILE, nullProvenance())).toBe(true)
  })

  it('returns true for pure user edit', () => {
    const now = Date.now()
    expect(isRecentUserEdit(FILE, makeProvenance(now - 5000, now - 100))).toBe(true)
  })

  it('returns false for recent agent edit', () => {
    const now = Date.now()
    expect(isRecentUserEdit(FILE, makeProvenance(now - 100, 0))).toBe(false)
  })

  it('returns true for stale agent edit (older than 10 min)', () => {
    const now = Date.now()
    expect(isRecentUserEdit(FILE, makeProvenance(now - 11 * 60 * 1000, 0))).toBe(true)
  })
})
