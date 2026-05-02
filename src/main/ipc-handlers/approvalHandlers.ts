import { ipcMain } from 'electron';

import { getErrorMessage } from '../agentChat/utils';
import { addAlwaysAllowRule, respondToApproval } from '../approvalManager';
import { forget, listAll, rememberAllow, rememberDeny } from '../approvalMemory';

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
