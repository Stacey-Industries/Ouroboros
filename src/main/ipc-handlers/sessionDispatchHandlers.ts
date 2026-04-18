/**
 * sessionDispatchHandlers.ts — Wave 34 Phase B IPC handlers.
 *
 * Exposes three channels:
 *   sessions:dispatchTask    — validate + enqueue a DispatchJob
 *   sessions:listDispatchJobs — snapshot of current queue
 *   sessions:cancelDispatchJob — cancel queued or active job
 */

import { ipcMain } from 'electron';
import path from 'path';

import { getConfigValue } from '../config';
import log from '../logger';
import type { DispatchRequest } from '../session/sessionDispatch';
import { cancelJob, enqueue, listJobs } from '../session/sessionDispatchQueue';
import { getWindowProjectRoots } from '../windowManager';

// ── Types ─────────────────────────────────────────────────────────────────────

type DispatchResult =
  | { success: true; jobId: string }
  | { success: false; error: 'duplicate'; existingJobId: string }
  | { success: false; error: string };

type ListResult =
  | { success: true; jobs: ReturnType<typeof listJobs> }
  | { success: false; error: string };

type CancelResult = { success: boolean; reason?: string };

// ── Path validation ───────────────────────────────────────────────────────────

function getAllConfiguredRoots(winId: number | undefined): string[] {
  const roots: string[] = [];

  if (winId !== undefined) {
    for (const r of getWindowProjectRoots(winId)) {
      if (r) roots.push(path.resolve(r));
    }
  }

  const multiRoots = getConfigValue('multiRoots');
  if (Array.isArray(multiRoots)) {
    for (const r of multiRoots) {
      if (typeof r === 'string' && r) roots.push(path.resolve(r));
    }
  }

  const defaultRoot = getConfigValue('defaultProjectRoot');
  if (defaultRoot) roots.push(path.resolve(defaultRoot));

  return roots;
}

function normalise(p: string): string {
  return process.platform === 'win32' ? p.toLowerCase() : p;
}

/**
 * Returns true if requestedPath is exactly equal to or a subdirectory of
 * one of the configured project roots. Uses path.resolve + path.relative —
 * no filesystem access (avoids security/detect-non-literal-fs-filename).
 *
 * NEVER logs the attempted path.
 */
export function validateProjectPath(requestedPath: string, winId?: number): boolean {
  const roots = getAllConfiguredRoots(winId);
  if (roots.length === 0) return false;

  const resolved = path.resolve(requestedPath);
  const normResolved = normalise(resolved);

  for (const root of roots) {
    const normRoot = normalise(root);
    if (normResolved === normRoot) return true;

    const rel = path.relative(root, resolved);
    const normRel = normalise(rel);
    if (!normRel.startsWith('..') && !path.isAbsolute(rel)) return true;
  }

  return false;
}

// ── Request validation ────────────────────────────────────────────────────────

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function validateRequest(req: unknown): req is DispatchRequest {
  if (!req || typeof req !== 'object') return false;
  const r = req as Record<string, unknown>;
  return isNonEmptyString(r['title'])
    && isNonEmptyString(r['prompt'])
    && isNonEmptyString(r['projectPath']);
}

// ── Handler implementations ───────────────────────────────────────────────────

function resolveWindowId(event: Electron.IpcMainInvokeEvent): number | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- runtime-only API
  return (event.sender as any).getOwnerBrowserWindow?.()?.id as number | undefined;
}

function findDuplicateJob(clientRequestId: string): string | null {
  const jobs = listJobs();
  const match = jobs.find((j) => j.request.clientRequestId === clientRequestId);
  return match?.id ?? null;
}

async function handleDispatchTask(
  event: Electron.IpcMainInvokeEvent,
  request: unknown,
  deviceId?: string,
): Promise<DispatchResult> {
  if (!validateRequest(request)) {
    return { success: false, error: 'invalid-request' };
  }

  if (request.clientRequestId) {
    const existingJobId = findDuplicateJob(request.clientRequestId);
    if (existingJobId) {
      log.info('[dispatch] duplicate clientRequestId, returning existing job', existingJobId);
      return { success: false, error: 'duplicate', existingJobId };
    }
  }

  const winId = resolveWindowId(event);
  if (!validateProjectPath(request.projectPath, winId)) {
    log.warn('[dispatch] dispatchTask rejected: projectPath not in allowed roots');
    return { success: false, error: 'project-path-not-allowed' };
  }

  try {
    const job = enqueue(request, deviceId);
    return { success: true, jobId: job.id };
  } catch (err) {
    log.error('[dispatch] enqueue error:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function handleListDispatchJobs(): Promise<ListResult> {
  try {
    return { success: true, jobs: listJobs() };
  } catch (err) {
    log.error('[dispatch] listJobs error:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function handleCancelDispatchJob(
  _event: Electron.IpcMainInvokeEvent,
  jobId: string,
): Promise<CancelResult> {
  if (!isNonEmptyString(jobId)) {
    return { success: false, reason: 'invalid-job-id' };
  }

  try {
    const result = cancelJob(jobId);
    return result.ok
      ? { success: true }
      : { success: false, reason: result.reason };
  } catch (err) {
    log.error('[dispatch] cancelJob error:', err);
    return { success: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

// ── Registration ──────────────────────────────────────────────────────────────

let registeredChannels: string[] = [];

/** Registers the three sessions:dispatch* IPC handlers. */
export function registerDispatchHandlers(): string[] {
  const channels: string[] = [];

  ipcMain.removeHandler('sessions:dispatchTask');
  ipcMain.handle('sessions:dispatchTask', handleDispatchTask);
  channels.push('sessions:dispatchTask');

  ipcMain.removeHandler('sessions:listDispatchJobs');
  ipcMain.handle('sessions:listDispatchJobs', handleListDispatchJobs);
  channels.push('sessions:listDispatchJobs');

  ipcMain.removeHandler('sessions:cancelDispatchJob');
  ipcMain.handle('sessions:cancelDispatchJob', handleCancelDispatchJob);
  channels.push('sessions:cancelDispatchJob');

  registeredChannels = channels;
  return channels;
}

/** Removes all handlers registered by registerDispatchHandlers. */
export function cleanupDispatchHandlers(): void {
  for (const ch of registeredChannels) {
    ipcMain.removeHandler(ch);
  }
  registeredChannels = [];
}
