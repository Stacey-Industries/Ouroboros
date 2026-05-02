import { app, ipcMain, shell } from 'electron';
import fs from 'fs/promises';
import path from 'path';

import { getErrorMessage } from '../agentChat/utils';
import { getCrashReportDirPath } from '../crashReporterStorage';
import log from '../logger';

type ChannelList = string[];
type IpcHandler = Parameters<typeof ipcMain.handle>[1];
type FailureResponse = { success: false; error: string };
type EmptySuccessResponse = { success: true };
type SuccessResponse<T extends object> = EmptySuccessResponse & T;

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

// Lazy — `app.getPath` is undefined in worker_threads that transitively
// import this module via the import chain. See threadStore.ts for context.
let _crashLogDir: string | null = null;
function getCrashLogDir(): string {
  if (_crashLogDir !== null) return _crashLogDir;
  _crashLogDir = path.join(app.getPath('userData'), 'crashes');
  return _crashLogDir;
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
