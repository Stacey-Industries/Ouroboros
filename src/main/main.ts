import { app, BrowserWindow, crashReporter } from 'electron';
import path from 'path';

import { closeThreadStore } from './agentChat/threadStore';
import { getCredential } from './auth/credentialStore';
import { startTokenRefreshManager, stopTokenRefreshManager } from './auth/tokenRefreshManager';
import { initClaudeMdGenerator } from './claudeMdGenerator';
import { startClaudeUsagePoller, stopClaudeUsagePoller } from './claudeUsagePoller';
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
import {
  loadPersistedContextCache,
  startContextRefreshTimer,
  stopContextRefreshTimer,
  terminateContextWorker,
} from './ipc-handlers/agentChat';
import { startJankDetector, stopJankDetector } from './jankDetector';
import log from './logger';
import { configureAutoUpdater, writeCrashLog } from './mainStartup';
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
import { setGithubTokenForPty } from './ptyEnv';
import { clearQualityTimers } from './router/qualitySignalCollector';
import {
  loadRetrainedWeightsIfAvailable,
  observeDatasetGrowth,
  stopObserving as stopRetrainObserver,
} from './router/retrainTrigger';
import { runAllMigrations } from './storage/migrate';
import { startWebServer, stopWebServer } from './web';
import { installHandlerCapture } from './web/handlerRegistry';
import { getOrCreateWebToken } from './web/webAuth';
import { createWindow, getAllActiveWindows, restoreWindowSessions } from './windowManager';

// Configure crash reporter to collect local crash dumps.
// Remote reporting (e.g., Sentry) should be added before v1.0 GA.
crashReporter.start({
  uploadToServer: false,
  compress: true,
});

// Capture uncaught main-process exceptions
process.on('uncaughtException', (err: Error) => {
  log.error('uncaughtException:', err);
  void writeCrashLog('main:uncaughtException', `${err.stack ?? err.message}`);
});

process.on('unhandledRejection', (reason: unknown) => {
  const msg = reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
  log.error('unhandledRejection:', msg);
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
    log.error(errorMessage, err);
  }
}

async function startIdeTools(): Promise<void> {
  const toolAddr = await startIdeToolServer();
  if (toolAddr) log.info(`IDE tool server started at ${toolAddr.address}`);
}

async function startBackgroundServices(win: BrowserWindow): Promise<void> {
  await runStartupStep('[main] failed to start hooks server:', async () => startHooksServer(win));
  await runStartupStep('[main] failed to start IDE tool server:', startIdeTools);
  await runStartupStep('[main] hook installer error:', installHooks);
  await runStartupStep('[main] extensions init error:', initExtensions);
  startClaudeUsagePoller();
}

function registerRenderProcessCrashLogging(): void {
  app.on('render-process-gone', (_event, _webContents, details) => {
    const msg = `Reason: ${details.reason}\nExitCode: ${details.exitCode}`;
    log.error('render-process-gone:', msg);
    void writeCrashLog('renderer:render-process-gone', msg);
  });
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

function startContextLayerAsync(defaultRoot: string | undefined): void {
  const contextLayerConfig = getConfigValue('contextLayer') ?? {
    enabled: true,
    maxModules: 50,
    maxSizeBytes: 200 * 1024,
    debounceMs: 5000,
    autoSummarize: true,
  };
  initContextLayer({
    workspaceRoot: getConfigValue('defaultProjectRoot'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    buildRepoIndex: buildRepoIndexSnapshot as any,
    config: contextLayerConfig,
  })
    .then(() => {
      log.info('Initialization complete');
    })
    .catch((error: unknown) => {
      log.warn('Initialization failed:', error);
    });
  initCodebaseGraph().catch((error) => {
    log.error('Initialization failed:', error);
  });
  if (defaultRoot) {
    loadPersistedContextCache();
    startContextRefreshTimer([defaultRoot]);
  }
}

function startWebServerAsync(): void {
  const webPort = (getConfigValue('webAccessPort') as number | undefined) ?? 7890;
  const outMainDir = __dirname.endsWith('chunks') ? path.dirname(__dirname) : __dirname;
  const webStaticDir = path.join(outMainDir, '../web');
  startWebServer({ port: webPort, staticDir: webStaticDir })
    .then(() => {
      getOrCreateWebToken(); // Ensure token is generated; retrieve via Settings > General > Web Access
      log.info(`Access URL: http://localhost:${webPort}`);
    })
    .catch((error) => {
      log.error('Failed to start web server:', error);
    });
}

async function initializeApplication(): Promise<void> {
  const defaultRoot = getConfigValue('defaultProjectRoot') as string | undefined;
  runAllMigrations(defaultRoot);
  installHandlerCapture();

  initializePerfMetrics({ getActiveWindows: getAllActiveWindows });
  const restored = restoreWindowSessions();
  mainWindow = restored[0] ?? createWindow();
  buildApplicationMenu(mainWindow);
  await startBackgroundServices(mainWindow);

  try {
    initClaudeMdGenerator();
    log.info('Generator initialized');
  } catch (err) {
    log.warn('Generator initialization failed:', err);
  }

  registerRenderProcessCrashLogging();
  configureAutoUpdater();
  startPerfMetrics();
  startJankDetector();
  startTokenRefreshManager();
  registerWindowLifecycleHandlers();
  void seedGithubTokenForPty();
  startContextLayerAsync(defaultRoot);
  startWebServerAsync();
  loadRetrainedWeightsIfAvailable();
  observeDatasetGrowth();
}

async function seedGithubTokenForPty(): Promise<void> {
  try {
    const cred = await getCredential('github');
    if (cred?.type === 'oauth') setGithubTokenForPty(cred.accessToken);
  } catch (err) {
    log.warn('Failed to seed GitHub token for PTY:', err);
  }
}

async function initCodebaseGraph(): Promise<void> {
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
    // Non-fatal -- app continues without graph
  }
}

app.setName('Ouroboros');
app.whenReady().then(initializeApplication);

// Graceful shutdown on POSIX signals (Docker, systemd, etc.)
process.on('SIGTERM', () => app.quit());
process.on('SIGINT', () => app.quit());

app.on('window-all-closed', async () => {
  stopJankDetector();
  stopTokenRefreshManager();
  stopContextRefreshTimer();
  terminateContextWorker();
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
  stopRetrainObserver();
  clearQualityTimers();
  stopClaudeUsagePoller();
  cleanupIpcHandlers();
  closeCostHistoryDb();
  closeThreadStore();
  try {
    await getGraphController()?.dispose();
  } catch (err) {
    log.warn('Dispose error during shutdown:', err);
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
