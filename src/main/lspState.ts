import { BrowserWindow } from 'electron';

import { getServerLanguageForFilePath, serverKey } from './lspHelpers';
import type { LspServerInstance, LspServerStatus } from './lspTypes';

export const servers = new Map<string, LspServerInstance>();

let mainWindow: BrowserWindow | null = null;

export function setMainWindow(win: BrowserWindow): void {
  mainWindow = win;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function getRunningServers(): LspServerStatus[] {
  return Array.from(servers.values()).map((server) => ({
    root: server.root,
    language: server.language,
    status: server.status,
  }));
}

export function broadcastStatusChange(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('lsp:statusChange', getRunningServers());
  }
  try {
    // Keep the web bridge optional here so importing LSP state in tests does
    // not pull the full Electron/window manager graph into module evaluation.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic require avoids circular import in tests
    const { broadcastToWebClients } =
      require('./web/webServer') as typeof import('./web/webServer');
    broadcastToWebClients('lsp:statusChange', getRunningServers());
  } catch {
    // Web server is best-effort and may be unavailable in tests or early boot.
  }
}

export function detectLanguageForFile(root: string, filePath: string): string | null {
  const language = getServerLanguageForFilePath(filePath);
  if (!language) {
    return null;
  }
  if (servers.has(serverKey(root, language))) {
    return language;
  }
  if (language === 'javascript' && servers.has(serverKey(root, 'typescript'))) {
    return 'typescript';
  }
  return language;
}

export function getRunningServerForFile(
  root: string,
  filePath: string,
): { instance: LspServerInstance; language: string } | null {
  const language = detectLanguageForFile(root, filePath);
  if (!language) {
    return null;
  }
  const instance = servers.get(serverKey(root, language));
  if (!instance || instance.status !== 'running') {
    return null;
  }
  return { instance, language };
}
