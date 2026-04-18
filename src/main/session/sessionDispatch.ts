/**
 * sessionDispatch.ts — Wave 34 Phase A data model.
 *
 * Types-only. No Node APIs — importable from both main and renderer.
 */

// ── Status ────────────────────────────────────────────────────────────────────

export type DispatchJobStatus =
  | 'queued'
  | 'starting'
  | 'running'
  | 'completed'
  | 'failed'
  | 'canceled';

// ── Request / Job ─────────────────────────────────────────────────────────────

export interface DispatchRequest {
  title: string;
  prompt: string;
  projectPath: string;
  /** When present, the runner creates a new git worktree with this name. */
  worktreeName?: string;
}

export interface DispatchJob {
  /** UUID generated at enqueue time. */
  id: string;
  request: DispatchRequest;
  status: DispatchJobStatus;
  /** ISO 8601 timestamp — set at enqueue. */
  createdAt: string;
  /** ISO 8601 timestamp — set when runner transitions to 'starting'. */
  startedAt?: string;
  /** ISO 8601 timestamp — set on completion, failure, or cancellation. */
  endedAt?: string;
  /** Claude Code session UUID — populated when the runner spawns the session. */
  sessionId?: string;
  /** Error description — set when status === 'failed'. */
  error?: string;
  /** Originating device ID — used to route status events back to the device. */
  deviceId?: string;
}
