import { app, BrowserWindow } from 'electron';
import fs from 'fs/promises';
import path from 'path';

import { closeThreadStore } from './agentChat/threadStore';
import { initClaudeMdGenerator } from './claudeMdGenerator';
import {
  getGraphController,
  GraphController,
  setGraphController,
} from './codebaseGraph/graphController';
import { getConfigValue } from './config';
import { initContextLayer } from './contextLayer/contextLayerController';
import { closeCostHistoryDb } from './costHistory';
import { initExtensions } from './extensions';
import { installHooks } from './hookInstaller';
import { startHooksServer, stopHooksServer } from './hooks';
import { startIdeToolServer, stopIdeToolServer } from './ideToolServer';
import { cleanupIpcHandlers } from './ipc';
import { buildApplicationMenu } from './menu';
import { buildRepoIndexSnapshot } from './orchestration/repoIndexer';
import {
  cleanupPerfSubscriber,
  clearPerfSubscribers,
  initializePerfMetrics,
  startPerfMetrics as startManagedPerfMetrics,
  stopPerfMetrics as stopManagedPerfMetrics,
} from './perfMetrics';
import { killAllPtySessions } from './pty';
import { runAllMigrations } from './storage/migrate';
import { broadcastToWebClients, startWebServer, stopWebServer } from './web';
import { installHandlerCapture } from './web/handlerRegistry';
import { getOrCreateWebToken } from './web/webAuth';
import { loadPersistedContextCache, startContextRefreshTimer } from './ipc-handlers/agentChat';
import { createWindow, getAllActiveWindows } from './windowManager';

// â”€â”€â”€ Auto-updater (electron-updater â€” optional dep) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let autoUpdater: any = null;
try {
  // electron-updater is an optional dependency; gracefully skip if absent
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const updaterModule = require('electron-updater');
  autoUpdater = updaterModule.autoUpdater;
} catch {
  console.log('[updater] electron-updater not installed â€” auto-update disabled');
}

// â”€â”€â”€ Crash logging â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function getCrashLogDir(): Promise<string> {
  const dir = path.join(app.getPath('userData'), 'crashes');
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function writeCrashLog(source: string, details: string): Promise<void> {
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
    console.error(`[crash] Logged to ${file}`);
  } catch (err) {
    console.error('[crash] Failed to write crash log:', err);
  }
}

// Capture uncaught main-process exceptions
process.on('uncaughtException', (err: Error) => {
  console.error('[main] uncaughtException:', err);
  void writeCrashLog('main:uncaughtException', `${err.stack ?? err.message}`);
});

process.on('unhandledRejection', (reason: unknown) => {
  const msg = reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
  console.error('[main] unhandledRejection:', msg);
  void writeCrashLog('main:unhandledRejection', msg);
});

// Suppress GPU errors in dev
app.commandLine.appendSwitch('disable-gpu-sandbox');
if (!app.isPackaged) {
  app.commandLine.appendSwitch('no-sandbox');
}

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

let mainWindow: BrowserWindow | null = null;

// â”€â”€â”€ Performance metrics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function broadcastToActiveWindows(channel: string, payload: unknown): void {
  for (const win of getAllActiveWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }
  broadcastToWebClients(channel, payload)
}

/** Broadcasts perf metrics to all open windows. */
function startPerfMetrics(): void {
  startManagedPerfMetrics();
}

function stopPerfMetrics(): void {
  stopManagedPerfMetrics();
}

async function runStartupStep(
  errorMessage: string,
  step: () => Promise<unknown> | unknown,
): Promise<void> {
  try {
    await step();
  } catch (err) {
    console.error(errorMessage, err);
  }
}

async function startIdeTools(): Promise<void> {
  const toolAddr = await startIdeToolServer();
  if (toolAddr) console.log(`[main] IDE tool server started at ${toolAddr.address}`);
}

async function startBackgroundServices(win: BrowserWindow): Promise<void> {
  await runStartupStep('[main] failed to start hooks server:', async () => startHooksServer(win));
  await runStartupStep('[main] failed to start IDE tool server:', startIdeTools);
  await runStartupStep('[main] hook installer error:', installHooks);
  await runStartupStep('[main] extensions init error:', initExtensions);
}

function registerRenderProcessCrashLogging(): void {
  app.on('render-process-gone', (_event, _webContents, details) => {
    const msg = `Reason: ${details.reason}\nExitCode: ${details.exitCode}`;
    console.error('[crash] render-process-gone:', msg);
    void writeCrashLog('renderer:render-process-gone', msg);
  });
}

function registerAutoUpdaterEvents(): void {
  autoUpdater.on('checking-for-update', () =>
    broadcastToActiveWindows('updater:event', { type: 'checking-for-update' }),
  );
  autoUpdater.on('update-available', (info: unknown) =>
    broadcastToActiveWindows('updater:event', { type: 'update-available', info }),
  );
  autoUpdater.on('update-not-available', (info: unknown) =>
    broadcastToActiveWindows('updater:event', { type: 'update-not-available', info }),
  );
  autoUpdater.on('download-progress', (progress: unknown) =>
    broadcastToActiveWindows('updater:event', { type: 'download-progress', progress }),
  );
  autoUpdater.on('update-downloaded', (info: unknown) =>
    broadcastToActiveWindows('updater:event', { type: 'update-downloaded', info }),
  );
  autoUpdater.on('error', (err: Error) =>
    broadcastToActiveWindows('updater:event', { type: 'error', error: err.message }),
  );
}

