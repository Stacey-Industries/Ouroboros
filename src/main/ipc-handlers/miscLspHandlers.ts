/**
 * miscLspHandlers.ts — LSP IPC handler registration.
 *
 * Split from miscRegistrars.ts to keep that file under the 300-line limit.
 */

import { BrowserWindow, ipcMain, IpcMainInvokeEvent } from 'electron';

import {
  didChange as lspDidChange,
  didClose as lspDidClose,
  didOpen as lspDidOpen,
  getCompletion as lspCompletion,
  getDefinition as lspDefinition,
  getDiagnostics as lspDiagnostics,
  getHover as lspHover,
  getRunningServers as lspGetStatus,
  setMainWindow as lspSetMainWindow,
  startServer as lspStart,
  stopServer as lspStop,
} from '../lsp';
import { assertPathAllowed } from './pathSecurity';

type ChannelList = string[];
type IpcHandler = Parameters<typeof ipcMain.handle>[1];

function reg(channels: ChannelList, channel: string, handler: IpcHandler): void {
  ipcMain.handle(channel, handler);
  channels.push(channel);
}

type LspFileOpts = { root: string; filePath: string; line: number; character: number };

function assertRootAndFile(event: IpcMainInvokeEvent, root: string, filePath: string) {
  return assertPathAllowed(event, root) ?? assertPathAllowed(event, filePath);
}

function registerLspFileChannels(channels: ChannelList): void {
  reg(channels, 'lsp:completion', async (event: IpcMainInvokeEvent, opts: LspFileOpts) => {
    const denied = assertRootAndFile(event, opts.root, opts.filePath);
    if (denied) return denied;
    return lspCompletion(opts.root, opts.filePath, opts.line, opts.character);
  });
  reg(channels, 'lsp:hover', async (event: IpcMainInvokeEvent, opts: LspFileOpts) => {
    const denied = assertRootAndFile(event, opts.root, opts.filePath);
    if (denied) return denied;
    return lspHover(opts.root, opts.filePath, opts.line, opts.character);
  });
  reg(channels, 'lsp:definition', async (event: IpcMainInvokeEvent, opts: LspFileOpts) => {
    const denied = assertRootAndFile(event, opts.root, opts.filePath);
    if (denied) return denied;
    return lspDefinition(opts.root, opts.filePath, opts.line, opts.character);
  });
  reg(
    channels,
    'lsp:diagnostics',
    async (event: IpcMainInvokeEvent, root: string, filePath: string) => {
      const denied = assertRootAndFile(event, root, filePath);
      if (denied) return denied;
      return lspDiagnostics(root, filePath);
    },
  );
}

function registerLspDocChannels(channels: ChannelList): void {
  reg(
    channels,
    'lsp:didOpen',
    async (event: IpcMainInvokeEvent, root: string, filePath: string, content: string) => {
      const denied = assertRootAndFile(event, root, filePath);
      if (denied) return denied;
      return lspDidOpen(root, filePath, content);
    },
  );
  reg(
    channels,
    'lsp:didChange',
    async (event: IpcMainInvokeEvent, root: string, filePath: string, content: string) => {
      const denied = assertRootAndFile(event, root, filePath);
      if (denied) return denied;
      return lspDidChange(root, filePath, content);
    },
  );
  reg(
    channels,
    'lsp:didClose',
    async (event: IpcMainInvokeEvent, root: string, filePath: string) => {
      const denied = assertRootAndFile(event, root, filePath);
      if (denied) return denied;
      return lspDidClose(root, filePath);
    },
  );
}

export function registerLspHandlers(channels: ChannelList, win: BrowserWindow): void {
  lspSetMainWindow(win);
  reg(channels, 'lsp:start', async (event: IpcMainInvokeEvent, root: string, language: string) => {
    const denied = assertPathAllowed(event, root);
    if (denied) return denied;
    return lspStart(root, language);
  });
  reg(channels, 'lsp:stop', async (event: IpcMainInvokeEvent, root: string, language: string) => {
    const denied = assertPathAllowed(event, root);
    if (denied) return denied;
    return lspStop(root, language);
  });
  registerLspFileChannels(channels);
  registerLspDocChannels(channels);
  reg(channels, 'lsp:getStatus', async () => ({ success: true as const, servers: lspGetStatus() }));
}
