/**
 * preload.ts â€” contextBridge IPC surface.
 *
 * This file runs in an isolated context with access to both the Node.js
 * and browser environments. It exposes a typed API to the renderer via
 * window.electronAPI. No raw Node/Electron APIs are exposed.
 */

import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI, FileChangeEvent, AgentEvent, AppTheme, AppConfig } from '../renderer/types/electron'
import { supplementalApis } from './preloadSupplementalApis'

// â”€â”€â”€ PTY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const ptyAPI: ElectronAPI['pty'] = {
  spawn: (id, options) => ipcRenderer.invoke('pty:spawn', id, options),
  spawnClaude: (id, options) => ipcRenderer.invoke('pty:spawnClaude', id, options),
  write: (id, data) => ipcRenderer.invoke('pty:write', id, data),
  resize: (id, cols, rows) => ipcRenderer.invoke('pty:resize', id, cols, rows),
  kill: (id) => ipcRenderer.invoke('pty:kill', id),
  getCwd: (id) => ipcRenderer.invoke('pty:getCwd', id),
  startRecording: (id) => ipcRenderer.invoke('pty:startRecording', id),
  stopRecording: (id) => ipcRenderer.invoke('pty:stopRecording', id),
  listSessions: () => ipcRenderer.invoke('pty:listSessions'),

  onData: (id, callback) => {
    const channel = `pty:data:${id}`
    const handler = (_event: Electron.IpcRendererEvent, data: string) => callback(data)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },

  onExit: (id, callback) => {
    const channel = `pty:exit:${id}`
    const handler = (
      _event: Electron.IpcRendererEvent,
      result: { exitCode: number | null; signal: number | null }
    ) => callback(result)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },

  onRecordingState: (id, callback) => {
    const channel = `pty:recordingState:${id}`
    const handler = (_event: Electron.IpcRendererEvent, state: { recording: boolean }) =>
      callback(state)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }
}

// â”€â”€â”€ Config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const configAPI: ElectronAPI['config'] = {
  getAll: () => ipcRenderer.invoke('config:getAll'),
  get: (key) => ipcRenderer.invoke('config:get', key),
  set: (key, value) => ipcRenderer.invoke('config:set', key, value),
  export: () => ipcRenderer.invoke('config:export'),
  import: () => ipcRenderer.invoke('config:import'),
  openSettingsFile: () => ipcRenderer.invoke('config:openSettingsFile'),

  onExternalChange: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, config: AppConfig) => callback(config)
    ipcRenderer.on('config:externalChange', handler)
    return () => ipcRenderer.removeListener('config:externalChange', handler)
  },
}

// â”€â”€â”€ Files â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const filesAPI: ElectronAPI['files'] = {
  writeFile: (filePath, data) => ipcRenderer.invoke('files:writeFile', filePath, data),
  saveFile: (filePath, content) => ipcRenderer.invoke('files:saveFile', filePath, content),
  readFile: (filePath) => ipcRenderer.invoke('files:readFile', filePath),
  readDir: (dirPath) => ipcRenderer.invoke('files:readDir', dirPath),
  watchDir: (dirPath) => ipcRenderer.invoke('files:watchDir', dirPath),
  unwatchDir: (dirPath) => ipcRenderer.invoke('files:unwatchDir', dirPath),
  selectFolder: () => ipcRenderer.invoke('files:selectFolder'),
  createFile: (filePath, content) => ipcRenderer.invoke('files:createFile', filePath, content),
  mkdir: (dirPath) => ipcRenderer.invoke('files:mkdir', dirPath),
  rename: (oldPath, newPath) => ipcRenderer.invoke('files:rename', oldPath, newPath),
  copyFile: (sourcePath, destPath) => ipcRenderer.invoke('files:copyFile', sourcePath, destPath),
  delete: (targetPath) => ipcRenderer.invoke('files:delete', targetPath),

  onFileChange: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, change: FileChangeEvent) =>
      callback(change)
    ipcRenderer.on('files:change', handler)
    return () => ipcRenderer.removeListener('files:change', handler)
  }
}

