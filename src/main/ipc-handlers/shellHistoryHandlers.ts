import { ipcMain } from 'electron';

import { getErrorMessage } from '../agentChat/utils';
import { readShellHistory } from './miscSymbolSearch';

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

export function registerShellHistoryHandlers(channels: ChannelList): void {
  registerChannel(channels, 'shellHistory:read', async () =>
    runQuery(async () => ({ commands: await readShellHistory() })),
  );
}
