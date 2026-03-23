/**
 * webPreloadApisSupplemental.ts — electronAPI namespace builders (second half).
 * Approval, sessions, cost, usage, updater, crash, perf, symbol, LSP,
 * window, extensions, MCP, extension store, context, IDE tools,
 * codemode, agent chat, orchestration, context layer.
 */

import { desktopOnlyNoop, desktopOnlyStub } from './webPreloadApis';
import type { WebSocketTransport } from './webPreloadTransport';

// ─── Approval + Sessions + Cost + Usage ──────────────────────────────────────

export function buildTransactionApis(t: WebSocketTransport) {
  const approvalAPI = {
    respond: (requestId: string, decision: string, reason?: string) =>
      t.invoke('approval:respond', requestId, decision, reason),
    alwaysAllow: (sessionId: string, toolName: string) =>
      t.invoke('approval:alwaysAllow', sessionId, toolName),
    onRequest: (cb: (request: unknown) => void) => t.on('approval:request', cb),
    onResolved: (cb: (resolved: unknown) => void) => t.on('approval:resolved', cb),
  };

  const sessionsAPI = {
    save: (session: unknown) => t.invoke('sessions:save', session),
    load: () => t.invoke('sessions:load'),
    delete: (sessionId: string) => t.invoke('sessions:delete', sessionId),
    export: (session: unknown, format: string) => t.invoke('sessions:export', session, format),
  };

  const costAPI = {
    addEntry: (entry: unknown) => t.invoke('cost:addEntry', entry),
    getHistory: () => t.invoke('cost:getHistory'),
    clearHistory: () => t.invoke('cost:clearHistory'),
  };

  const usageAPI = {
    getSummary: (options: unknown) => t.invoke('usage:getSummary', options),
    getSessionDetail: (sessionId: string) => t.invoke('usage:getSessionDetail', sessionId),
    getRecentSessions: (count: number) => t.invoke('usage:getRecentSessions', count),
    getWindowedUsage: () => t.invoke('usage:getWindowedUsage'),
  };

  return { approvalAPI, sessionsAPI, costAPI, usageAPI };
}

// ─── Updater + Crash + Perf + Symbol APIs ────────────────────────────────────

export function buildMonitorApis(t: WebSocketTransport) {
  const shellHistoryAPI = { read: () => t.invoke('shellHistory:read') };

  const updaterAPI = {
    check: () => t.invoke('updater:check'),
    download: () => t.invoke('updater:download'),
    install: () => t.invoke('updater:install'),
    onUpdateEvent: (cb: (event: unknown) => void) => t.on('updater:event', cb),
  };

  const crashAPI = {
    getCrashLogs: () => t.invoke('app:getCrashLogs'),
    clearCrashLogs: () => t.invoke('app:clearCrashLogs'),
    openCrashLogDir: desktopOnlyStub('app:openCrashLogDir'),
    logError: (source: string, message: string, stack?: string) =>
      t.invoke('app:logError', source, message, stack),
  };

  const perfAPI = {
    ping: () => t.invoke('perf:ping'),
    subscribe: () => t.invoke('perf:subscribe'),
    unsubscribe: () => t.invoke('perf:unsubscribe'),
    onMetrics: (cb: (metrics: unknown) => void) => t.on('perf:metrics', cb),
  };

  const symbolAPI = { search: (root: string) => t.invoke('symbol:search', root) };

  return { shellHistoryAPI, updaterAPI, crashAPI, perfAPI, symbolAPI };
}

// ─── LSP API ─────────────────────────────────────────────────────────────────

type LspDiagnostic = Record<string, unknown>;

export function buildLspApi(t: WebSocketTransport) {
  return {
    start: (root: string, language: string) => t.invoke('lsp:start', root, language),
    stop: (root: string, language: string) => t.invoke('lsp:stop', root, language),
    completion: (root: string, filePath: string, line: number, character: number) =>
      t.invoke('lsp:completion', { root, filePath, line, character }),
    hover: (root: string, filePath: string, line: number, character: number) =>
      t.invoke('lsp:hover', { root, filePath, line, character }),
    definition: (root: string, filePath: string, line: number, character: number) =>
      t.invoke('lsp:definition', { root, filePath, line, character }),
    diagnostics: (root: string, filePath: string) => t.invoke('lsp:diagnostics', root, filePath),
    didOpen: (root: string, filePath: string, content: string) =>
      t.invoke('lsp:didOpen', root, filePath, content),
    didChange: (root: string, filePath: string, content: string) =>
      t.invoke('lsp:didChange', root, filePath, content),
    didClose: (root: string, filePath: string) => t.invoke('lsp:didClose', root, filePath),
    getStatus: () => t.invoke('lsp:getStatus'),
    onDiagnostics: (cb: (data: { filePath: string; diagnostics: LspDiagnostic[] }) => void) =>
      t.on('lsp:diagnostics:push', cb as (v: unknown) => void),
    onStatusChange: (cb: (statuses: unknown[]) => void) =>
      t.on('lsp:statusChange', cb as (v: unknown) => void),
  };
}

