import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent, shell } from 'electron';
import fs from 'fs/promises';
import path from 'path';

import { getErrorMessage } from '../agentChat/utils';
import { addAlwaysAllowRule, respondToApproval } from '../approvalManager';
import { clearCostHistory, type CostEntry, getCostHistory, saveCostEntry } from '../costHistory';
import { subscribeToPerfMetrics, unsubscribeFromPerfMetrics } from '../perfMetrics';
import { getAutoUpdater } from '../updater';
import {
  getRecentSessionDetails,
  getSessionDetail,
  getUsageSummary,
  getWindowedUsage,
} from '../usageReader';
import {
  closeWindow,
  createWindow,
  focusWindow,
  getWindowInfos,
  setWindowProjectRoot,
} from '../windowManager';
import { readShellHistory, searchSymbols } from './miscSymbolSearch';
import { assertPathAllowed } from './pathSecurity';

export { registerGraphHandlers } from './miscGraphHandlers';
export { registerLspHandlers } from './miscLspHandlers';

type ChannelList = string[];
type IpcHandler = Parameters<typeof ipcMain.handle>[1];
type FailureResponse = { success: false; error: string };
type EmptySuccessResponse = { success: true };
type SuccessResponse<T extends object> = EmptySuccessResponse & T;

// AutoUpdaterLike interface kept for the createUpdaterHandler helper below.
interface AutoUpdaterLike {
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(): void;
}

const crashLogDir = path.join(app.getPath('userData'), 'crashes');

function registerChannel(channels: ChannelList, channel: string, handler: IpcHandler): void {
  ipcMain.handle(channel, handler);
  channels.push(channel);
}

function ok(): EmptySuccessResponse;
function ok<T extends object>(payload: T): SuccessResponse<T>;
function ok(payload?: object): EmptySuccessResponse | SuccessResponse<object> {
  return payload ? { success: true, ...payload } : { success: true };
}

function fail(error: unknown): FailureResponse {
  return { success: false, error: getErrorMessage(error) };
}

async function runAction(
  action: () => Promise<unknown> | unknown,
): Promise<EmptySuccessResponse | FailureResponse> {
  try {
    await action();
    return ok();
  } catch (error) {
    return fail(error);
  }
}

async function runQuery<T extends object>(
  query: () => Promise<T> | T,
): Promise<SuccessResponse<T> | FailureResponse> {
  try {
    return ok(await query());
  } catch (error) {
    return fail(error);
  }
}

function createUpdaterHandler(
  action: (updater: AutoUpdaterLike) => Promise<unknown> | unknown,
): IpcHandler {
  return async () => {
    const updater = getAutoUpdater() as AutoUpdaterLike | null;
    if (!updater) return { success: false, error: 'electron-updater not installed' };
    return runAction(() => action(updater));
  };
}

async function getCrashLogFiles(): Promise<string[]> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- crashLogDir is a module-level constant derived from app.getPath('userData')
  await fs.mkdir(crashLogDir, { recursive: true });
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- crashLogDir is a module-level constant derived from app.getPath('userData')
  const entries = await fs.readdir(crashLogDir);
  return entries.filter((entry) => entry.endsWith('.log'));
}

async function readCrashLog(
  fileName: string,
): Promise<{ name: string; content: string; mtime: number }> {
  const filePath = path.join(crashLogDir, fileName);
  const [content, stat] = await Promise.all([
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath derived from crashLogDir constant + sanitised filename
    fs.readFile(filePath, 'utf-8'),
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath derived from crashLogDir constant + sanitised filename
    fs.stat(filePath),
  ]);
  return { name: fileName, content, mtime: stat.mtime.getTime() };
}

async function getCrashLogs(): Promise<Array<{ name: string; content: string; mtime: number }>> {
  const logFiles = await getCrashLogFiles();
  const logs = await Promise.all(
    logFiles.map(async (fileName) => {
      try {
        return await readCrashLog(fileName);
      } catch {
        return null;
      }
    }),
  );
  return logs.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}

async function clearCrashLogs(): Promise<void> {
  const logFiles = await getCrashLogFiles();
  await Promise.all(
    logFiles.map((fileName) =>
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- path derived from crashLogDir constant + sanitised filename
      fs.unlink(path.join(crashLogDir, fileName)).catch((error) => {
        console.error('[crash] Failed to delete crash log file:', fileName, error);
      }),
    ),
  );
}

