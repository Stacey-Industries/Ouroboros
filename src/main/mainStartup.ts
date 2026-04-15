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
import {
  initCompatRegistry,
  acquireGraphController as acquireCompatController,
} from './codebaseGraph/graphControllerCompatRegistry';
import { setSystem2Db } from './codebaseGraph/graphControllerSupport';
import { pruneExpiredProjects } from './codebaseGraph/graphGc';
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
// Codebase graph initialization — System 2
// ---------------------------------------------------------------------------

type IndexReason = 'first-launch' | 'hash-mismatch' | 'post-gc'

interface System2IndexProgressEvent {
  kind: 'start' | 'progress' | 'complete' | 'error'
  projectName: string
  projectRoot?: string
  reason?: IndexReason
  phase?: string
  filesProcessed?: number
  filesTotal?: number
  elapsedMs?: number
  filesIndexed?: number
  nodesCreated?: number
  durationMs?: number
  message?: string
}

function sendIndexProgress(event: System2IndexProgressEvent): void {
  broadcastToActiveWindows('system2:indexProgress', event)
}

interface InitialIndexArgs {
  workerClient: import('./codebaseGraph/indexingWorkerClient').IndexingWorkerClient
  db: import('./codebaseGraph/graphDatabase').GraphDatabase
  projectRoot: string
  projectName: string
  reason: IndexReason
}

async function runInitialIndex(args: InitialIndexArgs): Promise<void> {
  const { workerClient, db, projectRoot, projectName, reason } = args
  sendIndexProgress({ kind: 'start', projectName, projectRoot, reason })
  const result = await workerClient.runIndex({
    projectRoot,
    projectName,
    incremental: false,
    onProgress: (p) => {
      sendIndexProgress({
        kind: 'progress', projectName,
        phase: p.phase, filesProcessed: p.filesProcessed,
        filesTotal: p.filesTotal, elapsedMs: p.elapsedMs,
      })
    },
  })
  if (result.success) {
    db.writeCatalogHash(projectName)
    sendIndexProgress({
      kind: 'complete', projectName,
      filesIndexed: result.filesIndexed, nodesCreated: result.nodesCreated,
      durationMs: result.durationMs,
    })
    log.info(`[system2] initial index complete: ${result.filesIndexed} files, ${result.nodesCreated} nodes`)
  } else {
    const message = result.errors.join('; ')
    sendIndexProgress({ kind: 'error', projectName, message })
    log.warn('[system2] initial index failed:', message)
  }
}

function resolveIndexReason(
  db: import('./codebaseGraph/graphDatabase').GraphDatabase,
  projectName: string,
  gcPrunedNames: string[],
): IndexReason | null {
  if (gcPrunedNames.includes(projectName)) return 'post-gc'
  const hashOk = db.verifyCatalogHash(projectName)
  if (!hashOk) {
    log.info('[system2] catalog hash mismatch, triggering full rebuild')
    return 'hash-mismatch'
  }
  if (db.getNodeCount(projectName) === 0) return 'first-launch'
  return null
}

async function initCodebaseGraphSystem2(projectRoot: string): Promise<void> {
  const { GraphDatabase } = await import('./codebaseGraph/graphDatabase');
  const { IndexingPipeline } = await import('./codebaseGraph/indexingPipeline');
  const { TreeSitterParser } = await import('./codebaseGraph/treeSitterParser');
  const { QueryEngine } = await import('./codebaseGraph/queryEngine');
  const { CypherEngine } = await import('./codebaseGraph/cypherEngine');
  const { IndexingWorkerClient } = await import('./codebaseGraph/indexingWorkerClient');

  const db = new GraphDatabase();
  setSystem2Db(db);

  const workerClient = new IndexingWorkerClient();
  initCompatRegistry({
    db,
    buildQueryEngine: (name, root) => new QueryEngine(db, name, root),
    buildCypherEngine: (name) => new CypherEngine(db, name),
    workerClient,
  });

  const projectName = path.basename(projectRoot);
  const gcConfig = getConfigValue('codebaseGraph');
  let gcPrunedNames: string[] = []
  if (gcConfig?.gcEnabled) {
    const report = pruneExpiredProjects(db, gcConfig.gcDaysThreshold);
    if (report.prunedCount > 0) {
      log.info(`[system2] GC pruned ${report.prunedCount} stale project(s): ${report.prunedProjects.join(', ')}`);
      gcPrunedNames = report.prunedProjects
    }
  }

  const reason = resolveIndexReason(db, projectName, gcPrunedNames)
  if (reason !== null) {
    runInitialIndex({ workerClient, db, projectRoot, projectName, reason }).catch((err: Error) => {
      log.error('[system2] initial index failed:', err)
    })
  }

  const parser = new TreeSitterParser();
  await parser.init();
  const pipeline = new IndexingPipeline(db, parser);
  const compat = await acquireCompatController(projectRoot, pipeline);
  setGraphController(compat);
  db.touchProjectOpened(projectName);
  log.info(`[system2] controller initialized for ${projectName}`);
}

/**
 * Dispose the active graph controller on app shutdown.
 *
 * When System 2 is enabled, calls disposeAllCompat() so the compat registry
 * cleans up its watcher and System 2 resources.
 * When System 1 is active, falls through to the standard dispose().
 */
export async function disposeCodebaseGraph(): Promise<void> {
  const s2Config = getConfigValue('system2');
  if (s2Config?.enabled) {
    const { disposeAllCompat } = await import('./codebaseGraph/graphControllerCompatRegistry');
    await disposeAllCompat();
    return;
  }
  const { getGraphController } = await import('./codebaseGraph/graphController');
  await getGraphController()?.dispose();
}

export async function initCodebaseGraph(): Promise<void> {
  const defaultRoot = getConfigValue('defaultProjectRoot') as string | undefined;
  if (!defaultRoot) {
    log.info('No default project root configured, skipping graph init');
    return;
  }

  const s2Config = getConfigValue('system2');
  const useSystem2 = s2Config?.enabled === true;

  try {
    if (useSystem2) {
      await initCodebaseGraphSystem2(defaultRoot);
    } else {
      const controller = new GraphController(defaultRoot);
      await controller.initialize();
      setGraphController(controller);
      log.info('Controller initialized successfully');
    }
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