function scheduleAutoUpdateCheck(): void {
  if (!app.isPackaged) {
    return;
  }
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err: Error) => {
      console.log('[updater] Auto-check failed:', err.message);
    });
  }, 5000);
}

function configureAutoUpdater(): void {
  if (!autoUpdater) {
    return;
  }
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  registerAutoUpdaterEvents();
  scheduleAutoUpdateCheck();
}

function registerWindowLifecycleHandlers(): void {
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });

  app.on('second-instance', () => {
    const windows = getAllActiveWindows();
    if (windows.length > 0) {
      const win = windows[windows.length - 1];
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

async function initializeApplication(): Promise<void> {
  // Run JSON → SQLite data migrations before anything reads the stores
  const defaultRoot = getConfigValue('defaultProjectRoot') as string | undefined;
  runAllMigrations(defaultRoot);

  // Capture all ipcMain.handle registrations into the shared registry
  // so the WebSocket bridge can call the same handlers. Must run before
  // createWindow() which triggers registerIpcHandlers().
  installHandlerCapture();

  initializePerfMetrics({ getActiveWindows: getAllActiveWindows });
  mainWindow = createWindow();
  buildApplicationMenu(mainWindow);
  await startBackgroundServices(mainWindow);

  // Initialize CLAUDE.md generator (non-fatal)
  try {
    initClaudeMdGenerator(mainWindow);
    console.log('[claude-md] Generator initialized');
  } catch (err) {
    console.warn('[claude-md] Generator initialization failed:', err);
  }

  registerRenderProcessCrashLogging();
  configureAutoUpdater();
  startPerfMetrics();
  registerWindowLifecycleHandlers();

  const contextLayerConfig = getConfigValue('contextLayer') ?? {
    enabled: true,
    maxModules: 50,
    maxSizeBytes: 200 * 1024,
    debounceMs: 5000,
    autoSummarize: true,
  };
  console.log('[context-layer] Starting initialization with config:', contextLayerConfig);
  initContextLayer({
    workspaceRoot: getConfigValue('defaultProjectRoot'),
    buildRepoIndex: buildRepoIndexSnapshot,
    config: contextLayerConfig,
  })
    .then(() => {
      console.log('[context-layer] Initialization complete');
    })
    .catch((error: unknown) => {
      console.warn('[context-layer] Initialization failed:', error);
    });

  // Codebase graph initialization (non-fatal).
  // Indexing runs in a worker_threads Worker so the main-process event
  // loop stays responsive — no delay needed.
  initCodebaseGraph().catch((error) => {
    console.error('[codebase-graph] Initialization failed:', error);
  });

  // Start the context cache refresh timer so chat context is always warm.
  if (defaultRoot) {
    loadPersistedContextCache();
    startContextRefreshTimer([defaultRoot]);
  }

  // Web remote access server (non-fatal)
  const webPort = (getConfigValue('webAccessPort') as number | undefined) ?? 7890;
  const outMainDir = __dirname.endsWith('chunks') ? path.dirname(__dirname) : __dirname;
  const webStaticDir = path.join(outMainDir, '../web');
  startWebServer({ port: webPort, staticDir: webStaticDir }).then(() => {
    const token = getOrCreateWebToken();
    console.log(`[web] Access URL: http://localhost:${webPort}?token=${token}`);
  }).catch((error) => {
    console.error('[web] Failed to start web server:', error);
  });
}

async function initCodebaseGraph(): Promise<void> {
  const defaultRoot = getConfigValue('defaultProjectRoot') as string | undefined;
  if (!defaultRoot) {
    console.log('[codebase-graph] No default project root configured, skipping graph init');
    return;
  }

  try {
    const controller = new GraphController(defaultRoot);
    await controller.initialize();
    setGraphController(controller);
    console.log('[codebase-graph] Controller initialized successfully');
  } catch (err) {
    console.warn('[codebase-graph] Failed to start:', err);
    // Non-fatal -- app continues without graph
  }
}

app.setName('Ouroboros');
app.whenReady().then(initializeApplication);

app.on('window-all-closed', async () => {
  clearPerfSubscribers();
  stopPerfMetrics();
  await stopWebServer();
  await stopHooksServer();
  await stopIdeToolServer();
  killAllPtySessions();

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Tear down IPC handlers and dispose resources on final quit.
// Handlers are removed here (not in window-all-closed) so that in-flight
// renderer IPC calls dispatched during beforeunload can still resolve.
app.on('will-quit', async () => {
  cleanupIpcHandlers();
  closeCostHistoryDb();
  closeThreadStore();
  try {
    await getGraphController()?.dispose();
  } catch (err) {
    console.warn('[codebase-graph] Dispose error during shutdown:', err);
  }
});

// Security: prevent new windows from web content (window.open, target=_blank, etc.)
// Note: This does NOT block BrowserWindow creation from the main process (windowManager).
app.on('web-contents-created', (_event, contents) => {
  contents.on('destroyed', () => {
    cleanupPerfSubscriber(contents.id);
  });

  contents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  contents.on('will-navigate', (event, url) => {
    const parsedUrl = new URL(url);
    const isDev = process.env.NODE_ENV === 'development';
    const isLocalhost = parsedUrl.hostname === 'localhost';
    const isFile = parsedUrl.protocol === 'file:';

    if (!isDev && !isFile) {
      event.preventDefault();
    }
    if (isDev && !isLocalhost && !isFile) {
      event.preventDefault();
    }
  });
});
