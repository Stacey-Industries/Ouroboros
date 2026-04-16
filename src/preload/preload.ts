/**
 * preload.ts â€” contextBridge IPC surface.
 *
 * This file runs in an isolated context with access to both the Node.js
 * and browser environments. It exposes a typed API to the renderer via
 * window.electronAPI. No raw Node/Electron APIs are exposed.
 */

import { contextBridge, ipcRenderer, webFrame } from 'electron';

import type {
  AppConfig,
  AppTheme,
  AuthState,
  ElectronAPI,
  FileChangeEvent,
  GitHubLoginEvent,
  HookPayload,
} from '../renderer/types/electron';
import { supplementalApis } from './preloadSupplementalApis';
import { wave6StubApis } from './preloadWave6Stubs';

// â”€â”€â”€ PTY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const ptyAPI: ElectronAPI['pty'] = {
  spawn: (id, options) => ipcRenderer.invoke('pty:spawn', id, options),
  spawnClaude: (id, options) => ipcRenderer.invoke('pty:spawnClaude', id, options),
  spawnCodex: (id, options) => ipcRenderer.invoke('pty:spawnCodex', id, options),
  write: (id, data) => ipcRenderer.invoke('pty:write', id, data),
  resize: (id, cols, rows) => ipcRenderer.invoke('pty:resize', id, cols, rows),
  kill: (id) => ipcRenderer.invoke('pty:kill', id),
  getCwd: (id) => ipcRenderer.invoke('pty:getCwd', id),
  startRecording: (id) => ipcRenderer.invoke('pty:startRecording', id),
  stopRecording: (id) => ipcRenderer.invoke('pty:stopRecording', id),
  listSessions: () => ipcRenderer.invoke('pty:listSessions'),
  getShellState: (id) => ipcRenderer.invoke('pty:shellState', id),
  listPersistedSessions: () => ipcRenderer.invoke('pty:listPersistedSessions'),
  restoreSession: (id) => ipcRenderer.invoke('pty:restoreSession', id),
  discardPersistedSessions: () => ipcRenderer.invoke('pty:discardPersistedSessions'),
  linkToThread: (sessionId, threadId) =>
    ipcRenderer.invoke('pty:linkToThread', sessionId, threadId),
  getLinkedThread: (sessionId) => ipcRenderer.invoke('pty:getLinkedThread', sessionId),
  getLinkedSessionIds: (threadId) => ipcRenderer.invoke('pty:getLinkedSessionIds', threadId),

  onData: (id, callback) => {
    const channel = `pty:data:${id}`;
    const handler = (_event: Electron.IpcRendererEvent, data: string) => callback(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },

  onExit: (id, callback) => {
    const channel = `pty:exit:${id}`;
    const handler = (
      _event: Electron.IpcRendererEvent,
      result: { exitCode: number | null; signal: number | null },
    ) => callback(result);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },

  onRecordingState: (id, callback) => {
    const channel = `pty:recordingState:${id}`;
    const handler = (_event: Electron.IpcRendererEvent, state: { recording: boolean }) =>
      callback(state);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },

  onDisconnected: (id, callback) => {
    const channel = `pty:disconnected:${id}`;
    const handler = (
      _event: Electron.IpcRendererEvent,
      info: { reason: string; exitCode: number; scrollback: string[] },
    ) => callback(info);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
};

const codexAPI: ElectronAPI['codex'] = {
  listModels: () => ipcRenderer.invoke('codex:listModels'),
  resolveThreadId: (args) => ipcRenderer.invoke('codex:resolveThreadId', args),
};

// â”€â”€â”€ Config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const configAPI: ElectronAPI['config'] = {
  getAll: () => ipcRenderer.invoke('config:getAll'),
  get: (key) => ipcRenderer.invoke('config:get', key),
  set: (key, value) => ipcRenderer.invoke('config:set', key, value),
  export: () => ipcRenderer.invoke('config:export'),
  import: () => ipcRenderer.invoke('config:import'),
  openSettingsFile: () => ipcRenderer.invoke('config:openSettingsFile'),

  onExternalChange: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, config: AppConfig) => callback(config);
    ipcRenderer.on('config:externalChange', handler);
    return () => ipcRenderer.removeListener('config:externalChange', handler);
  },
};

