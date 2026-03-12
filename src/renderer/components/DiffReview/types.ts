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

export interface DiffReviewState {
  sessionId: string;
  snapshotHash: string;
  projectRoot: string;
  files: ReviewFile[];
  loading: boolean;
  error: string | null;
}
