/**
 * types.ts — DiffReview domain types.
 *
 * Describes the review state for per-hunk accept/reject of agent changes.
 */

export type HunkDecision = 'pending' | 'accepted' | 'rejected';

export interface ReviewHunk {
  id: string;
  header: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: string[];
  rawPatch: string;
  decision: HunkDecision;
}

export interface ReviewFile {
  filePath: string;
  relativePath: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed';
  hunks: ReviewHunk[];
  oldPath?: string;
}

/** A staged git operation waiting for the user to confirm despite file staleness. */
export interface StalePendingOp {
  kind: 'stage' | 'revert';
  fileIdx: number;
  hunkIdx: number;
}

export interface DiffReviewState {
  sessionId: string;
  snapshotHash: string;
  projectRoot: string;
  filePaths?: string[];
  files: ReviewFile[];
  loading: boolean;
  error: string | null;
  /** Hunk IDs from the most recently user-initiated accept action. Null means no rollback available. */
  lastAcceptedBatch: string[] | null;
  /**
   * Paths (relative) of files that have been modified externally since the diff
   * was loaded.  Any stage/revert against these files will surface a re-prompt
   * before proceeding.
   */
  staleFiles: string[];
  /**
   * When the user tries to stage/revert a stale file this holds the pending op
   * so the confirmation dialog can re-invoke it on approval.
   */
  stalePendingOp: StalePendingOp | null;
}