// ─── Window + Extensions APIs ────────────────────────────────────────────────

export function buildWindowExtensionsApis(t: WebSocketTransport) {
  const windowAPI = {
    create: (projectRoot?: string) => t.invoke('window:new', projectRoot),
    list: () => t.invoke('window:list'),
    focus: (windowId: number) => t.invoke('window:focus', windowId),
    close: (windowId: number) => t.invoke('window:close', windowId),
  };
  const extensionsAPI = {
    list: () => t.invoke('extensions:list'),
    enable: (name: string) => t.invoke('extensions:enable', name),
    disable: (name: string) => t.invoke('extensions:disable', name),
    install: (sourcePath: string) => t.invoke('extensions:install', sourcePath),
    uninstall: (name: string) => t.invoke('extensions:uninstall', name),
    getLog: (name: string) => t.invoke('extensions:getLog', name),
    openFolder: desktopOnlyNoop(),
    activate: (name: string) => t.invoke('extensions:activate', name),
    commandExecuted: (commandId: string) => t.invoke('extensions:commandExecuted', commandId),
    onNotification: (cb: (data: { extensionName: string; message: string }) => void) =>
      t.on('extensions:notification', cb as (v: unknown) => void),
  };
  return { windowAPI, extensionsAPI };
}

/** @deprecated Use buildLspApi / buildWindowExtensionsApis directly */
export function buildToolingApis(t: WebSocketTransport) {
  return { lspAPI: buildLspApi(t), ...buildWindowExtensionsApis(t) };
}

// ─── MCP + MCP Store APIs ────────────────────────────────────────────────────

export function buildMcpApis(t: WebSocketTransport) {
  const mcpAPI = {
    getServers: (projectRoot?: string) =>
      t.invoke('mcp:getServers', projectRoot ? { projectRoot } : undefined),
    addServer: (name: string, config: unknown, scope: string, projectRoot?: string) =>
      t.invoke('mcp:addServer', { name, config, scope, projectRoot }),
    removeServer: (name: string, scope: string, projectRoot?: string) =>
      t.invoke('mcp:removeServer', { name, scope, projectRoot }),
    updateServer: (name: string, config: unknown, scope: string, projectRoot?: string) =>
      t.invoke('mcp:updateServer', { name, config, scope, projectRoot }),
    toggleServer: (name: string, enabled: boolean, scope: string, projectRoot?: string) =>
      t.invoke('mcp:toggleServer', { name, enabled, scope, projectRoot }),
  };
  const mcpStoreAPI = {
    search: (query: string, cursor?: string) => t.invoke('mcpStore:search', query, cursor),
    searchNpm: (query: string, offset?: number) => t.invoke('mcpStore:searchNpm', query, offset),
    getServerDetails: (name: string) => t.invoke('mcpStore:getDetails', name),
    installServer: (server: unknown, scope: string, envOverrides?: unknown) =>
      t.invoke('mcpStore:install', server, scope, envOverrides),
    getInstalledServerNames: () => t.invoke('mcpStore:getInstalled'),
  };
  return { mcpAPI, mcpStoreAPI };
}

// ─── Extension Store + Context + IDE Tools APIs ───────────────────────────────

