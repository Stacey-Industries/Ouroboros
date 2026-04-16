import type { ElectronAPI } from './electron-workspace';

export * from './electron-agent-chat';
export * from './electron-agent-conflict';
export * from './electron-ai-stream';
export * from './electron-auth';
export * from './electron-background-jobs';
export * from './electron-checkpoint';
export * from './electron-claude-md';
export * from './electron-embedding';
export * from './electron-extension-store';
export * from './electron-extensions';
export * from './electron-folder';
export * from './electron-foundation';
export * from './electron-git';
export * from './electron-mcp-store';
export * from './electron-observability';
export * from './electron-orchestration';
export * from './electron-pinned-context';
export * from './electron-research';
export * from './electron-rules-skills';
export * from './electron-runtime-apis';
export * from './electron-session';
export * from './electron-spec';
export * from './electron-system2';
export * from './electron-telemetry';
export * from './electron-workspace';
export * from './electron-workspace-read-list';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
