import { ipcMain } from 'electron';

import { getErrorMessage } from '../agentChat/utils';
import { getLatestClaudeUsageSnapshot } from '../claudeRateLimits';
import { getLatestCodexUsageSnapshot } from '../codexRateLimits';
import { getCostHistory } from '../costHistory';
import {
  aggregateUsageSummary,
  aggregateWindowedUsage,
  findSessionDetailById,
  getRecentSessionsFromEntries,
} from '../costHistoryAggregation';

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

async function runQuery<T extends object>(
  query: () => Promise<T> | T,
): Promise<SuccessResponse<T> | FailureResponse> {
  try {
    return ok(await query());
  } catch (error) {
    return fail(error);
  }
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
