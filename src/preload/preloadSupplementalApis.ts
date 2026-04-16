import { AGENT_CHAT_INVOKE_CHANNELS } from '@shared/ipc/agentChatChannels';
import { ORCHESTRATION_INVOKE_CHANNELS } from '@shared/ipc/orchestrationChannels';
import { ipcRenderer } from 'electron';

import type {
  ApprovalRequest,
  ApprovalResolved,
  ClaudeMdGenerationStatus,
  ContextLayerProgress,
  ElectronAPI,
  IdeToolQuery,
  LspDiagnostic,
  LspServerStatus,
  PerfMetrics,
  System2IndexProgressEvent,
  UpdaterEvent,
} from '../renderer/types/electron';
import { agentChatApi } from './preloadSupplementalAgentChatApis';
import { aiApi, embeddingApi, observabilityApi, telemetryApi } from './preloadSupplementalAiApis';
import { folderCrudApi } from './preloadSupplementalFolderApis';
import { pinnedContextApi } from './preloadSupplementalPinnedContextApis';
import { rulesAndSkillsApi } from './preloadSupplementalRulesSkills';
import { sessionCrudApi } from './preloadSupplementalSessionApis';

type SupplementalApiKey =
  | 'approval' | 'sessions' | 'cost' | 'usage' | 'shellHistory'
  | 'updater' | 'crash' | 'perf' | 'symbol' | 'lsp'
  | 'window' | 'extensions' | 'mcp' | 'mcpStore' | 'extensionStore'
  | 'context' | 'ideTools' | 'codemode' | 'agentChat' | 'orchestration'
  | 'contextLayer' | 'claudeMd' | 'router' | 'rulesAndSkills'
  | 'ai' | 'embedding' | 'telemetry' | 'observability'
  | 'workspace' | 'system2' | 'sessionCrud' | 'folderCrud' | 'pinnedContext';

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
    getUsageWindowSnapshot: () => ipcRenderer.invoke('usage:getUsageWindowSnapshot'),
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
      ipcRenderer.invoke('app:logError', source, message, stack).catch(() => {
        /* swallow if handler missing */
      }),
  },

  perf: {
    ping: () => ipcRenderer.invoke('perf:ping'),
    subscribe: () => ipcRenderer.invoke('perf:subscribe'),
    unsubscribe: () => ipcRenderer.invoke('perf:unsubscribe'),
    onMetrics: (callback) => onChannel<PerfMetrics>('perf:metrics', callback),
    mark: (phase: string) => ipcRenderer.invoke('perf:mark', phase),
    markFirstRender: () => ipcRenderer.invoke('perf:markFirstRender'),
    getStartupTimings: () => ipcRenderer.invoke('perf:getStartupTimings'),
    getRuntimeMetrics: () => ipcRenderer.invoke('perf:getRuntimeMetrics'),
    getStartupHistory: (limit?: number) => ipcRenderer.invoke('perf:getStartupHistory', { limit }),
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
    getSelf: () => ipcRenderer.invoke('window:getSelf'),
    setProjectRoot: (projectRoot) => ipcRenderer.invoke('window:setProjectRoot', projectRoot),
    getProjectRoots: () => ipcRenderer.invoke('window:getProjectRoots'),
    setProjectRoots: (roots) => ipcRenderer.invoke('window:setProjectRoots', roots),
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
    getIconThemeContributions: () => ipcRenderer.invoke('extensionStore:getIconThemeContributions'),
    getProductIconThemeContributions: () =>
      ipcRenderer.invoke('extensionStore:getProductIconThemeContributions'),
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

  agentChat: agentChatApi,

  orchestration: {
    previewContext: (request: unknown) =>
      ipcRenderer.invoke(ORCHESTRATION_INVOKE_CHANNELS.previewContext, request),
    // Alias for previewContext — both channels execute identical logic on the main side.
    // The renderer only calls previewContext; this alias exists for API symmetry.
    buildContextPacket: (request: unknown) =>
      ipcRenderer.invoke(ORCHESTRATION_INVOKE_CHANNELS.previewContext, request),
    // Routes to agentChat:cancelTask (singleton orchestration) — the old
    // orchestration:cancelTask handler was removed because it created a fresh
    // adapter with empty process Maps and could never kill the running process.
    cancelTask: (taskId: string) =>
      ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.cancelTask, taskId),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- orchestration API surface is intentionally partial; full ElectronAPI.orchestration type includes routes handled elsewhere
  } as any,

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

  router: { getStats: () => ipcRenderer.invoke('router:getStats') },
  rulesAndSkills: rulesAndSkillsApi,
  ai: aiApi,
  embedding: embeddingApi,
  telemetry: telemetryApi,
  observability: observabilityApi,
  workspace: {
    isTrusted: (p: string) => ipcRenderer.invoke('workspace:isTrusted', p),
    trustLevel: (roots: string[]) => ipcRenderer.invoke('workspace:trustLevel', roots),
    trust: (p: string) => ipcRenderer.invoke('workspace:trust', p),
    untrust: (p: string) => ipcRenderer.invoke('workspace:untrust', p),
  },
  system2: {
    onIndexProgress: (callback) =>
      onChannel<System2IndexProgressEvent>('system2:indexProgress', callback),
  },
  sessionCrud: sessionCrudApi,
  folderCrud: folderCrudApi,
  pinnedContext: pinnedContextApi,
};
