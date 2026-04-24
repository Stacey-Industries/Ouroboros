import './bootstrap';

import { app, BrowserWindow } from 'electron';
import path from 'path';

import { migrateSecretsIfNeeded } from './auth/secretMigration';
import { startTokenRefreshManager, stopTokenRefreshManager } from './auth/tokenRefreshManager';
import { initClaudeMdGenerator } from './claudeMdGenerator';
import { startClaudeUsagePoller } from './claudeUsagePoller';
import { getConfigValue, setConfigValue } from './config';
import { initContextLayer } from './contextLayer/contextLayerController';
import { initialiseCrashReporter } from './crashReporter';
import { initExtensions } from './extensionsApi';
import { installHooks } from './hookInstaller';
import { startHooksServer, stopHooksServer } from './hooks';
import { startIdeToolServer, stopIdeToolServer } from './ideToolServer';
import { injectIntoProjectSettings, removeFromProjectSettings, startInternalMcpServer } from './internalMcp';
import { loadPersistedContextCache, startContextRefreshTimer, stopContextRefreshTimer, terminateContextWorker } from './ipc-handlers/agentChat';
import { startJankDetector, stopJankDetector } from './jankDetector';
import log from './logger';
import { performWillQuitShutdown } from './mainShutdown';
import { bootstrapApp, bootstrapCrashReporter, bootstrapProcessHandlers, configureAutoUpdater, ensureSingleInstance, initCodebaseGraph, initEditProvenance, scheduleJsonlRetentionPurge, seedGithubTokenWithRetry, writeCrashLog } from './mainStartup';
import { startMcpHost, stopMcpHost } from './mcpHost/mcpHostProxy';
import { buildApplicationMenu } from './menu';
import { initDecisionWriter } from './orchestration/contextDecisionWriter';
import { initOutcomeWriter } from './orchestration/contextOutcomeWriter';
import { killAllWarm } from './orchestration/providers/claudeWarmProcessManager';
import { buildRepoIndexSnapshot } from './orchestration/repoIndexer';
import { cleanupPerfSubscriber, clearPerfSubscribers, initializePerfMetrics, markStartup, startPerfMetrics as startManagedPerfMetrics, stopPerfMetrics as stopManagedPerfMetrics } from './perfMetrics';
import { generatePipeTokens, setTokenFilePath } from './pipeAuth';
import { dispatchPermalinkFromArgv, setupThreadProtocol } from './protocolHandler';
import { registerBuiltinProviders } from './providerBootstrap';
import { killAllPtySessions } from './pty';
import { initCorrectionWriter } from './research/correctionWriter';
import { scheduleResearchCachePurge } from './research/researchCacheScheduler';
import { initResearchOutcomeWriter } from './research/researchOutcomeWriter';
import { loadRetrainedWeightsIfAvailable, observeDatasetGrowth } from './router/retrainTrigger';
import { initSessionServices } from './session/sessionStartup';
import { runAllMigrations } from './storage/migrate';
import { getTelemetryStore, initOutcomeObserver, initTelemetryStore } from './telemetry';
import { startWebServer, stopWebServer } from './web';
import { installHandlerCapture } from './web/handlerRegistry';
import { getOrCreateWebToken } from './web/webAuth';
import { createWindow, getAllActiveWindows, restoreWindowSessions } from './windowManager';
import { isWorkspaceTrusted } from './workspaceTrust';

// ---------------------------------------------------------------------------
// Bootstrap — must run synchronously before app.whenReady() resolves.
// Functions are defined in mainStartup.ts; called here in the correct order.
// Order matters: process handlers first so errors during bootstrap are captured.
// ---------------------------------------------------------------------------

bootstrapProcessHandlers(writeCrashLog);
bootstrapCrashReporter();
bootstrapApp();
ensureSingleInstance();

// ---------------------------------------------------------------------------
// Module-level mutable state (declarations only — no side effects)
// ---------------------------------------------------------------------------

let mainWindow: BrowserWindow | null = null;
let internalMcpStop: (() => Promise<void>) | null = null;

// ---------------------------------------------------------------------------
// Startup helpers
// ---------------------------------------------------------------------------

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
  const addr = await startIdeToolServer();
  if (addr) log.info(`IDE tool server started at ${addr.address}`);
}

