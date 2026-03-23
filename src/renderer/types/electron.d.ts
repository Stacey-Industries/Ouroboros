import type { ElectronAPI } from './electron-workspace';

export * from './electron-agent-chat';
export * from './electron-auth';
export * from './electron-claude-md';
export * from './electron-extension-store';
export * from './electron-foundation';
export * from './electron-git';
export * from './electron-mcp-store';
export * from './electron-observability';
export * from './electron-runtime-apis';
export * from './electron-workspace';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