// â”€â”€â”€ Files â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const filesAPI: ElectronAPI['files'] = {
  writeFile: (filePath, data) => ipcRenderer.invoke('files:writeFile', filePath, data),
  saveFile: (filePath, content) => ipcRenderer.invoke('files:saveFile', filePath, content),
  readFile: (filePath) => ipcRenderer.invoke('files:readFile', filePath),
  readBinaryFile: (filePath) => ipcRenderer.invoke('files:readBinaryFile', filePath),
  readDir: (dirPath) => ipcRenderer.invoke('files:readDir', dirPath),
  watchDir: (dirPath) => ipcRenderer.invoke('files:watchDir', dirPath),
  unwatchDir: (dirPath) => ipcRenderer.invoke('files:unwatchDir', dirPath),
  selectFolder: () => ipcRenderer.invoke('files:selectFolder'),
  createFile: (filePath, content) => ipcRenderer.invoke('files:createFile', filePath, content),
  mkdir: (dirPath) => ipcRenderer.invoke('files:mkdir', dirPath),
  rename: (oldPath, newPath) => ipcRenderer.invoke('files:rename', oldPath, newPath),
  copyFile: (sourcePath, destPath) => ipcRenderer.invoke('files:copyFile', sourcePath, destPath),
  delete: (targetPath) => ipcRenderer.invoke('files:delete', targetPath),
  softDelete: (targetPath) => ipcRenderer.invoke('files:softDelete', targetPath),
  restoreDeleted: (tempPath, originalPath) =>
    ipcRenderer.invoke('files:restoreDeleted', tempPath, originalPath),

  showImageDialog: () => ipcRenderer.invoke('files:showImageDialog'),

  search: (root, query, options) => ipcRenderer.invoke('files:search', root, query, options),

  onFileChange: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, change: FileChangeEvent) =>
      callback(change);
    ipcRenderer.on('files:change', handler);
    return () => ipcRenderer.removeListener('files:change', handler);
  },
};

// â”€â”€â”€ Hooks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const hooksAPI: ElectronAPI['hooks'] = {
  onAgentEvent: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, hookPayload: HookPayload) =>
      callback(hookPayload);
    ipcRenderer.on('hooks:event', handler);
    return () => ipcRenderer.removeListener('hooks:event', handler);
  },

  onToolCall: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, hookPayload: HookPayload) => {
      if (hookPayload.type === 'pre_tool_use' || hookPayload.type === 'post_tool_use') {
        callback(hookPayload);
      }
    };
    ipcRenderer.on('hooks:event', handler);
    return () => ipcRenderer.removeListener('hooks:event', handler);
  },
};

// â”€â”€â”€ App â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const appAPI: ElectronAPI['app'] = {
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getPlatform: () => ipcRenderer.invoke('app:getPlatform'),
  getSystemInfo: () => ({
    electron: process.versions.electron ?? '',
    chrome: process.versions.chrome ?? '',
    node: process.versions.node ?? '',
  }),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),

  setTitleBarOverlay: (color, symbolColor) =>
    ipcRenderer.invoke('titlebar:setOverlayColors', color, symbolColor),

  notify: (options) => ipcRenderer.invoke('app:notify', options),

  rebuildAndRestart: () => ipcRenderer.invoke('app:rebuildAndRestart'),
  rebuildWeb: () => ipcRenderer.invoke('app:rebuildWeb'),

  onMenuEvent: (callback) => {
    const events = [
      'menu:open-folder',
      'menu:new-terminal',
      'menu:command-palette',
      'menu:settings',
    ] as const;

    const handlers: Array<() => void> = [];

    for (const event of events) {
      const handler = () => callback(event);
      ipcRenderer.on(event, handler);
      handlers.push(() => ipcRenderer.removeListener(event, handler));
    }

    return () => handlers.forEach((cleanup) => cleanup());
  },

  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:maximize-toggle'),
  closeWindow: () => ipcRenderer.invoke('window:close-self'),

  newWindow: () => ipcRenderer.invoke('window:new'),
  toggleFullscreen: () => ipcRenderer.invoke('window:toggle-fullscreen'),
  toggleDevTools: () => ipcRenderer.invoke('window:toggle-devtools'),
  openLogsFolder: () => ipcRenderer.invoke('app:open-logs-folder'),

  zoomIn: () => {
    const level = Math.min(webFrame.getZoomLevel() + 0.5, 5);
    webFrame.setZoomLevel(level);
    return Promise.resolve({ success: true as const });
  },
  zoomOut: () => {
    const level = Math.max(webFrame.getZoomLevel() - 0.5, -3);
    webFrame.setZoomLevel(level);
    return Promise.resolve({ success: true as const });
  },
  zoomReset: () => {
    webFrame.setZoomLevel(0);
    return Promise.resolve({ success: true as const });
  },

  onStartupWarning: (callback) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: { name: string; message: string },
    ) => callback(payload);
    ipcRenderer.on('app:startupWarning', handler);
    return () => ipcRenderer.removeListener('app:startupWarning', handler);
  },
};

// â”€â”€â”€ Shell â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const shellAPI: ElectronAPI['shell'] = {
  showItemInFolder: (fullPath) => ipcRenderer.invoke('shell:showItemInFolder', fullPath),
  openExtensionsFolder: () => ipcRenderer.invoke('shell:openExtensionsFolder'),
};

// â”€â”€â”€ Theme â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const themeAPI: ElectronAPI['theme'] = {
  get: () => ipcRenderer.invoke('theme:get'),
  set: (theme) => ipcRenderer.invoke('theme:set', theme),

  onChange: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, theme: AppTheme) => callback(theme);
    ipcRenderer.on('theme:changed', handler);
    return () => ipcRenderer.removeListener('theme:changed', handler);
  },
};

