import { ipcMain } from 'electron';

import {
  getWindowTrustLevel,
  isWorkspaceTrusted,
  trustWorkspace,
  untrustWorkspace,
} from '../workspaceTrust';

type ChannelList = string[];
type IpcHandler = Parameters<typeof ipcMain.handle>[1];

function registerChannel(channels: ChannelList, channel: string, handler: IpcHandler): void {
  ipcMain.handle(channel, handler);
  channels.push(channel);
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
