import type {
  CheckpointListRequest,
  CheckpointRestoreRequest,
  CheckpointRestoreResult,
  SessionCheckpoint,
} from '@shared/types/sessionCheckpoint';

import type { IpcResult } from './electron-foundation';

export interface CheckpointListResult extends IpcResult {
  checkpoints?: SessionCheckpoint[];
}

export interface CheckpointCreateRequest {
  threadId: string;
  messageId: string;
  projectRoot: string;
  label?: string;
}

export interface CheckpointCreateResult extends IpcResult {
  checkpoint?: SessionCheckpoint;
}

export interface CheckpointAPI {
  list: (request: CheckpointListRequest) => Promise<CheckpointListResult>;
  create: (request: CheckpointCreateRequest) => Promise<CheckpointCreateResult>;
  restore: (request: CheckpointRestoreRequest) => Promise<CheckpointRestoreResult>;
  delete: (checkpointId: string) => Promise<IpcResult>;
  onChange: (callback: (threadId: string) => void) => () => void;
}

export type {
  CheckpointListRequest,
  CheckpointRestoreRequest,
  CheckpointRestoreResult,
  SessionCheckpoint,
};
