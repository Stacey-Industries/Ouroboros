import { app, BrowserWindow, crashReporter } from 'electron';
import path from 'path';

import { closeThreadStore } from './agentChat/threadStore';
import { migrateSecretsIfNeeded } from './auth/secretMigration';
import { startTokenRefreshManager, stopTokenRefreshManager } from './auth/tokenRefreshManager';
import { initClaudeMdGenerator } from './claudeMdGenerator';
import { startClaudeUsagePoller, stopClaudeUsagePoller } from './claudeUsagePoller';
import { getGraphController } from './codebaseGraph/graphController';
import { getConfigValue } from './config';
import { initContextLayer } from './contextLayer/contextLayerController';
import { closeCostHistoryDb } from './costHistory';
import { initExtensions } from './extensions';
import { installHooks } from './hookInstaller';
import { startHooksServer, stopHooksServer } from './hooks';
import { startIdeToolServer, stopIdeToolServer } from './ideToolServer';
import {
  injectIntoProjectSettings,
  removeFromProjectSettings,
  startInternalMcpServer,
} from './internalMcp';
import { cleanupIpcHandlers } from './ipc';
import {
  loadPersistedContextCache,
  startContextRefreshTimer,
  stopContextRefreshTimer,
  terminateContextWorker,
} from './ipc-handlers/agentChat';
import { startJankDetector, stopJankDetector } from './jankDetector';
import log from './logger';
import {
  configureAutoUpdater,
  initCodebaseGraph,
  seedGithubTokenWithRetry,
  writeCrashLog,
} from './mainStartup';
import { buildApplicationMenu } from './menu';
import { buildRepoIndexSnapshot } from './orchestration/repoIndexer';
import {
  cleanupPerfSubscriber,
  clearPerfSubscribers,
  initializePerfMetrics,
  startPerfMetrics as startManagedPerfMetrics,
  stopPerfMetrics as stopManagedPerfMetrics,
} from './perfMetrics';
import { generatePipeTokens } from './pipeAuth';
import { killAllPtySessions } from './pty';
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
import { isWorkspaceTrusted } from './workspaceTrust';

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
let internalMcpStop: (() => Promise<void>) | null = null;

function notifyStartupFailure(name: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  for (const win of getAllActiveWindows()) {
    if (!win.isDestroyed()) win.webContents.send('app:startupWarning', { name, message });
  }
}

async function runStartupStep(
  errorMessage: string,
  step: () => Promise<unknown> | unknown,
  critical = false,
): Promise<void> {
  try {
    await step();
  } catch (err) {
    log.error(errorMessage, err);
    if (critical) notifyStartupFailure(errorMessage, err);
  }
}

async function startIdeTools(): Promise<void> {
  const toolAddr = await startIdeToolServer();
  if (toolAddr) log.info(`IDE tool server started at ${toolAddr.address}`);
}

async function startInternalMcp(): Promise<void> {
  if (!getConfigValue('internalMcpEnabled')) return;
  const workspaceRoot = getConfigValue('defaultProjectRoot') as string | undefined;
  if (!workspaceRoot) {
    log.info('[internal-mcp] no default project root — skipping startup');
    return;
  }
  const handle = await startInternalMcpServer({ workspaceRoot, port: 0 });
  internalMcpStop = handle.stop;
  log.info(`[internal-mcp] started on port ${handle.port}`);
  await injectIntoProjectSettings(workspaceRoot, handle.port);
  log.info('[internal-mcp] injected into .claude/settings.json');
}

async function stopInternalMcp(): Promise<void> {
  const workspaceRoot = getConfigValue('defaultProjectRoot') as string | undefined;
  if (workspaceRoot) {
    try {
      await removeFromProjectSettings(workspaceRoot);
    } catch (err) {
      log.warn('[internal-mcp] failed to remove from settings:', err);
    }
  }
  if (internalMcpStop) {
    await internalMcpStop();
    internalMcpStop = null;
  }
}

async function startBackgroundServices(win: BrowserWindow): Promise<void> {
  await runStartupStep(
    '[main] failed to start hooks server:',
    async () => startHooksServer(win),
    true,
  );
  await runStartupStep('[main] failed to start IDE tool server:', startIdeTools);
  await runStartupStep('[main] failed to start internal MCP server:', startInternalMcp);
  const root = getConfigValue('defaultProjectRoot') as string | undefined;
  if (!root || isWorkspaceTrusted(root)) {
    await runStartupStep('[main] hook installer error:', installHooks);
    await runStartupStep('[main] extensions init error:', initExtensions);
  } else {
    log.info('[main] Restricted mode — hooks/extensions disabled for untrusted workspace');
  }
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
  await migrateSecretsIfNeeded();
  generatePipeTokens();
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
  startManagedPerfMetrics();
  startJankDetector();
  startTokenRefreshManager();
  registerWindowLifecycleHandlers();
  void seedGithubTokenWithRetry();
  startContextLayerAsync(defaultRoot);
  startWebServerAsync();
  loadRetrainedWeightsIfAvailable();
  observeDatasetGrowth();
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
  stopManagedPerfMetrics();
  await stopWebServer();
  await stopHooksServer();
  await stopIdeToolServer();
  await stopInternalMcp();
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
  await stopClaudeUsagePoller();
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
    const isFile = parsedUrl.protocol === 'file:';

    if (isFile) return;

    if (!isDev) {
      event.preventDefault();
      return;
    }

    // In dev, only allow navigation to the Vite dev server origin.
    const devServerUrl = process.env['ELECTRON_RENDERER_URL'] ?? 'http://localhost:5173';
    const devOrigin = new URL(devServerUrl).origin;
    if (parsedUrl.origin !== devOrigin) {
      event.preventDefault();
    }
  });
});
