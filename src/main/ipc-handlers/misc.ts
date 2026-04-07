import { type BrowserWindow, type IpcMainInvokeEvent } from 'electron';

import { stopAllServers as lspStopAll } from '../lsp';
import {
  registerApprovalHandlers,
  registerCostHandlers,
  registerCrashLogHandlers,
  registerExtensionHandlers,
  registerGraphHandlers,
  registerLspHandlers,
  registerPerfHandlers,
  registerShellHistoryHandlers,
  registerSymbolHandlers,
  registerTrustHandlers,
  registerUpdaterHandlers,
  registerUsageHandlers,
  registerWindowHandlers,
} from './miscRegistrars';

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
