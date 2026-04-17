/**
 * contextOutcomeObserverSupport.ts — Pure helpers for contextOutcomeObserver.ts.
 *
 * Extracted to keep contextOutcomeObserver.ts under the 300-line ESLint limit.
 * Provides:
 *   - deriveToolKind()   — maps toolUsed string → ToolKind literal
 *   - buildOutcomeBase() — assembles the common fields for a ContextOutcome
 */

import type { ContextOutcome, ToolKind } from './contextTypes';
import { normaliseFileId } from './fileIdNormalise';

// ─── toolKind derivation ──────────────────────────────────────────────────────

const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'ApplyPatch', 'edit_file']);
const WRITE_TOOLS = new Set(['Write', 'Create', 'write_file']);
const READ_TOOLS = new Set(['Read', 'Grep', 'Glob', 'read_file', 'view_file']);

/**
 * Map a raw tool name to one of the four ToolKind buckets used in the
 * ContextOutcome record. The mapping is intentionally stable — Wave 31's
 * training script joins on these literals.
 */
export function deriveToolKind(toolUsed: string | undefined): ToolKind {
  if (!toolUsed) return 'other';
  if (EDIT_TOOLS.has(toolUsed)) return 'edit';
  if (WRITE_TOOLS.has(toolUsed)) return 'write';
  if (READ_TOOLS.has(toolUsed)) return 'read';
  return 'other';
}

// ─── Outcome builder ──────────────────────────────────────────────────────────

interface OutcomeBaseOpts {
  rawPath: string;
  workspaceRoot: string;
  traceId: string;
  sessionId: string;
  kind: ContextOutcome['kind'];
  toolUsed?: string;
}

/**
 * Build the common fields for a ContextOutcome.  The caller merges in any
 * kind-specific fields (e.g. `decisionId` for used/unused entries).
 */
export function buildOutcomeBase(opts: OutcomeBaseOpts): ContextOutcome {
  const { rawPath, workspaceRoot, traceId, sessionId, kind, toolUsed } = opts;
  const fileId = normaliseFileId(rawPath, workspaceRoot);
  return {
    traceId,
    fileId,
    sessionId,
    timestamp: Date.now(),
    kind,
    toolKind: deriveToolKind(toolUsed),
    toolUsed,
    schemaVersion: 2,
  };
}