async function startInternalMcp(): Promise<void> {
  if (!getConfigValue('internalMcpEnabled')) return;
  const workspaceRoot = getConfigValue('defaultProjectRoot') as string | undefined;
  if (!workspaceRoot) {
    log.info('[internal-mcp] no project root — skipping');
    return;
  }
  if (getConfigValue('useMcpHost') === true) {
    const res = await startMcpHost(workspaceRoot, 0);
    if (!res.success || res.port == null) {
      log.warn('[mcp] host start failed:', res.error);
      return;
    }
    internalMcpStop = stopMcpHost;
    await injectIntoProjectSettings(workspaceRoot, res.port);
    return;
  }
  const handle = await startInternalMcpServer({ workspaceRoot, port: 0 });
  internalMcpStop = handle.stop;
  await injectIntoProjectSettings(workspaceRoot, handle.port);
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

function focusLastWindow(): void {
  const windows = getAllActiveWindows();
  if (windows.length === 0) return;
  const win = windows[windows.length - 1];
  if (win.isMinimized()) win.restore();
  win.focus();
}

function registerWindowLifecycleHandlers(): void {
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });
  app.on('second-instance', (_event, argv) => {
    focusLastWindow();
    dispatchPermalinkFromArgv(argv);
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

async function initTelemetryAndWriters(ud: string): Promise<void> {
  await runStartupStep('[main] telemetry store init', () => initTelemetryStore(ud));
  const store = getTelemetryStore();
  if (store) initOutcomeObserver(store);
  initDecisionWriter(ud);
  initOutcomeWriter(ud);
  initResearchOutcomeWriter(ud);
  initCorrectionWriter(ud);
  initEditProvenance(ud);
  scheduleJsonlRetentionPurge(ud);
  scheduleResearchCachePurge(ud);
}

async function initWindowsAndServices(defaultRoot: string | undefined): Promise<void> {
  initializePerfMetrics({ getActiveWindows: getAllActiveWindows });
  const restored = restoreWindowSessions();
  mainWindow = restored[0] ?? createWindow();
  buildApplicationMenu(mainWindow);
  await startBackgroundServices(mainWindow);
  try {
    initClaudeMdGenerator();
  } catch (err) {
    log.warn('Generator initialization failed:', err);
  }
  registerRenderProcessCrashLogging();
  initialiseCrashReporter();
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

async function initializeApplication(): Promise<void> {
  markStartup('app-ready');
  const defaultRoot = getConfigValue('defaultProjectRoot') as string | undefined;
  runAllMigrations(defaultRoot);
  const ud = app.getPath('userData');
  await initTelemetryAndWriters(ud);
  const cfg = { get: getConfigValue, set: setConfigValue };
  await runStartupStep('[main] session services', () => initSessionServices(cfg));
  registerBuiltinProviders();
  await migrateSecretsIfNeeded();
  setTokenFilePath(ud);
  generatePipeTokens();
  installHandlerCapture();
  await initWindowsAndServices(defaultRoot);
  markStartup('services-ready');
}

setupThreadProtocol();
app.whenReady().then(initializeApplication);

app.on('window-all-closed', async () => {
  stopJankDetector();
  stopTokenRefreshManager();
  stopContextRefreshTimer();
  await terminateContextWorker();
  clearPerfSubscribers();
  stopManagedPerfMetrics();
  await stopWebServer();
  await stopHooksServer();
  await stopIdeToolServer();
  await stopInternalMcp();
  killAllPtySessions();
  killAllWarm();
  if (process.platform !== 'darwin') app.quit();
});

let shutdownInProgress = false;
let shutdownComplete = false;

app.on('will-quit', (event) => {
  if (shutdownComplete) return;
  event.preventDefault();
  if (shutdownInProgress) return;
  shutdownInProgress = true;
  void performWillQuitShutdown()
    .catch((err) => log.warn('[main] will-quit shutdown error:', err))
    .finally(() => {
      shutdownComplete = true;
      app.quit();
    });
});

app.on('web-contents-created', (_event, contents) => {
  contents.on('destroyed', () => { cleanupPerfSubscriber(contents.id); });
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event, url) => {
    const parsed = new URL(url);
    if (parsed.protocol === 'file:') return;
    if (process.env.NODE_ENV !== 'development') { event.preventDefault(); return; }
    const devOrigin = new URL(process.env['ELECTRON_RENDERER_URL'] ?? 'http://localhost:5173').origin;
    if (parsed.origin !== devOrigin) event.preventDefault();
  });
});