async function writeCrashLog(source: string, message: string, stack?: string): Promise<void> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- crashLogDir is a module-level constant derived from app.getPath('userData')
  await fs.mkdir(crashLogDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(crashLogDir, `crash-${timestamp}.log`);
  const content = [
    `Source: ${source}`,
    `Timestamp: ${new Date().toISOString()}`,
    `App version: ${app.getVersion()}`,
    `Platform: ${process.platform} ${process.arch}`,
    '',
    message,
    ...(stack ? ['', 'Stack:', stack] : []),
  ].join('\n');
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath derived from crashLogDir constant + timestamp, not user input
  await fs.writeFile(filePath, content, 'utf-8');
}

async function registerExtensionTask<T>(
  task: (extensions: typeof import('../extensions')) => Promise<T> | T,
): Promise<T | FailureResponse> {
  try {
    const extensions = await import('../extensions');
    return await task(extensions);
  } catch (error) {
    return fail(error);
  }
}

export function registerUpdaterHandlers(channels: ChannelList): void {
  registerChannel(
    channels,
    'updater:check',
    createUpdaterHandler((updater) => updater.checkForUpdates()),
  );
  registerChannel(
    channels,
    'updater:download',
    createUpdaterHandler((updater) => updater.downloadUpdate()),
  );
  registerChannel(
    channels,
    'updater:install',
    createUpdaterHandler((updater) => updater.quitAndInstall()),
  );
}

export function registerCostHandlers(channels: ChannelList): void {
  registerChannel(channels, 'cost:addEntry', async (_event, entry: CostEntry) =>
    runAction(() => saveCostEntry(entry)),
  );
  registerChannel(channels, 'cost:getHistory', async () =>
    runQuery(async () => ({ entries: await getCostHistory() })),
  );
  registerChannel(channels, 'cost:clearHistory', async () => runAction(clearCostHistory));
}

export function registerUsageHandlers(channels: ChannelList): void {
  registerChannel(
    channels,
    'usage:getSummary',
    async (_event, options?: { projectFilter?: string; since?: number; maxSessions?: number }) =>
      runQuery(async () => ({ summary: await getUsageSummary(options) })),
  );
  registerChannel(channels, 'usage:getSessionDetail', async (_event, sessionId: string) =>
    runQuery(async () => ({ detail: await getSessionDetail(sessionId) })),
  );
  registerChannel(channels, 'usage:getRecentSessions', async (_event, count?: number) =>
    runQuery(async () => ({ sessions: await getRecentSessionDetails(count ?? 3) })),
  );
  registerChannel(channels, 'usage:getWindowedUsage', async () =>
    runQuery(async () => ({ windowed: await getWindowedUsage() })),
  );
}

export function registerCrashLogHandlers(channels: ChannelList): void {
  registerChannel(channels, 'app:getCrashLogs', async () =>
    runQuery(async () => {
      const logs = await getCrashLogs();
      logs.sort((left, right) => right.mtime - left.mtime);
      return { logs };
    }),
  );
  registerChannel(channels, 'app:clearCrashLogs', async () => runAction(clearCrashLogs));
  registerChannel(channels, 'app:openCrashLogDir', async () =>
    runAction(async () => {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- crashLogDir is a module-level constant derived from app.getPath('userData')
      await fs.mkdir(crashLogDir, { recursive: true });
      await shell.openPath(crashLogDir);
      return ok();
    }),
  );
  registerChannel(
    channels,
    'app:logError',
    async (_event, source: string, message: string, stack?: string) =>
      runAction(() => writeCrashLog(source, message, stack)),
  );
}

export function registerPerfHandlers(channels: ChannelList): void {
  registerChannel(channels, 'perf:ping', () => ok({ ts: Date.now() }));
  registerChannel(channels, 'perf:subscribe', (event) => subscribeToPerfMetrics(event));
  registerChannel(channels, 'perf:unsubscribe', (event) => unsubscribeFromPerfMetrics(event));
}

export function registerShellHistoryHandlers(channels: ChannelList): void {
  registerChannel(channels, 'shellHistory:read', async () =>
    runQuery(async () => ({ commands: await readShellHistory() })),
  );
}

