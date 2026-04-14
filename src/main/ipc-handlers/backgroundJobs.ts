/**
 * ipc-handlers/backgroundJobs.ts — IPC registrar for the background job queue.
 *
 * Wraps the jobScheduler singleton and pushes updates to all known windows
 * via webContents.send('backgroundJobs:update', BackgroundJobUpdate).
 */

import type { BackgroundJobRequest, BackgroundJobUpdate } from '@shared/types/backgroundJob';
import { BrowserWindow, ipcMain } from 'electron';

import type { IpcResult } from '../../renderer/types/electron-foundation';
import { getJobScheduler, initJobScheduler } from '../backgroundJobs/jobScheduler';
import { getJobStore } from '../backgroundJobs/jobStore';
import { getConfigValue } from '../config';
import log from '../logger';
import { notify } from '../osNotification';

// ── Push update to all renderer windows ───────────────────────────────────────

function broadcastUpdate(update: BackgroundJobUpdate): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('backgroundJobs:update', update);
    }
  }
}

// ── Scheduler initialisation (called once at startup) ─────────────────────────

export function ensureSchedulerInit(): void {
  const maxConcurrent = getConfigValue('backgroundJobsMaxConcurrent') ?? 2;
  const store = getJobStore();
  store.reconcileInterrupted();

  initJobScheduler(store, {
    maxConcurrent,
    onJobComplete: (job) => {
      broadcastUpdate({ jobId: job.id, changes: job });
      const label = job.label ?? job.prompt.slice(0, 40);
      if (job.status === 'done') {
        notify({ title: 'Background job finished', body: label });
      } else if (job.status === 'error') {
        notify({ title: 'Background job failed', body: label });
      }
    },
  });

  store.subscribeChanges((jobId, changes) => { broadcastUpdate({ jobId, changes }); });
  log.info('[backgroundJobs] scheduler initialised (maxConcurrent=%d)', maxConcurrent);
}

// ── Handler implementations ────────────────────────────────────────────────────

async function handleEnqueue(request: BackgroundJobRequest): Promise<unknown> {
  try {
    return await getJobScheduler().enqueue(request);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error('[backgroundJobs:enqueue]', msg);
    return { success: false, error: msg } satisfies IpcResult;
  }
}

async function handleCancel(jobId: string): Promise<unknown> {
  try {
    return await getJobScheduler().cancel(jobId);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error('[backgroundJobs:cancel]', msg);
    return { success: false, error: msg } satisfies IpcResult;
  }
}

async function handleList(projectRoot?: string): Promise<unknown> {
  try {
    const snapshot = getJobScheduler().list(projectRoot);
    return { success: true, snapshot };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error('[backgroundJobs:list]', msg);
    return { success: false, error: msg };
  }
}

async function handleClearCompleted(): Promise<IpcResult> {
  try {
    getJobStore().deleteCompleted();
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error('[backgroundJobs:clearCompleted]', msg);
    return { success: false, error: msg };
  }
}

// ── IPC handler registration ───────────────────────────────────────────────────

export function registerBackgroundJobsHandlers(): string[] {
  ipcMain.handle('backgroundJobs:enqueue', (_e, req: BackgroundJobRequest) => handleEnqueue(req));
  ipcMain.handle('backgroundJobs:cancel', (_e, id: string) => handleCancel(id));
  ipcMain.handle('backgroundJobs:list', (_e, root?: string) => handleList(root));
  ipcMain.handle('backgroundJobs:clearCompleted', () => handleClearCompleted());
  return ['backgroundJobs:enqueue', 'backgroundJobs:cancel', 'backgroundJobs:list', 'backgroundJobs:clearCompleted'];
}
