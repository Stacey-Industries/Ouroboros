import {
  AGENT_CHAT_EVENT_CHANNELS,
  AGENT_CHAT_INVOKE_CHANNELS,
} from '@shared/ipc/agentChatChannels';
import { ORCHESTRATION_INVOKE_CHANNELS } from '@shared/ipc/orchestrationChannels';
import { ipcRenderer } from 'electron';

import type {
  AgentChatEvent,
  AgentChatMessageRecord,
  AgentChatStreamChunk,
  AgentChatThreadRecord,
  AgentChatThreadStatusSnapshot,
  ApprovalRequest,
  ApprovalResolved,
  ClaudeMdGenerationStatus,
  ContextLayerProgress,
  ElectronAPI,
  IdeToolQuery,
  LspDiagnostic,
  LspServerStatus,
  PerfMetrics,
  UpdaterEvent,
} from '../renderer/types/electron';

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
  | 'mcpStore'
  | 'extensionStore'
  | 'context'
  | 'ideTools'
  | 'codemode'
  | 'agentChat'
  | 'orchestration'
  | 'contextLayer'
  | 'claudeMd'
  | 'rulesAndSkills';

type SupplementalApis = Pick<ElectronAPI, SupplementalApiKey>;

function onChannel<T>(channel: string, callback: (payload: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
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
    logError: (source, message, stack) =>
      ipcRenderer.invoke('app:logError', source, message, stack),
  },

  perf: {
    ping: () => ipcRenderer.invoke('perf:ping'),
    subscribe: () => ipcRenderer.invoke('perf:subscribe'),
    unsubscribe: () => ipcRenderer.invoke('perf:unsubscribe'),
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
    didOpen: (root, filePath, content) =>
      ipcRenderer.invoke('lsp:didOpen', root, filePath, content),
    didChange: (root, filePath, content) =>
      ipcRenderer.invoke('lsp:didChange', root, filePath, content),
    didClose: (root, filePath) => ipcRenderer.invoke('lsp:didClose', root, filePath),
    getStatus: () => ipcRenderer.invoke('lsp:getStatus'),
    onDiagnostics: (callback) =>
      onChannel<{ filePath: string; diagnostics: LspDiagnostic[] }>(
        'lsp:diagnostics:push',
        callback,
      ),
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
    getServers: (projectRoot) =>
      ipcRenderer.invoke('mcp:getServers', projectRoot ? { projectRoot } : undefined),
    addServer: (name, config, scope, projectRoot) =>
      ipcRenderer.invoke('mcp:addServer', { name, config, scope, projectRoot }),
    removeServer: (name, scope, projectRoot) =>
      ipcRenderer.invoke('mcp:removeServer', { name, scope, projectRoot }),
    updateServer: (name, config, scope, projectRoot) =>
      ipcRenderer.invoke('mcp:updateServer', { name, config, scope, projectRoot }),
    toggleServer: (name, enabled, scope, projectRoot) =>
      ipcRenderer.invoke('mcp:toggleServer', { name, enabled, scope, projectRoot }),
  },

  mcpStore: {
    search: (query, cursor) => ipcRenderer.invoke('mcpStore:search', query, cursor),
    searchNpm: (query, offset) => ipcRenderer.invoke('mcpStore:searchNpm', query, offset),
    getServerDetails: (name) => ipcRenderer.invoke('mcpStore:getDetails', name),
    installServer: (server, scope, envOverrides) =>
      ipcRenderer.invoke('mcpStore:install', server, scope, envOverrides),
    getInstalledServerNames: () => ipcRenderer.invoke('mcpStore:getInstalled'),
  },

  extensionStore: {
    search: (query, offset) => ipcRenderer.invoke('extensionStore:search', query, offset),
    searchMarketplace: (query, offset, category) =>
      ipcRenderer.invoke('extensionStore:searchMarketplace', query, offset, category),
    getDetails: (ns, name) => ipcRenderer.invoke('extensionStore:getDetails', ns, name),
    getMarketplaceDetails: (ns, name) =>
      ipcRenderer.invoke('extensionStore:getMarketplaceDetails', ns, name),
    install: (ns, name, version) => ipcRenderer.invoke('extensionStore:install', ns, name, version),
    installMarketplace: (ns, name, version) =>
      ipcRenderer.invoke('extensionStore:installMarketplace', ns, name, version),
    uninstall: (id) => ipcRenderer.invoke('extensionStore:uninstall', id),
    getInstalled: () => ipcRenderer.invoke('extensionStore:getInstalled'),
    enableContributions: (id) => ipcRenderer.invoke('extensionStore:enableContributions', id),
    disableContributions: (id) => ipcRenderer.invoke('extensionStore:disableContributions', id),
    getThemeContributions: () => ipcRenderer.invoke('extensionStore:getThemeContributions'),
  },

  context: {
    scan: (projectRoot) => ipcRenderer.invoke('context:scan', projectRoot),
    generate: (projectRoot, options) =>
      ipcRenderer.invoke('context:generate', projectRoot, options),
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

  agentChat: {
    createThread: (request) => ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.createThread, request),
    deleteThread: (threadId) =>
      ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.deleteThread, threadId),
    loadThread: (threadId) => ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.loadThread, threadId),
    listThreads: (workspaceRoot) =>
      ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.listThreads, workspaceRoot),
    sendMessage: (request) => ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.sendMessage, request),
    resumeLatestThread: (workspaceRoot) =>
      ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.resumeLatestThread, workspaceRoot),
    getLinkedDetails: (link) =>
      ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.getLinkedDetails, link),
    branchThread: (threadId, fromMessageId) =>
      ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.branchThread, threadId, fromMessageId),
    getLinkedTerminal: (threadId) =>
      ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.getLinkedTerminal, threadId),
    getBufferedChunks: (threadId) =>
      ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.getBufferedChunks, threadId),
    revertToSnapshot: (threadId, messageId) =>
      ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.revertToSnapshot, threadId, messageId),
    cancelTask: (taskId) => ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.cancelTask, taskId),
    listMemories: (workspaceRoot) =>
      ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.listMemories, workspaceRoot),
    createMemory: (workspaceRoot, entry) =>
      ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.createMemory, workspaceRoot, entry),
    updateMemory: (workspaceRoot, memoryId, updates) =>
      ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.updateMemory, workspaceRoot, memoryId, updates),
    deleteMemory: (workspaceRoot, memoryId) =>
      ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.deleteMemory, workspaceRoot, memoryId),
    onThreadUpdate: (callback) =>
      onChannel<AgentChatThreadRecord>(AGENT_CHAT_EVENT_CHANNELS.thread, callback),
    onMessageUpdate: (callback) =>
      onChannel<AgentChatMessageRecord>(AGENT_CHAT_EVENT_CHANNELS.message, callback),
    onStatusChange: (callback) =>
      onChannel<AgentChatThreadStatusSnapshot>(AGENT_CHAT_EVENT_CHANNELS.status, callback),
    onStreamChunk: (callback) =>
      onChannel<AgentChatStreamChunk>(AGENT_CHAT_EVENT_CHANNELS.stream, callback),
    onEvent: (callback) => onChannel<AgentChatEvent>(AGENT_CHAT_EVENT_CHANNELS.event, callback),
  },

  orchestration: {
    previewContext: (request) =>
      ipcRenderer.invoke(ORCHESTRATION_INVOKE_CHANNELS.previewContext, request),
    buildContextPacket: (request) =>
      ipcRenderer.invoke(ORCHESTRATION_INVOKE_CHANNELS.buildContextPacket, request),
    // Routes to agentChat:cancelTask (singleton orchestration) — the old
    // orchestration:cancelTask handler was removed because it created a fresh
    // adapter with empty process Maps and could never kill the running process.
    cancelTask: (taskId) => ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.cancelTask, taskId),
  },

  contextLayer: {
    onProgress: (callback) => onChannel<ContextLayerProgress>('contextLayer:progress', callback),
  },

  claudeMd: {
    generate: (projectRoot, options) =>
      ipcRenderer.invoke('claudeMd:generate', projectRoot, options),
    generateForDir: (projectRoot, dirPath) =>
      ipcRenderer.invoke('claudeMd:generateForDir', projectRoot, dirPath),
    getStatus: () => ipcRenderer.invoke('claudeMd:getStatus'),
    onStatusChange: (callback) =>
      onChannel<ClaudeMdGenerationStatus>('claudeMd:statusChange', callback),
  },

  rulesAndSkills: {
    listRules: (projectRoot: string) =>
      ipcRenderer.invoke('rules:list', projectRoot),
    readRule: (projectRoot: string, type: string) =>
      ipcRenderer.invoke('rules:read', projectRoot, type),
    createRule: (projectRoot: string, type: string) =>
      ipcRenderer.invoke('rules:create', projectRoot, type),
    listSkills: (projectRoot: string) =>
      ipcRenderer.invoke('skills:list', projectRoot),
    expandSkill: (projectRoot: string, skillId: string, params: Record<string, string>, provider?: string) =>
      ipcRenderer.invoke('skills:expand', projectRoot, skillId, params, provider),
    createSkill: (projectRoot: string, name: string) =>
      ipcRenderer.invoke('skills:create', projectRoot, name),
    getHooksConfig: (scope: string, projectRoot?: string) =>
      ipcRenderer.invoke('hooks:getConfig', scope, projectRoot),
    addHook: (args: { scope: string; eventType: string; command: string; matcher?: string; projectRoot?: string }) =>
      ipcRenderer.invoke('hooks:addHook', args),
    removeHook: (args: { scope: string; eventType: string; index: number; projectRoot?: string }) =>
      ipcRenderer.invoke('hooks:removeHook', args),
    onChanged: (callback: () => void) =>
      onChannel<void>('rulesAndSkills:changed', callback),
  },
};
