import { ipcMain } from 'electron';

import { getErrorMessage } from '../agentChat/utils';
import { getAutoUpdater, getLastOfferedVersion, isVersionRejected } from '../updater';

type ChannelList = string[];
type IpcHandler = Parameters<typeof ipcMain.handle>[1];
type FailureResponse = { success: false; error: string };
type EmptySuccessResponse = { success: true };

interface AutoUpdaterLike {
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(): void;
}

function registerChannel(channels: ChannelList, channel: string, handler: IpcHandler): void {
  ipcMain.handle(channel, handler);
  channels.push(channel);
}

function ok(): EmptySuccessResponse {
  return { success: true };
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

function createUpdaterHandler(
  action: (updater: AutoUpdaterLike) => Promise<unknown> | unknown,
): IpcHandler {
  return async () => {
    const updater = getAutoUpdater() as AutoUpdaterLike | null;
    if (!updater) return { success: false, error: 'electron-updater not installed' };
    return runAction(() => action(updater));
  };
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
