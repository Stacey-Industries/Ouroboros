/**
 * mainStartup.ts — Startup helpers extracted from main.ts to satisfy max-lines.
 * Contains crash logging, auto-updater wiring, web-contents security setup,
 * and synchronous bootstrap functions for V8 snapshot safety.
 */

import { app, crashReporter } from 'electron';
import fs from 'fs/promises';
import path from 'path';

import { initConflictMonitor } from './agentConflict/conflictMonitor';
import { getCredential } from './auth/credentialStore';
import {
  GraphController,
  setGraphController,
} from './codebaseGraph/graphController';
import { getConfigValue } from './config';
import log from './logger';
import { setGithubTokenForPty } from './ptyEnv';
import { getAutoUpdater, setUpdaterGitHubToken } from './updater';
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
  updater.on('error', (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    // Suppress 404 errors — just means no releases published yet
    if (msg.includes('404') || msg.includes('HttpError')) {
      log.info('Update check: no releases found (404)');
      return;
    }
    broadcastToActiveWindows('updater:event', { type: 'error', error: msg });
  });
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

async function seedUpdaterToken(): Promise<void> {
  try {
    const cred = await getCredential('github');
    if (cred?.type === 'oauth') setUpdaterGitHubToken(cred.accessToken);
  } catch {
    // Non-fatal — updater works without token for public repos
  }
}

export function configureAutoUpdater(): void {
  if (!getAutoUpdater()) return;
  registerAutoUpdaterEvents();
  void seedUpdaterToken();
  scheduleAutoUpdateCheck();
}

// ---------------------------------------------------------------------------
// GitHub token seeding for PTY env
// ---------------------------------------------------------------------------

async function seedGithubTokenForPty(): Promise<void> {
  const cred = await getCredential('github');
  if (cred?.type === 'oauth') setGithubTokenForPty(cred.accessToken);
}

export async function seedGithubTokenWithRetry(maxAttempts = 3): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await seedGithubTokenForPty();
      return;
    } catch (err) {
      log.warn(`GitHub token seed attempt ${i + 1} failed:`, err);
      if (i < maxAttempts - 1) await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

// ---------------------------------------------------------------------------
// Codebase graph initialization
// ---------------------------------------------------------------------------

export async function initCodebaseGraph(): Promise<void> {
  const defaultRoot = getConfigValue('defaultProjectRoot') as string | undefined;
  if (!defaultRoot) {
    log.info('No default project root configured, skipping graph init');
    return;
  }

  try {
    const controller = new GraphController(defaultRoot);
    await controller.initialize();
    setGraphController(controller);
    log.info('Controller initialized successfully');
  } catch (err) {
    log.warn('Failed to start:', err);
  }

  // Initialize conflict monitor after graph (operates in file-only mode if graph is cold)
  initConflictMonitor();
  log.info('[conflictMonitor] initialized after codebase graph');
}

// ---------------------------------------------------------------------------
// Synchronous bootstrap — V8 snapshot safety
//
// These functions wrap the calls that must happen synchronously before
// app.whenReady() resolves, but were previously naked at module scope in
// main.ts. Extracting them here keeps main.ts under the 300-line ESLint
// limit and makes the snapshot-hostile boundary explicit.
// ---------------------------------------------------------------------------

export function bootstrapProcessHandlers(
  onWriteCrashLog: (source: string, details: string) => Promise<void>,
): void {
  process.on('uncaughtException', (err: Error) => {
    log.error('uncaughtException:', err);
    void onWriteCrashLog('main:uncaughtException', `${err.stack ?? err.message}`);
  });

  process.on('unhandledRejection', (reason: unknown) => {
    const msg = reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
    log.error('unhandledRejection:', msg);
    void onWriteCrashLog('main:unhandledRejection', msg);
  });

  // Graceful shutdown on POSIX signals (Docker, systemd, etc.)
  process.on('SIGTERM', () => app.quit());
  process.on('SIGINT', () => app.quit());
}

export function bootstrapCrashReporter(): void {
  crashReporter.start({
    uploadToServer: false,
    compress: true,
  });
}

export function bootstrapApp(): void {
  // Must be called before app.ready fires.
  app.setName('Ouroboros');

  // Suppress GPU errors in dev. Must precede app.ready.
  app.commandLine.appendSwitch('disable-gpu-sandbox');
  if (!app.isPackaged) {
    app.commandLine.appendSwitch('no-sandbox');
  }
}

export function ensureSingleInstance(): void {
  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    app.quit();
    process.exit(0);
  }
}
