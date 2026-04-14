/**
 * shared/types/sessionCheckpoint.ts
 *
 * Per-turn session checkpoint types — Wave 6 (#107).
 * Git-backed snapshots attached to assistant turns for rewind support.
 */

export interface SessionCheckpoint {
  id: string;
  threadId: string;
  /** Assistant message id this checkpoint was captured after. */
  messageId: string;
  /** Git commit hash on the dedicated refs/ouroboros/checkpoints/<threadId> ref. */
  commitHash: string;
  /** Files touched in the turn that produced this checkpoint. */
  filesChanged: string[];
  createdAt: string;
  /** Optional user-supplied label for manual checkpoints. */
  label?: string;
}

export interface CheckpointListRequest {
  threadId: string;
  projectRoot: string;
}

export interface CheckpointRestoreRequest {
  checkpointId: string;
  projectRoot: string;
  /** When true, stash uncommitted changes before restore (default true). */
  stashDirty?: boolean;
}

export interface CheckpointRestoreResult {
  success: boolean;
  restoredCommitHash?: string;
  stashRef?: string;
  error?: string;
}