// â”€â”€â”€ Git â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const gitAPI: ElectronAPI['git'] = {
  isRepo: (root) => ipcRenderer.invoke('git:isRepo', root),
  status: (root) => ipcRenderer.invoke('git:status', root),
  branch: (root) => ipcRenderer.invoke('git:branch', root),
  diff: (root, filePath) => ipcRenderer.invoke('git:diff', root, filePath),
  diffRaw: (root, filePath) => ipcRenderer.invoke('git:diffRaw', root, filePath),
  blame: (root, filePath) => ipcRenderer.invoke('git:blame', root, filePath),
  log: (root, filePath, offset) => ipcRenderer.invoke('git:log', root, filePath, offset ?? 0),
  show: (root, hash, filePath) => ipcRenderer.invoke('git:show', root, hash, filePath),
  branches: (root) => ipcRenderer.invoke('git:branches', root),
  checkout: (root, branch) => ipcRenderer.invoke('git:checkout', root, branch),
  stage: (root, filePath) => ipcRenderer.invoke('git:stage', root, filePath),
  unstage: (root, filePath) => ipcRenderer.invoke('git:unstage', root, filePath),
  stageAll: (root) => ipcRenderer.invoke('git:stageAll', root),
  unstageAll: (root) => ipcRenderer.invoke('git:unstageAll', root),
  commit: (root, message) => ipcRenderer.invoke('git:commit', root, message),
  discardFile: (root, filePath) => ipcRenderer.invoke('git:discardFile', root, filePath),
  statusDetailed: (root) => ipcRenderer.invoke('git:statusDetailed', root),
  snapshot: (root) => ipcRenderer.invoke('git:snapshot', root),
  diffReview: (root, commitHash, filePaths) =>
    ipcRenderer.invoke('git:diffReview', root, commitHash, filePaths),
  diffCached: (root, commitHash, filePaths) =>
    ipcRenderer.invoke('git:diffCached', root, commitHash, filePaths),
  fileAtCommit: (root, commitHash, filePath) =>
    ipcRenderer.invoke('git:fileAtCommit', root, commitHash, filePath),
  applyHunk: (root, patchContent) => ipcRenderer.invoke('git:applyHunk', root, patchContent),
  revertHunk: (root, patchContent) => ipcRenderer.invoke('git:revertHunk', root, patchContent),
  stageHunk: (root, patchContent) => ipcRenderer.invoke('git:stageHunk', root, patchContent),
  revertFile: (root, commitHash, filePath) =>
    ipcRenderer.invoke('git:revertFile', root, commitHash, filePath),
  diffBetween: (root, fromHash, toHash) =>
    ipcRenderer.invoke('git:diffBetween', root, fromHash, toHash),
  changedFilesBetween: (root, fromHash, toHash) =>
    ipcRenderer.invoke('git:changedFilesBetween', root, fromHash, toHash),
  restoreSnapshot: (root, commitHash) =>
    ipcRenderer.invoke('git:restoreSnapshot', root, commitHash),
  createSnapshot: (root, label) => ipcRenderer.invoke('git:createSnapshot', root, label),
  dirtyCount: (root) => ipcRenderer.invoke('git:dirtyCount', root),
  checkpoint: (root, message) => ipcRenderer.invoke('git:checkpoint', root, message),
};

// ——— Providers ———————————————————————————————————————————————————————

const providersAPI: ElectronAPI['providers'] = {
  list: () => ipcRenderer.invoke('providers:list'),
  getSlots: () => ipcRenderer.invoke('providers:getSlots'),
};

// ——— Auth ———————————————————————————————————————————————————————————

const authAPI: ElectronAPI['auth'] = {
  getStates: () => ipcRenderer.invoke('auth:getStates'),
  startLogin: (provider) => ipcRenderer.invoke('auth:startLogin', provider),
  cancelLogin: (provider) => ipcRenderer.invoke('auth:cancelLogin', provider),
  logout: (provider) => ipcRenderer.invoke('auth:logout', provider),
  setApiKey: (provider, apiKey) => ipcRenderer.invoke('auth:setApiKey', provider, apiKey),
  importCliCreds: (provider) => ipcRenderer.invoke('auth:importCliCreds', provider),
  detectCliCreds: () => ipcRenderer.invoke('auth:detectCliCreds'),
  openExternal: (url) => ipcRenderer.invoke('auth:openExternal', url),

  onLoginEvent: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: GitHubLoginEvent) => callback(data);
    ipcRenderer.on('auth:loginEvent', handler);
    return () => ipcRenderer.removeListener('auth:loginEvent', handler);
  },

  onStateChanged: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, states: AuthState[]) => callback(states);
    ipcRenderer.on('auth:stateChanged', handler);
    return () => ipcRenderer.removeListener('auth:stateChanged', handler);
  },
};

const electronAPI: ElectronAPI = {
  pty: ptyAPI,
  config: configAPI,
  files: filesAPI,
  hooks: hooksAPI,
  auth: authAPI,
  app: appAPI,
  shell: shellAPI,
  theme: themeAPI,
  git: gitAPI,
  providers: providersAPI,
  codex: codexAPI,
  ...supplementalApis,
  ...wave6StubApis,
};

// â”€â”€â”€ Expose â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
