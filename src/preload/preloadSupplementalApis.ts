import { ipcRenderer } from 'electron'
import type {
  ApprovalRequest,
  ApprovalResolved,
  ElectronAPI,
  IdeToolQuery,
  LspDiagnostic,
  LspServerStatus,
  PerfMetrics,
  UpdaterEvent,
} from '../renderer/types/electron'

type SupplementalApiKey =
  | 'approval'
  | 'sessions'
  | 'cost'
  | 'usage'
  | 'shellHistory'
  | 'updater'
  | 'crash'
  | 'perf'
  | 'symbol'
  | 'lsp'
  | 'window'
  | 'extensions'
  | 'mcp'
  | 'context'
  | 'ideTools'
  | 'codemode'

type SupplementalApis = Pick<ElectronAPI, SupplementalApiKey>

function onChannel<T>(channel: string, callback: (payload: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

export const supplementalApis: SupplementalApis = {
  approval: {
    respond: (requestId, decision, reason) =>
      ipcRenderer.invoke('approval:respond', requestId, decision, reason),
    alwaysAllow: (sessionId, toolName) =>
      ipcRenderer.invoke('approval:alwaysAllow', sessionId, toolName),
    onRequest: (callback) => onChannel<ApprovalRequest>('approval:request', callback),
    onResolved: (callback) => onChannel<ApprovalResolved>('approval:resolved', callback),
  },

  sessions: {
    save: (session) => ipcRenderer.invoke('sessions:save', session),
    load: () => ipcRenderer.invoke('sessions:load'),
    delete: (sessionId) => ipcRenderer.invoke('sessions:delete', sessionId),
    export: (session, format) => ipcRenderer.invoke('sessions:export', session, format),
  },

  cost: {
    addEntry: (entry) => ipcRenderer.invoke('cost:addEntry', entry),
    getHistory: () => ipcRenderer.invoke('cost:getHistory'),
    clearHistory: () => ipcRenderer.invoke('cost:clearHistory'),
  },

  usage: {
    getSummary: (options) => ipcRenderer.invoke('usage:getSummary', options),
    getSessionDetail: (sessionId) => ipcRenderer.invoke('usage:getSessionDetail', sessionId),
    getRecentSessions: (count) => ipcRenderer.invoke('usage:getRecentSessions', count),
    getWindowedUsage: () => ipcRenderer.invoke('usage:getWindowedUsage'),
  },

  shellHistory: {
    read: () => ipcRenderer.invoke('shellHistory:read'),
  },

  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
    onUpdateEvent: (callback) => onChannel<UpdaterEvent>('updater:event', callback),
  },

  crash: {
    getCrashLogs: () => ipcRenderer.invoke('app:getCrashLogs'),
    clearCrashLogs: () => ipcRenderer.invoke('app:clearCrashLogs'),
    openCrashLogDir: () => ipcRenderer.invoke('app:openCrashLogDir'),
    logError: (source, message, stack) => ipcRenderer.invoke('app:logError', source, message, stack),
  },

  perf: {
    ping: () => ipcRenderer.invoke('perf:ping'),
    onMetrics: (callback) => onChannel<PerfMetrics>('perf:metrics', callback),
  },

  symbol: {
    search: (root) => ipcRenderer.invoke('symbol:search', root),
  },

  lsp: {
    start: (root, language) => ipcRenderer.invoke('lsp:start', root, language),
    stop: (root, language) => ipcRenderer.invoke('lsp:stop', root, language),
    completion: (root, filePath, line, character) =>
      ipcRenderer.invoke('lsp:completion', { root, filePath, line, character }),
    hover: (root, filePath, line, character) =>
      ipcRenderer.invoke('lsp:hover', { root, filePath, line, character }),
    definition: (root, filePath, line, character) =>
      ipcRenderer.invoke('lsp:definition', { root, filePath, line, character }),
    diagnostics: (root, filePath) => ipcRenderer.invoke('lsp:diagnostics', root, filePath),
    didOpen: (root, filePath, content) => ipcRenderer.invoke('lsp:didOpen', root, filePath, content),
    didChange: (root, filePath, content) => ipcRenderer.invoke('lsp:didChange', root, filePath, content),
    didClose: (root, filePath) => ipcRenderer.invoke('lsp:didClose', root, filePath),
    getStatus: () => ipcRenderer.invoke('lsp:getStatus'),
    onDiagnostics: (callback) =>
      onChannel<{ filePath: string; diagnostics: LspDiagnostic[] }>('lsp:diagnostics:push', callback),
    onStatusChange: (callback) => onChannel<LspServerStatus[]>('lsp:statusChange', callback),
  },

  window: {
    create: (projectRoot) => ipcRenderer.invoke('window:new', projectRoot),
    list: () => ipcRenderer.invoke('window:list'),
    focus: (windowId) => ipcRenderer.invoke('window:focus', windowId),
    close: (windowId) => ipcRenderer.invoke('window:close', windowId),
  },

  extensions: {
    list: () => ipcRenderer.invoke('extensions:list'),
    enable: (name) => ipcRenderer.invoke('extensions:enable', name),
    disable: (name) => ipcRenderer.invoke('extensions:disable', name),
    install: (sourcePath) => ipcRenderer.invoke('extensions:install', sourcePath),
    uninstall: (name) => ipcRenderer.invoke('extensions:uninstall', name),
    getLog: (name) => ipcRenderer.invoke('extensions:getLog', name),
    openFolder: () => ipcRenderer.invoke('extensions:openFolder'),
    activate: (name) => ipcRenderer.invoke('extensions:activate', name),
    commandExecuted: (commandId) => ipcRenderer.invoke('extensions:commandExecuted', commandId),
    onNotification: (callback) =>
      onChannel<{ extensionName: string; message: string }>('extensions:notification', callback),
  },

  mcp: {
    getServers: (projectRoot) => ipcRenderer.invoke('mcp:getServers', projectRoot ? { projectRoot } : undefined),
    addServer: (name, config, scope, projectRoot) => ipcRenderer.invoke('mcp:addServer', { name, config, scope, projectRoot }),
    removeServer: (name, scope, projectRoot) => ipcRenderer.invoke('mcp:removeServer', { name, scope, projectRoot }),
    updateServer: (name, config, scope, projectRoot) => ipcRenderer.invoke('mcp:updateServer', { name, config, scope, projectRoot }),
    toggleServer: (name, enabled, scope, projectRoot) => ipcRenderer.invoke('mcp:toggleServer', { name, enabled, scope, projectRoot }),
  },

  context: {
    scan: (projectRoot) => ipcRenderer.invoke('context:scan', projectRoot),
    generate: (projectRoot, options) => ipcRenderer.invoke('context:generate', projectRoot, options),
  },

  ideTools: {
    respond: (queryId, result, error) =>
      ipcRenderer.invoke('ideTools:respond', queryId, result, error),
    onQuery: (callback) => onChannel<IdeToolQuery>('ide:query', callback),
    getAddress: () => ipcRenderer.invoke('ideTools:getAddress'),
  },

  codemode: {
    enable: (serverNames, scope, projectRoot) =>
      ipcRenderer.invoke('codemode:enable', { serverNames, scope, projectRoot }),
    disable: () => ipcRenderer.invoke('codemode:disable'),
    getStatus: () => ipcRenderer.invoke('codemode:status'),
  },
}