export function registerSymbolHandlers(channels: ChannelList): void {
  registerChannel(channels, 'symbol:search', async (event: IpcMainInvokeEvent, root: string) => {
    const denied = assertPathAllowed(event, root);
    if (denied) return denied;
    return runQuery(async () => ({ symbols: await searchSymbols(root) }));
  });
}

function registerWindowFrameControls(channels: ChannelList): void {
  registerChannel(channels, 'window:minimize', async (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
    return ok();
  });
  registerChannel(channels, 'window:maximize-toggle', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
    }
    return ok();
  });
  registerChannel(channels, 'window:close-self', async (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
    return ok();
  });
  registerChannel(channels, 'window:toggle-fullscreen', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.setFullScreen(!win.isFullScreen());
    return ok();
  });
  registerChannel(channels, 'window:toggle-devtools', async (event) => {
    BrowserWindow.fromWebContents(event.sender)?.webContents.toggleDevTools();
    return ok();
  });
}

export function registerWindowHandlers(channels: ChannelList): void {
  registerChannel(channels, 'window:new', (_event, projectRoot?: string) =>
    runQuery(() => {
      const newWindow = createWindow(projectRoot);
      if (projectRoot) setWindowProjectRoot(newWindow.id, projectRoot);
      return { windowId: newWindow.id };
    }),
  );
  registerChannel(channels, 'window:list', async () =>
    runQuery(() => ({ windows: getWindowInfos() })),
  );
  registerChannel(channels, 'window:focus', async (_event, windowId: number) =>
    runAction(() => focusWindow(windowId)),
  );
  registerChannel(channels, 'window:close', async (_event, windowId: number) =>
    runAction(() => closeWindow(windowId)),
  );
  registerWindowFrameControls(channels);
  registerChannel(channels, 'app:open-logs-folder', async () => {
    await shell.openPath(app.getPath('logs'));
    return ok();
  });
}

export function registerExtensionHandlers(channels: ChannelList): void {
  registerChannel(channels, 'extensions:list', async () =>
    registerExtensionTask((extensions) => ok({ extensions: extensions.listExtensions() })),
  );
  registerChannel(channels, 'extensions:enable', async (_event, name: string) =>
    registerExtensionTask((extensions) => extensions.enableExtension(name)),
  );
  registerChannel(channels, 'extensions:disable', async (_event, name: string) =>
    registerExtensionTask((extensions) => extensions.disableExtension(name)),
  );
  registerChannel(channels, 'extensions:install', async (_event, sourcePath: string) =>
    registerExtensionTask((extensions) => extensions.installExtension(sourcePath)),
  );
  registerChannel(channels, 'extensions:uninstall', async (_event, name: string) =>
    registerExtensionTask((extensions) => extensions.uninstallExtension(name)),
  );
  registerChannel(channels, 'extensions:getLog', async (_event, name: string) =>
    registerExtensionTask((extensions) => extensions.getExtensionLog(name)),
  );
  registerChannel(channels, 'extensions:openFolder', async () =>
    registerExtensionTask(async (extensions) => {
      const extensionsPath = extensions.getExtensionsDirPath();
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- extensionsPath derived from extensions module, not user input
      await fs.mkdir(extensionsPath, { recursive: true });
      await shell.openPath(extensionsPath);
      return ok();
    }),
  );
  registerChannel(channels, 'extensions:activate', async (_event, name: string) =>
    registerExtensionTask((extensions) => extensions.forceActivateExtension(name)),
  );
  registerChannel(channels, 'extensions:commandExecuted', async (_event, commandId: string) =>
    registerExtensionTask(async (extensions) => {
      await extensions.dispatchCommandEvent(commandId);
      return ok();
    }),
  );
}

export function registerApprovalHandlers(channels: ChannelList): void {
  registerChannel(
    channels,
    'approval:respond',
    async (_event, requestId: string, decision: 'approve' | 'reject', reason?: string) =>
      runQuery(async () => {
        const written = await respondToApproval(requestId, { decision, reason });
        return { error: written ? undefined : 'Failed to write response file' };
      }).then((result) => {
        if (!result.success) {
          return result;
        }
        return { success: result.error === undefined, error: result.error };
      }),
  );
  registerChannel(
    channels,
    'approval:alwaysAllow',
    async (_event, sessionId: string, toolName: string) =>
      runAction(() => addAlwaysAllowRule(sessionId, toolName)),
  );
}
