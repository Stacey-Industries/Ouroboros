/**
 * checkpointHelpers.ts — Pure, Electron-free helpers for checkpoint IPC.
 *
 * Extracted from checkpoint.ts so unit tests can import them without
 * triggering Electron app initialisation.
 */

import type { CheckpointCreateResult } from '../../renderer/types/electron-checkpoint';
import { CheckpointStore, MAX_CHECKPOINTS_PER_THREAD } from '../agentChat/checkpointStore';

export interface CheckpointCreateRecordArgs {
  threadId: string;
  messageId: string;
  commitHash: string;
  filesChanged: string[];
  label?: string;
}

export function checkpointCreateRecord(
  store: CheckpointStore,
  args: CheckpointCreateRecordArgs,
): CheckpointCreateResult {
  const checkpoint = store.create(args);
  store.trimToMax(args.threadId, MAX_CHECKPOINTS_PER_THREAD);
  return { success: true, checkpoint };
}

export function checkpointListRecords(
  store: CheckpointStore,
  threadId: string,
): { success: true; checkpoints: ReturnType<CheckpointStore['list']> } {
  return { success: true, checkpoints: store.list(threadId) };
}

export function checkpointDeleteRecord(
  store: CheckpointStore,
  checkpointId: string,
): { success: boolean; error?: string } {
  const deleted = store.delete(checkpointId);
  return deleted ? { success: true } : { success: false, error: 'Checkpoint not found.' };
}
