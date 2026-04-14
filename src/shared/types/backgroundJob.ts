/**
 * shared/types/backgroundJob.ts
 *
 * Background/async agent job types — Wave 6 (#103).
 * Describes headless Claude Code sessions queued by the main process and
 * surfaced to the renderer without a visible terminal.
 */

export type BackgroundJobStatus =
  | 'queued'
  | 'running'
  | 'done'
  | 'error'
  | 'cancelled';

export interface BackgroundJobRequest {
  projectRoot: string;
  prompt: string;
  label?: string;
  /** Optional Claude Code model tier hint — passed through to the CLI. */
  modelSlot?: 'haiku' | 'sonnet' | 'opus';
  /** Optional working directory override; defaults to projectRoot. */
  cwd?: string;
}

export interface BackgroundJob {
  id: string;
  projectRoot: string;
  prompt: string;
  label?: string;
  status: BackgroundJobStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  exitCode?: number;
  /** Claude Code session id captured from the first stream-json event. */
  sessionId?: string;
  /** Short human-readable summary extracted from final assistant turn. */
  resultSummary?: string;
  errorMessage?: string;
  /** Cost in USD if cost-tracking is available for this run. */
  costUsd?: number;
}

export interface BackgroundJobUpdate {
  jobId: string;
  changes: Partial<BackgroundJob>;
}

export interface BackgroundJobQueueSnapshot {
  jobs: BackgroundJob[];
  runningCount: number;
  queuedCount: number;
  maxConcurrent: number;
}
