/**
 * sessionDispatchNotifier.ts — Wave 34 Phase F.
 *
 * Called by the dispatch runner on terminal job transitions (completed/failed).
 * Two delivery paths:
 *   1. FCM push (when device has a pushToken AND fcmServiceAccountPath is set).
 *   2. In-app banner via `sessionDispatch:notification` IPC event (fallback).
 */

import { BrowserWindow } from 'electron';

import { getConfigValue } from '../config';
import log from '../logger';
import { listDevices } from '../mobileAccess/tokenStore';
import { sendFcmNotification } from './fcmAdapter';
import type { DispatchJob } from './sessionDispatch';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DispatchNotificationPayload {
  jobId: string;
  title: string;
  body: string;
  status: 'completed' | 'failed';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isTerminal(job: DispatchJob): job is DispatchJob & { status: 'completed' | 'failed' } {
  return job.status === 'completed' || job.status === 'failed';
}

function buildPayload(job: DispatchJob): DispatchNotificationPayload {
  const label = job.request.title || job.id;
  const status = job.status as 'completed' | 'failed';
  const title = status === 'completed' ? 'Job completed' : 'Job failed';
  const body = status === 'completed'
    ? `"${label}" finished successfully.`
    : `"${label}" failed: ${job.error ?? 'unknown error'}`;
  return { jobId: job.id, title, body, status };
}

function broadcastInAppBanner(payload: DispatchNotificationPayload): void {
  const wins = BrowserWindow.getAllWindows();
  for (const win of wins) {
    if (!win.isDestroyed()) {
      win.webContents.send('sessionDispatch:notification', payload);
    }
  }
  log.info('[dispatchNotifier] in-app banner sent for job', payload.jobId);
}

function getFcmServiceAccountPath(): string | undefined {
  // Future: read from config.sessionDispatch.fcmServiceAccountPath
  // Not yet in the config schema — stub returns undefined until wired.
  const cfg = getConfigValue('sessionDispatch') as (Record<string, unknown> | undefined);
  const p = cfg?.['fcmServiceAccountPath'];
  return typeof p === 'string' && p.length > 0 ? p : undefined;
}

async function tryFcmPush(
  pushToken: string,
  payload: DispatchNotificationPayload,
  serviceAccountPath: string,
): Promise<boolean> {
  try {
    const result = await sendFcmNotification(serviceAccountPath, pushToken, {
      title: payload.title,
      body: payload.body,
      data: { jobId: payload.jobId, status: payload.status },
    });
    if (result.sent) {
      log.info('[dispatchNotifier] FCM push sent for job', payload.jobId);
      return true;
    }
    log.info('[dispatchNotifier] FCM stub/unavailable, falling back to banner', result.reason);
    return false;
  } catch (err) {
    log.warn('[dispatchNotifier] FCM push error, falling back to banner:', err);
    return false;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Notifies the originating device that a job reached a terminal state.
 *
 * Only fires on `completed` or `failed`. All other status values are silently
 * ignored. If the job has no deviceId or the device is not found, bails silently.
 */
export async function notifyJobTransition(job: DispatchJob): Promise<void> {
  if (!isTerminal(job)) return;

  const payload = buildPayload(job);

  if (!job.deviceId) {
    broadcastInAppBanner(payload);
    return;
  }

  const devices = listDevices();
  const device = devices.find((d) => d.id === job.deviceId);
  if (!device) {
    log.info('[dispatchNotifier] device not found for job', job.id, '— skipping');
    return;
  }

  const pushToken = device.pushToken;
  const serviceAccountPath = getFcmServiceAccountPath();

  if (pushToken && serviceAccountPath) {
    const sent = await tryFcmPush(pushToken, payload, serviceAccountPath);
    if (sent) return;
  }

  broadcastInAppBanner(payload);
}
