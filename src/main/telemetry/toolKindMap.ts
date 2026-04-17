/**
 * toolKindMap.ts — Shared ToolKind derivation helper.
 *
 * Extracted here so both contextOutcomeObserverSupport.ts (context outcomes)
 * and contextOutcomeObserverResearch.ts (research outcomes) import from a
 * single source of truth. Wave 31 training scripts join on these literals —
 * keep the mapping stable across waves.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Coarse bucket derived from the raw tool name. Used by Wave 31 ranker. */
export type ResearchToolKind = 'read' | 'edit' | 'write' | 'other';

// ─── Mapping sets ─────────────────────────────────────────────────────────────

const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'ApplyPatch', 'edit_file']);
const WRITE_TOOLS = new Set(['Write', 'Create', 'write_file']);
const READ_TOOLS = new Set(['Read', 'Grep', 'Glob', 'read_file', 'view_file']);

/**
 * Map a raw tool name to one of the four ResearchToolKind buckets.
 * The mapping is intentionally stable — Wave 31's training script joins on
 * these literals.
 */
export function deriveResearchToolKind(toolName: string | undefined): ResearchToolKind {
  if (!toolName) return 'other';
  if (EDIT_TOOLS.has(toolName)) return 'edit';
  if (WRITE_TOOLS.has(toolName)) return 'write';
  if (READ_TOOLS.has(toolName)) return 'read';
  return 'other';
}
