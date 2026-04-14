import type {
  BackgroundJob,
  BackgroundJobQueueSnapshot,
  BackgroundJobRequest,
  BackgroundJobUpdate,
} from '@shared/types/backgroundJob';

import type { IpcResult } from './electron-foundation';

export interface BackgroundJobsEnqueueResult extends IpcResult {
  jobId?: string;
}

export interface BackgroundJobsListResult extends IpcResult {
  snapshot?: BackgroundJobQueueSnapshot;
}

export interface BackgroundJobsAPI {
  enqueue: (request: BackgroundJobRequest) => Promise<BackgroundJobsEnqueueResult>;
  cancel: (jobId: string) => Promise<IpcResult>;
  list: (projectRoot?: string) => Promise<BackgroundJobsListResult>;
  clearCompleted: () => Promise<IpcResult>;
  onUpdate: (callback: (update: BackgroundJobUpdate) => void) => () => void;
}

export type { BackgroundJob, BackgroundJobQueueSnapshot, BackgroundJobRequest, BackgroundJobUpdate };
