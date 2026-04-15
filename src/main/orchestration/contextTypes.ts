/**
 * contextTypes.ts — Observability types for context selection decisions.
 *
 * Signatures defined in Wave 15 Phase F. Wave 24 (Context Decision Logging &
 * Haiku Reranker) populates the actual content. Wave 18 (Edit Provenance)
 * populates EditProvenance content.
 *
 * Tables already exist in telemetry.db from Wave 15 Phase A — this file
 * just mirrors the row shapes as first-class TS types so downstream waves
 * don't have to re-derive them.
 */

// ─── Storage path constants ───────────────────────────────────────────────────

/** Directory under {userData} where telemetry artifacts live. */
export const TELEMETRY_DIR = 'telemetry';

/** Directory (relative to project root) where outcome artifacts are written
 *  by external runners (typecheck, lint, test). Wave 15 Phase C's outcome
 *  observer watches PTY exits directly; Wave 18+ may extend this to scan
 *  this directory for structured outcome artifacts. */
export const OUTCOMES_DIR = '.ouroboros/outcomes';

// ─── Context feature vector ───────────────────────────────────────────────────

/**
 * Features captured for each file the ranker considered. The shape is
 * defined here in Phase F; Wave 24 populates score/reasons/pagerank_score
 * at packet-build time and writes ContextDecision rows.
 */
export interface ContextFeatures {
  /** Additive weight sum for this file in the ranked selection. */
  score: number;
  /** Which reasons contributed, and at what weight. */
  reasons: ReadonlyArray<{ kind: string; weight: number }>;
  /** PageRank score if graph analysis was available (null if not / pre-Wave 19). */
  pagerank_score: number | null;
  /** Whether the file was in the final prompt packet (within budget). */
  included: boolean;
}

// ─── Context decision record (context_decisions table) ───────────────────────

/** One row per (traceId, fileId) considered during packet build. */
export interface ContextDecision {
  id: string;
  /** Router trace ID that scoped this packet build. */
  traceId: string;
  /** Normalised path key (toPathKey). */
  fileId: string;
  features: ContextFeatures;
  score: number;
  included: boolean;
}

// ─── Context outcome record (context_outcomes table) ─────────────────────────

export type ContextOutcomeKind =
  | 'used' // agent Read/Edited a file in the packet
  | 'unused' // in packet, not touched
  | 'missed'; // agent Read/Edited a file NOT in the packet

export interface ContextOutcome {
  decisionId: string;
  kind: ContextOutcomeKind;
  /** Which tool used the file, if kind === 'used'. */
  toolUsed?: string;
}

// ─── Edit provenance (Wave 18 populates; scaffold here) ──────────────────────

/**
 * Tracks who last edited a file — agent vs user. Wave 18 wires this by
 * hooking the chat bridge's post-Edit/post-Write callbacks vs the
 * nativeWatcher's user-edit events. Wave 19 rebalances context weights
 * using this signal.
 */
export interface EditProvenance {
  sessionId: string;
  /** ISO timestamp of last edit observed. */
  editedAt: string;
  /** Tool that performed the edit (Edit, Write, MultiEdit) if agent-driven;
   *  'user' for user-driven edits. */
  editTool: string;
  /** correlationId of the post_tool_use event for that edit (agent-driven);
   *  empty for user-driven edits. */
  correlationId: string;
}
