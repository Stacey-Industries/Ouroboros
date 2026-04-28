/**
 * rankerHitsSchema.ts — Wave 53b Phase B
 *
 * Per-surface schema definition for ranker-selection and ranker-hit telemetry
 * surfaces. Imported by `contextRankerTelemetry.ts`.
 *
 * Schema-mirror discipline
 * ────────────────────────
 * No hook scripts write these records — they are emitted directly from the
 * main process. If a hook script is added in a future wave to write these
 * records, the hook's comment block MUST mirror the interface shapes here.
 * When any interface below changes:
 *   1. Bump the relevant SCHEMA_VERSION constant.
 *   2. Update any future hook script's comment mirror.
 *
 * Dedup design
 * ────────────
 * RankerSelectionRecord: one per IDE-orchestrated build (keyed by sessionId).
 * RankerHitRecord: one per session-end flush (keyed by sessionId).
 * Both surfaces write a single record per session — dedup on sessionId is
 * appropriate for downstream consumers.
 */

// ---------------------------------------------------------------------------
// Surface identifiers
// ---------------------------------------------------------------------------

export const RANKER_SELECTION_SURFACE = 'ranker-selection';
export const RANKER_HIT_SURFACE = 'ranker-hit';

// ---------------------------------------------------------------------------
// Schema versions
// ---------------------------------------------------------------------------

/** Bump when RankerSelectionRecord shape changes. Old handlers skip unknown versions. */
export const RANKER_SELECTION_SCHEMA_VERSION = 1;

/** Bump when RankerHitRecord shape changes. Old handlers skip unknown versions. */
export const RANKER_HIT_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single ranked file as seen by the agent — post-rerank ordering. */
export interface RankerSelectionFile {
  /** File path relative to workspaceRoot. */
  path: string;
  /** Composite score from contextSelector (post-rerank may have modified order). */
  score: number;
  /** Confidence tier derived from score + reasons. */
  confidence: 'high' | 'medium' | 'low';
  /** Reason kind strings (e.g. ['git_diff', 'keyword_match']). */
  reasons: string[];
}

/**
 * Emitted once per IDE-orchestrated context build, after rerankRankedFiles
 * returns. Records the post-rerank file list the agent will see in
 * <relevant_code>.
 *
 * Schema version: {@link RANKER_SELECTION_SCHEMA_VERSION}.
 */
export interface RankerSelectionRecord {
  /** Claude Code session ID. */
  sessionId: string;
  /** Workspace root — paths in `files` are relative to this. */
  workspaceRoot: string;
  /** Unix timestamp (ms) of the selection event. */
  ts: number;
  /** Ranked files shipped to <relevant_code>, in post-rerank order. */
  files: RankerSelectionFile[];
  /**
   * Total files that entered the ranker (may exceed files.length if budget
   * pruning dropped some before they reached <relevant_code>).
   */
  totalFiles: number;
}

/**
 * Emitted once per session-end flush. Correlates pre-loaded files against
 * subsequent Read tool calls to measure ranker hit rate.
 *
 * Schema version: {@link RANKER_HIT_SCHEMA_VERSION}.
 */
export interface RankerHitRecord {
  /** Claude Code session ID. */
  sessionId: string;
  /** Unix timestamp (ms) of the flush. */
  ts: number;
  /** Number of files in the RankerSelectionRecord for this session. */
  preLoadedCount: number;
  /** Count of distinct pre-loaded paths that were Read at least once. */
  uniqueReadHits: number;
  /** Total number of Read tool calls observed in the session. */
  totalReads: number;
  /**
   * Per-rank-position hit indicator. Index 0 = rank 1 (top file).
   * 1 if that position was Read at least once, 0 otherwise.
   * Length equals preLoadedCount.
   */
  hitsByRank: number[];
  /** Session duration from first selection to flush (ms). */
  sessionDurationMs: number;
}
