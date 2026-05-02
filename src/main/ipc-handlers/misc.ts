import { type BrowserWindow, type IpcMainInvokeEvent } from 'electron';

import { stopAllServers as lspStopAll } from '../lsp';
import { registerApprovalHandlers } from './approvalHandlers';
import { registerCostHandlers } from './costHandlers';
import { registerCrashLogHandlers } from './crashHandlers';
import { registerGraphHandlers } from './graphHandlers';
import { registerLspHandlers } from './lspHandlers';
import { registerExtensionHandlers, registerWindowHandlers } from './miscRegistrarsHelpers';
import { registerPerfHandlers } from './perfHandlers';
import { registerShellHistoryHandlers } from './shellHistoryHandlers';
import { registerSymbolHandlers } from './symbolHandlers';
import { registerTrustHandlers } from './trustHandlers';
import { registerUpdaterHandlers } from './updaterHandlers';
import { registerUsageHandlers } from './usageHandlers';

type SenderWindow = (event: IpcMainInvokeEvent) => BrowserWindow;

export function registerMiscHandlers(senderWindow: SenderWindow, win: BrowserWindow): string[] {
  void senderWindow;

  const channels: string[] = [];

  registerUpdaterHandlers(channels);
  registerCostHandlers(channels);
  registerUsageHandlers(channels);
  registerCrashLogHandlers(channels);
  registerPerfHandlers(channels);
  registerShellHistoryHandlers(channels);
  registerSymbolHandlers(channels);
  registerWindowHandlers(channels);
  registerExtensionHandlers(channels);
  registerLspHandlers(channels, win);
  registerApprovalHandlers(channels);
  registerGraphHandlers(channels);
  registerTrustHandlers(channels);

  return channels;
}

export { lspStopAll };
