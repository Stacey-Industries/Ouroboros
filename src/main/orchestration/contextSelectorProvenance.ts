/**
 * contextSelectorProvenance.ts — Provenance-aware weight helpers for Wave 19.
 *
 * Extracted from contextSelector.ts to respect the 300-line ESLint limit.
 *
 * Exports:
 *  - resolveEditReasonKind  — picks recent_user_edit / recent_agent_edit / recent_edit
 *  - isDiffAgentAuthored    — detects Co-Authored-By: Claude in commit metadata
 */

import type { ContextReasonKind, RepoFacts } from './types'

// ─── Edit provenance resolution ───────────────────────────────────────────────

/** How recently an agent edit is still considered "agent-owned" (10 minutes). */
const AGENT_RECENCY_WINDOW_MS = 10 * 60 * 1000

interface EditProvenanceRecord {
  lastAgentEditAt: number
  lastUserEditAt: number
}

/**
 * Resolve which `ContextReasonKind` to apply for a recently-edited file.
 *
 * Logic:
 * - If provenance unavailable → fall back to legacy `recent_edit` (safe default).
 * - If lastUserEditAt >= lastAgentEditAt and lastUserEditAt > 0 → `recent_user_edit`.
 * - If lastAgentEditAt > 0 and within AGENT_RECENCY_WINDOW_MS → `recent_agent_edit`.
 * - Otherwise → `recent_user_edit` (treat stale / equal timestamps as user-owned).
 */
export function resolveEditReasonKind(
  filePath: string,
  getProvenance: (path: string) => EditProvenanceRecord | null,
): ContextReasonKind {
  const prov = getProvenance(filePath)
  if (!prov) return 'recent_edit'
  if (prov.lastAgentEditAt === 0 && prov.lastUserEditAt === 0) return 'recent_edit'

  // Equal timestamps: user-owned (conservative — avoid under-promoting user work)
  if (prov.lastUserEditAt >= prov.lastAgentEditAt && prov.lastUserEditAt > 0) return 'recent_user_edit'

  const agentAge = Date.now() - prov.lastAgentEditAt
  if (prov.lastAgentEditAt > 0 && agentAge < AGENT_RECENCY_WINDOW_MS) {
    return 'recent_agent_edit'
  }
  return 'recent_user_edit'
}

// ─── Diff agent-authorship detection ─────────────────────────────────────────

/** Trailer that Claude Code appends to co-authored commits. */
const CLAUDE_TRAILER_RE = /Co-Authored-By:\s*Claude/i

/**
 * Return true if the diff for `filePath` appears to be entirely agent-authored.
 *
 * Fast path: provenance store says lastAgentEditAt > 0 and no more-recent user edit.
 * Slow path: scan `repoFacts.gitDiff.changedFiles` for the file and check commit
 * messages for a `Co-Authored-By: Claude` trailer.
 */
export function isDiffAgentAuthored(
  filePath: string,
  repoFacts: RepoFacts,
  getProvenance: (path: string) => EditProvenanceRecord | null,
): boolean {
  // Fast path via provenance
  const prov = getProvenance(filePath)
  if (prov && prov.lastAgentEditAt > 0 && prov.lastUserEditAt <= prov.lastAgentEditAt) {
    return true
  }

  // Slow path: scan commit messages in diff hunks
  const changedFile = repoFacts.gitDiff.changedFiles.find(
    (f) => f.filePath === filePath || filePath.endsWith(f.filePath),
  )
  if (!changedFile) return false

  // hunks may carry commit message metadata (added in Wave 15+)
  const hunks = changedFile.hunks ?? []
  if (hunks.length === 0) return false

  // Check if ALL hunks with commit messages carry the Claude trailer
  const hunkMessages = hunks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- hunk.commitMessage is an optional extension field
    .map((h: any) => h.commitMessage as string | undefined)
    .filter((m): m is string => typeof m === 'string' && m.length > 0)

  if (hunkMessages.length === 0) return false
  return hunkMessages.every((msg) => CLAUDE_TRAILER_RE.test(msg))
}

/**
 * Return true if the file was recently user-edited (user edit is more recent
 * than agent edit, or agent edit is older than AGENT_RECENCY_WINDOW_MS).
 */
export function isRecentUserEdit(
  filePath: string,
  getProvenance: (path: string) => EditProvenanceRecord | null,
): boolean {
  const kind = resolveEditReasonKind(filePath, getProvenance)
  return kind === 'recent_user_edit' || kind === 'recent_edit'
}
