/**
 * ipc-handlers/checkpoint.ts — IPC handlers for session checkpoint management.
 *
 * Delegates to CheckpointStore for persistence and to the existing git helpers
 * for commit operations on the dedicated refs/ouroboros/checkpoints/<threadId> ref.
 *
 * Channels: checkpoint:list, checkpoint:create, checkpoint:restore, checkpoint:delete
 *
 * Pure store helpers live in checkpointHelpers.ts (no Electron imports there).
 */

import type {
  CheckpointListRequest,
  CheckpointRestoreRequest,
} from '@shared/types/sessionCheckpoint';
import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent } from 'electron';
import path from 'path';

import type {
  CheckpointCreateRequest,
  CheckpointCreateResult,
} from '../../renderer/types/electron-checkpoint';
import {
  captureHeadHash,
  createCheckpointCommit,
} from '../agentChat/chatOrchestrationBridgeGit';
import { CheckpointStore } from '../agentChat/checkpointStore';
import log from '../logger';
import { openDatabase } from '../storage/database';
import {
  checkpointCreateRecord,
  checkpointDeleteRecord,
  checkpointListRecords,
} from './checkpointHelpers';
import { gitRestoreSnapshot } from './gitOperationsExtended';
import { assertPathAllowed } from './pathSecurity';

// ── Singleton store ──────────────────────────────────────────────────────

let _store: CheckpointStore | null = null;

function getStore(): CheckpointStore {
  if (!_store) {
    const threadsDir = path.join(app.getPath('userData'), 'agent-chat', 'threads');
    const db = openDatabase(path.join(threadsDir, 'checkpoints.db'));
    _store = new CheckpointStore(db);
  }
  return _store;
}

// ── Change notification helper ────────────────────────────────────────────

function notifyChange(threadId: string): void {
  try {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('checkpoint:change', threadId);
    });
  } catch {
    // Renderer may not be ready — ignore
  }
}

// ── IPC handler implementations ───────────────────────────────────────────

async function handleList(
  event: IpcMainInvokeEvent,
  request: CheckpointListRequest,
): Promise<{ success: boolean; checkpoints?: ReturnType<CheckpointStore['list']>; error?: string }> {
  const denied = assertPathAllowed(event, request.projectRoot);
  if (denied) return denied;
  return checkpointListRecords(getStore(), request.threadId);
}

async function handleCreate(
  event: IpcMainInvokeEvent,
  request: CheckpointCreateRequest,
): Promise<CheckpointCreateResult> {
  const denied = assertPathAllowed(event, request.projectRoot);
  if (denied) return denied;

  const commitHash = await captureHeadHash(request.projectRoot);
  if (!commitHash) {
    return { success: false, error: 'Not a git repository or no commits.' };
  }
  const checkpointHash = await createCheckpointCommit(
    request.projectRoot,
    request.threadId,
    commitHash,
  );
  return checkpointCreateRecord(getStore(), {
    threadId: request.threadId,
    messageId: request.messageId,
    commitHash: checkpointHash ?? commitHash,
    filesChanged: [],
    label: request.label,
  });
}

async function handleRestore(
  event: IpcMainInvokeEvent,
  request: CheckpointRestoreRequest,
): Promise<{ success: boolean; restoredCommitHash?: string; error?: string }> {
  const denied = assertPathAllowed(event, request.projectRoot);
  if (denied) return denied;

  const checkpoint = getStore().get(request.checkpointId);
  if (!checkpoint) {
    return { success: false, error: 'Checkpoint not found.' };
  }
  const result = await gitRestoreSnapshot(request.projectRoot, checkpoint.commitHash);
  if (!result.success) return result;
  notifyChange(checkpoint.threadId);
  return { success: true, restoredCommitHash: checkpoint.commitHash };
}

function handleDelete(
  _event: IpcMainInvokeEvent,
  checkpointId: string,
): { success: boolean; error?: string } {
  return checkpointDeleteRecord(getStore(), checkpointId);
}

// ── Registration ──────────────────────────────────────────────────────────

export function registerCheckpointHandlers(): string[] {
  const channels: string[] = [];

  ipcMain.handle('checkpoint:list', async (event, request: CheckpointListRequest) => {
    try {
      return await handleList(event, request);
    } catch (err) {
      log.error('[checkpoint:list]', err);
      return { success: false, error: String(err) };
    }
  });
  channels.push('checkpoint:list');

  ipcMain.handle('checkpoint:create', async (event, request: CheckpointCreateRequest) => {
    try {
      return await handleCreate(event, request);
    } catch (err) {
      log.error('[checkpoint:create]', err);
      return { success: false, error: String(err) };
    }
  });
  channels.push('checkpoint:create');

  ipcMain.handle('checkpoint:restore', async (event, request: CheckpointRestoreRequest) => {
    try {
      return await handleRestore(event, request);
    } catch (err) {
      log.error('[checkpoint:restore]', err);
      return { success: false, error: String(err) };
    }
  });
  channels.push('checkpoint:restore');

  ipcMain.handle('checkpoint:delete', (event, checkpointId: string) => {
    try {
      return handleDelete(event, checkpointId);
    } catch (err) {
      log.error('[checkpoint:delete]', err);
      return { success: false, error: String(err) };
    }
  });
  channels.push('checkpoint:delete');

  return channels;
}