// â”€â”€â”€ Hooks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const hooksAPI: ElectronAPI['hooks'] = {
  onAgentEvent: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, agentEvent: AgentEvent) =>
      callback(agentEvent)
    ipcRenderer.on('hooks:event', handler)
    return () => ipcRenderer.removeListener('hooks:event', handler)
  },

  onToolCall: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, agentEvent: AgentEvent) => {
      if (agentEvent.type === 'tool_call') {
        callback(agentEvent)
      }
    }
    ipcRenderer.on('hooks:event', handler)
    return () => ipcRenderer.removeListener('hooks:event', handler)
  }
}

// â”€â”€â”€ App â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const appAPI: ElectronAPI['app'] = {
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getPlatform: () => ipcRenderer.invoke('app:getPlatform'),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),

  setTitleBarOverlay: (color, symbolColor) =>
    ipcRenderer.invoke('titlebar:setOverlayColors', color, symbolColor),

  notify: (options) => ipcRenderer.invoke('app:notify', options),

  onMenuEvent: (callback) => {
    const events = [
      'menu:open-folder',
      'menu:new-terminal',
      'menu:command-palette',
      'menu:settings'
    ] as const

    const handlers: Array<() => void> = []

    for (const event of events) {
      const handler = () => callback(event)
      ipcRenderer.on(event, handler)
      handlers.push(() => ipcRenderer.removeListener(event, handler))
    }

    return () => handlers.forEach((cleanup) => cleanup())
  }
}

// â”€â”€â”€ Shell â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const shellAPI: ElectronAPI['shell'] = {
  showItemInFolder: (fullPath) => ipcRenderer.invoke('shell:showItemInFolder', fullPath),
  openExtensionsFolder: () => ipcRenderer.invoke('shell:openExtensionsFolder'),
}

// â”€â”€â”€ Theme â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const themeAPI: ElectronAPI['theme'] = {
  get: () => ipcRenderer.invoke('theme:get'),
  set: (theme) => ipcRenderer.invoke('theme:set', theme),

  onChange: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, theme: AppTheme) => callback(theme)
    ipcRenderer.on('theme:changed', handler)
    return () => ipcRenderer.removeListener('theme:changed', handler)
  }
}

// â”€â”€â”€ Git â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const gitAPI: ElectronAPI['git'] = {
  isRepo: (root) => ipcRenderer.invoke('git:isRepo', root),
  status: (root) => ipcRenderer.invoke('git:status', root),
  branch: (root) => ipcRenderer.invoke('git:branch', root),
  diff: (root, filePath) => ipcRenderer.invoke('git:diff', root, filePath),
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
  diffReview: (root, commitHash) => ipcRenderer.invoke('git:diffReview', root, commitHash),
  fileAtCommit: (root, commitHash, filePath) => ipcRenderer.invoke('git:fileAtCommit', root, commitHash, filePath),
  applyHunk: (root, patchContent) => ipcRenderer.invoke('git:applyHunk', root, patchContent),
  revertHunk: (root, patchContent) => ipcRenderer.invoke('git:revertHunk', root, patchContent),
  revertFile: (root, commitHash, filePath) => ipcRenderer.invoke('git:revertFile', root, commitHash, filePath),
  diffBetween: (root, fromHash, toHash) => ipcRenderer.invoke('git:diffBetween', root, fromHash, toHash),
  changedFilesBetween: (root, fromHash, toHash) => ipcRenderer.invoke('git:changedFilesBetween', root, fromHash, toHash),
  restoreSnapshot: (root, commitHash) => ipcRenderer.invoke('git:restoreSnapshot', root, commitHash),
  createSnapshot: (root, label) => ipcRenderer.invoke('git:createSnapshot', root, label),
  dirtyCount: (root) => ipcRenderer.invoke('git:dirtyCount', root),
}

const electronAPI: ElectronAPI = {
  pty: ptyAPI,
  config: configAPI,
  files: filesAPI,
  hooks: hooksAPI,
  app: appAPI,
  shell: shellAPI,
  theme: themeAPI,
  git: gitAPI,
  ...supplementalApis,
}

// â”€â”€â”€ Expose â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