export function buildStoreContextApis(t: WebSocketTransport) {
  const extensionStoreAPI = {
    search: (query: string, offset?: number) => t.invoke('extensionStore:search', query, offset),
    searchMarketplace: (query: string, offset?: number, category?: string) =>
      t.invoke('extensionStore:searchMarketplace', query, offset, category),
    getDetails: (ns: string, name: string) => t.invoke('extensionStore:getDetails', ns, name),
    getMarketplaceDetails: (ns: string, name: string) =>
      t.invoke('extensionStore:getMarketplaceDetails', ns, name),
    install: (ns: string, name: string, version?: string) =>
      t.invoke('extensionStore:install', ns, name, version),
    installMarketplace: (ns: string, name: string, version?: string) =>
      t.invoke('extensionStore:installMarketplace', ns, name, version),
    uninstall: (id: string) => t.invoke('extensionStore:uninstall', id),
    getInstalled: () => t.invoke('extensionStore:getInstalled'),
    enableContributions: (id: string) => t.invoke('extensionStore:enableContributions', id),
    disableContributions: (id: string) => t.invoke('extensionStore:disableContributions', id),
    getThemeContributions: () => t.invoke('extensionStore:getThemeContributions'),
  };
  const contextAPI = {
    scan: (projectRoot: string) => t.invoke('context:scan', projectRoot),
    generate: (projectRoot: string, options: unknown) =>
      t.invoke('context:generate', projectRoot, options),
  };
  const ideToolsAPI = {
    respond: (queryId: string, result: unknown, error?: string) =>
      t.invoke('ideTools:respond', queryId, result, error),
    onQuery: (cb: (query: unknown) => void) => t.on('ide:query', cb),
    getAddress: () => t.invoke('ideTools:getAddress'),
  };
  return { extensionStoreAPI, contextAPI, ideToolsAPI };
}

/** @deprecated Use buildMcpApis / buildStoreContextApis directly */
export function buildIntegrationApis(t: WebSocketTransport) {
  return { ...buildMcpApis(t), ...buildStoreContextApis(t) };
}

// ─── Agent Chat API ──────────────────────────────────────────────────────────
// Channel names hardcoded from src/main/agentChat/events.ts

export function buildAgentChatApi(t: WebSocketTransport) {
  return {
    createThread: (request: unknown) => t.invoke('agentChat:createThread', request),
    deleteThread: (threadId: string) => t.invoke('agentChat:deleteThread', threadId),
    loadThread: (threadId: string) => t.invoke('agentChat:loadThread', threadId),
    listThreads: (workspaceRoot: string) => t.invoke('agentChat:listThreads', workspaceRoot),
    sendMessage: (request: unknown) => t.invoke('agentChat:sendMessage', request),
    resumeLatestThread: (workspaceRoot: string) =>
      t.invoke('agentChat:resumeLatestThread', workspaceRoot),
    getLinkedDetails: (link: unknown) => t.invoke('agentChat:getLinkedDetails', link),
    branchThread: (threadId: string, fromMessageId: string) =>
      t.invoke('agentChat:branchThread', threadId, fromMessageId),
    getLinkedTerminal: (threadId: string) => t.invoke('agentChat:getLinkedTerminal', threadId),
    getBufferedChunks: (threadId: string) => t.invoke('agentChat:getBufferedChunks', threadId),
    revertToSnapshot: (threadId: string, messageId: string) =>
      t.invoke('agentChat:revertToSnapshot', threadId, messageId),
    cancelTask: (taskId: string) => t.invoke('agentChat:cancelTask', taskId),
    onThreadUpdate: (cb: (thread: unknown) => void) => t.on('agentChat:thread', cb),
    onMessageUpdate: (cb: (message: unknown) => void) => t.on('agentChat:message', cb),
    onStatusChange: (cb: (status: unknown) => void) => t.on('agentChat:status', cb),
    onStreamChunk: (cb: (chunk: unknown) => void) => t.on('agentChat:stream', cb),
    onEvent: (cb: (event: unknown) => void) => t.on('agentChat:event', cb),
  };
}

// ─── CodeMode + Orchestration + Context Layer APIs ───────────────────────────
// Orchestration channel names hardcoded from src/main/orchestration/events.ts

export function buildOrchestrationApis(t: WebSocketTransport) {
  const codemodeAPI = {
    enable: (serverNames: string[], scope: string, projectRoot?: string) =>
      t.invoke('codemode:enable', { serverNames, scope, projectRoot }),
    disable: () => t.invoke('codemode:disable'),
    getStatus: () => t.invoke('codemode:status'),
  };
  const orchestrationAPI = {
    previewContext: (request: unknown) => t.invoke('orchestration:previewContext', request),
    buildContextPacket: (request: unknown) => t.invoke('orchestration:buildContextPacket', request),
    // Routes to agentChat:cancelTask (same as Electron preload)
    cancelTask: (taskId: string) => t.invoke('agentChat:cancelTask', taskId),
  };
  const contextLayerAPI = {
    onProgress: (cb: (progress: unknown) => void) => t.on('contextLayer:progress', cb),
  };
  return { codemodeAPI, orchestrationAPI, contextLayerAPI };
}

/** @deprecated Use buildAgentChatApi / buildOrchestrationApis directly */
export function buildAgentApis(t: WebSocketTransport) {
  return { agentChatAPI: buildAgentChatApi(t), ...buildOrchestrationApis(t) };
}
