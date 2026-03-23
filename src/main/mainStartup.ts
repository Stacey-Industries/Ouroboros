/**
 * mainStartup.ts — Startup helpers extracted from main.ts to satisfy max-lines.
 * Contains crash logging, auto-updater wiring, and web-contents security setup.
 */

import { app } from 'electron';
import fs from 'fs/promises';
import path from 'path';

import log from './logger';
import { getAutoUpdater } from './updater';
import { broadcastToWebClients } from './web';
import { getAllActiveWindows } from './windowManager';

// ---------------------------------------------------------------------------
// Crash logging
// ---------------------------------------------------------------------------

async function getCrashLogDir(): Promise<string> {
  const dir = path.join(app.getPath('userData'), 'crashes');
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function writeCrashLog(source: string, details: string): Promise<void> {
  try {
    const dir = await getCrashLogDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(dir, `crash-${timestamp}.log`);
    const content = [
      `Source: ${source}`,
      `Timestamp: ${new Date().toISOString()}`,
      `App version: ${app.getVersion()}`,
      `Platform: ${process.platform} ${process.arch}`,
      '',
      details,
    ].join('\n');
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await fs.writeFile(file, content, 'utf-8');
    log.error(`Logged to ${file}`);
  } catch (err) {
    log.error('Failed to write crash log:', err);
  }
}

// ---------------------------------------------------------------------------
// Window broadcasting
// ---------------------------------------------------------------------------

export function broadcastToActiveWindows(channel: string, payload: unknown): void {
  for (const win of getAllActiveWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }
  broadcastToWebClients(channel, payload);
}

// ---------------------------------------------------------------------------
// Auto-updater
// ---------------------------------------------------------------------------

function registerAutoUpdaterEvents(): void {
  const updater = getAutoUpdater();
  if (!updater) return;
  updater.on('checking-for-update', () =>
    broadcastToActiveWindows('updater:event', { type: 'checking-for-update' }),
  );
  updater.on('update-available', (info: unknown) =>
    broadcastToActiveWindows('updater:event', { type: 'update-available', info }),
  );
  updater.on('update-not-available', (info: unknown) =>
    broadcastToActiveWindows('updater:event', { type: 'update-not-available', info }),
  );
  updater.on('download-progress', (progress: unknown) =>
    broadcastToActiveWindows('updater:event', { type: 'download-progress', progress }),
  );
  updater.on('update-downloaded', (info: unknown) =>
    broadcastToActiveWindows('updater:event', { type: 'update-downloaded', info }),
  );
  updater.on('error', (err: unknown) =>
    broadcastToActiveWindows('updater:event', {
      type: 'error',
      error: err instanceof Error ? err.message : String(err),
    }),
  );
}

function scheduleAutoUpdateCheck(): void {
  if (!app.isPackaged) return;
  const updater = getAutoUpdater();
  if (!updater) return;
  setTimeout(() => {
    updater.checkForUpdates().catch((err: Error) => {
      log.info('Auto-check failed:', err.message);
    });
  }, 5000);
}

export function configureAutoUpdater(): void {
  if (!getAutoUpdater()) return;
  registerAutoUpdaterEvents();
  scheduleAutoUpdateCheck();
}
