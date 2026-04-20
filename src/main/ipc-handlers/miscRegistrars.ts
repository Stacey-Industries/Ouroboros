// TODO: miscRegistrars.ts spans multiple unrelated domains (updater, cost, usage,
// crash logs, perf, shell history, symbols, approval, window, extensions).
// Each domain should eventually be extracted to its own named handler file
// (e.g. updaterHandlers.ts, costHandlers.ts, usageHandlers.ts, etc.).
import { app, ipcMain, IpcMainInvokeEvent, shell } from 'electron';
import fs from 'fs/promises';
import path from 'path';

import { getErrorMessage } from '../agentChat/utils';
import { addAlwaysAllowRule, respondToApproval } from '../approvalManager';
import { forget, listAll, rememberAllow, rememberDeny } from '../approvalMemory';
import { getLatestClaudeUsageSnapshot } from '../claudeRateLimits';
import { getLatestCodexUsageSnapshot } from '../codexRateLimits';
import { clearCostHistory, type CostEntry, getCostHistory, saveCostEntry } from '../costHistory';
import {
  aggregateUsageSummary,
  aggregateWindowedUsage,
  findSessionDetailById,
  getRecentSessionsFromEntries,
} from '../costHistoryAggregation';
import { getCrashReportDirPath } from '../crashReporterStorage';
import log from '../logger';
import { getAutoUpdater, getLastOfferedVersion, isVersionRejected } from '../updater';
import {
  getWindowTrustLevel,
  isWorkspaceTrusted,
  trustWorkspace,
  untrustWorkspace,
} from '../workspaceTrust';
import { registerExtensionHandlers, registerWindowHandlers } from './miscRegistrarsHelpers';
import { readShellHistory, searchSymbols } from './miscSymbolSearch';
import { assertPathAllowed } from './pathSecurity';

export { registerGraphHandlers } from './graphHandlers';
export { registerLspHandlers } from './lspHandlers';

type ChannelList = string[];
type IpcHandler = Parameters<typeof ipcMain.handle>[1];
type FailureResponse = { success: false; error: string };
type EmptySuccessResponse = { success: true };
type SuccessResponse<T extends object> = EmptySuccessResponse & T;

interface AutoUpdaterLike {
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(): void;
}

// Lazy — `app.getPath` is undefined in worker_threads that transitively
// import this module via the import chain. See threadStore.ts for context.
let _crashLogDir: string | null = null;
function getCrashLogDir(): string {
  if (_crashLogDir !== null) return _crashLogDir;
  _crashLogDir = path.join(app.getPath('userData'), 'crashes');
  return _crashLogDir;
}

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
  await fs.mkdir(getCrashLogDir(), { recursive: true });
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- crashLogDir is a module-level constant derived from app.getPath('userData')
  const entries = await fs.readdir(getCrashLogDir());
  return entries.filter((entry) => entry.endsWith('.log'));
}

async function readCrashLog(
  fileName: string,
): Promise<{ name: string; content: string; mtime: number }> {
  const filePath = path.join(getCrashLogDir(), fileName);
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
      fs.unlink(path.join(getCrashLogDir(), fileName)).catch((error) => {
        log.error('Failed to delete crash log file:', fileName, error);
      }),
    ),
  );
}

async function writeCrashLog(source: string, message: string, stack?: string): Promise<void> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- crashLogDir is a module-level constant derived from app.getPath('userData')
  await fs.mkdir(getCrashLogDir(), { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(getCrashLogDir(), `crash-${timestamp}.log`);
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

export function registerUpdaterHandlers(channels: ChannelList): void {
  registerChannel(
    channels,
    'updater:check',
    createUpdaterHandler((u) => u.checkForUpdates()),
  );
  registerChannel(channels, 'updater:download', async () => {
    const updater = getAutoUpdater() as AutoUpdaterLike | null;
    if (!updater) return { success: false, error: 'electron-updater not installed' };
    if (isVersionRejected(getLastOfferedVersion() ?? '')) {
      return { success: false, error: 'downgrade-rejected' };
    }
    return runAction(() => updater.downloadUpdate());
  });
  registerChannel(
    channels,
    'updater:install',
    createUpdaterHandler((u) => u.quitAndInstall()),
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
      runQuery(async () => ({
        summary: aggregateUsageSummary(await getCostHistory(), options),
      })),
  );
  registerChannel(channels, 'usage:getSessionDetail', async (_event, sessionId: string) =>
    runQuery(async () => ({
      detail: findSessionDetailById(await getCostHistory(), sessionId),
    })),
  );
  registerChannel(channels, 'usage:getRecentSessions', async (_event, count?: number) =>
    runQuery(async () => ({
      sessions: getRecentSessionsFromEntries(await getCostHistory(), count ?? 3),
    })),
  );
  registerChannel(channels, 'usage:getWindowedUsage', async () =>
    runQuery(async () => ({
      windowed: aggregateWindowedUsage(await getCostHistory()),
    })),
  );
  registerChannel(channels, 'usage:getUsageWindowSnapshot', async () =>
    runQuery(async () => ({
      snapshot: {
        fetchedAt: Date.now(),
        claude: await getLatestClaudeUsageSnapshot(),
        codex: await getLatestCodexUsageSnapshot(),
      },
    })),
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
      await fs.mkdir(getCrashLogDir(), { recursive: true });
      await shell.openPath(getCrashLogDir());
      return ok();
    }),
  );
  registerChannel(channels, 'platform:openCrashReportsDir', async () =>
    runAction(async () => {
      const dir = getCrashReportDirPath();
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- dir rooted at os.homedir() via getCrashReportDirPath()
      await fs.mkdir(dir, { recursive: true });
      await shell.openPath(dir);
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

export { registerPerfHandlers } from './perfHandlers';

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

export { registerExtensionHandlers, registerWindowHandlers };

export function registerApprovalHandlers(channels: ChannelList): void {
  registerChannel(
    channels,
    'approval:respond',
    async (_event, requestId: string, decision: 'approve' | 'reject', reason?: string) =>
      runQuery(async () => {
        const written = await respondToApproval(requestId, { decision, reason });
        return { error: written ? undefined : 'Failed to write response file' };
      }).then((result) => {
        if (!result.success) return result;
        return { success: result.error === undefined, error: result.error };
      }),
  );
  registerChannel(
    channels,
    'approval:alwaysAllow',
    async (_event, sessionId: string, toolName: string) =>
      runAction(() => addAlwaysAllowRule(sessionId, toolName)),
  );
  registerChannel(
    channels,
    'approval:remember',
    async (_event, toolName: string, key: string, decision: 'allow' | 'deny') =>
      runAction(() => {
        if (decision === 'allow') rememberAllow(toolName, key);
        else rememberDeny(toolName, key);
      }),
  );
  registerChannel(channels, 'approval:listMemory', async () =>
    runQuery(() => ({ entries: listAll() })),
  );
  registerChannel(channels, 'approval:forget', async (_event, hash: string) =>
    runAction(() => forget(hash)),
  );
}

export function registerTrustHandlers(channels: ChannelList): void {
  registerChannel(channels, 'workspace:isTrusted', (_event, p: string) => isWorkspaceTrusted(p));
  registerChannel(channels, 'workspace:trustLevel', (_event, roots: string[]) =>
    getWindowTrustLevel(roots),
  );
  registerChannel(channels, 'workspace:trust', (_event, p: string) => {
    trustWorkspace(p);
    return { success: true };
  });
  registerChannel(channels, 'workspace:untrust', (_event, p: string) => {
    untrustWorkspace(p);
    return { success: true };
  });
}
