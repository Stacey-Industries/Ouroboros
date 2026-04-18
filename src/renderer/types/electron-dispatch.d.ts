/**
 * electron-dispatch.d.ts — IPC type contract for session persistence and
 * cross-device session dispatch.
 *
 * Wave 34 Phase B. Dispatch types are duplicated from
 * src/main/session/sessionDispatch.ts because renderer types cannot import
 * from src/main at runtime. Same approach used by electron-mobile-access.d.ts.
 *
 * SessionsAPI is defined here (rather than electron-observability.d.ts) because
 * it now depends on the dispatch result types; co-locating avoids a circular
 * import chain between the two d.ts files.
 */

import type { IpcResult } from './electron-foundation';

// ── Session persistence result types ─────────────────────────────────────────

export interface SaveSessionResult extends IpcResult {
  filePath?: string;
}

export interface LoadSessionsResult extends IpcResult {
  sessions?: unknown[];
}

export interface ExportSessionResult extends IpcResult {
  filePath?: string;
  cancelled?: boolean;
}

// ── Dispatch data model ───────────────────────────────────────────────────────

export type DispatchJobStatus =
  | 'queued'
  | 'starting'
  | 'running'
  | 'completed'
  | 'failed'
  | 'canceled';

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

// ── Dispatch result types ─────────────────────────────────────────────────────

export type DispatchTaskResult =
  | { success: true; jobId: string }
  | { success: false; error: string };

export type ListDispatchJobsResult =
  | { success: true; jobs: DispatchJob[] }
  | { success: false; error: string };

export type CancelDispatchJobResult =
  | { success: true }
  | { success: false; reason?: string };

// ── SessionsAPI ───────────────────────────────────────────────────────────────

export interface SessionsAPI {
  save: (session: unknown) => Promise<SaveSessionResult>;
  load: () => Promise<LoadSessionsResult>;
  delete: (sessionId: string) => Promise<IpcResult>;
  export: (session: unknown, format: 'json' | 'markdown') => Promise<ExportSessionResult>;
  /** Wave 34 Phase B — cross-device session dispatch. */
  dispatchTask: (
    request: DispatchRequest,
    deviceId?: string,
  ) => Promise<DispatchTaskResult>;
  listDispatchJobs: () => Promise<ListDispatchJobsResult>;
  cancelDispatchJob: (jobId: string) => Promise<CancelDispatchJobResult>;
}
