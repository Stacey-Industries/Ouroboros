/**
 * webPreload.ts — WebSocket-based electronAPI shim for browser access.
 *
 * This file provides the EXACT same window.electronAPI interface as the Electron
 * preload (preload.ts + preloadSupplementalApis.ts), but routes all IPC calls
 * through a WebSocket JSON-RPC transport instead of Electron's ipcRenderer.
 *
 * It must be built as an IIFE and loaded synchronously before the React app.
 */

// ─── WebSocket Transport ────────────────────────────────────────────────────

class WebSocketTransport {
  private ws: WebSocket | null = null
  private requestId = 0
  private pendingRequests = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (reason: Error) => void; timer: number }
  >()
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  private eventListeners = new Map<string, Set<Function>>()
  private reconnectAttempts = 0
  private maxReconnectDelay = 30000
  private connected = false
  private connectPromise: Promise<void> | null = null

  constructor(
    private url: string,
    private authToken?: string
  ) {}

  connect(): Promise<void> {
    if (this.connectPromise) return this.connectPromise

    this.connectPromise = new Promise<void>((resolve, reject) => {
      try {
        const wsUrl = this.authToken ? `${this.url}?token=${this.authToken}` : this.url
        this.ws = new WebSocket(wsUrl)

        this.ws.onopen = () => {
          this.connected = true
          this.reconnectAttempts = 0
          this.connectPromise = null
          hideConnectionOverlay()
          resolve()
        }

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data as string)
        }

        this.ws.onclose = () => {
          this.connected = false
          this.connectPromise = null
          showConnectionOverlay('Disconnected — reconnecting...')
          // Reject all pending requests
          for (const [id, pending] of this.pendingRequests) {
            clearTimeout(pending.timer)
            pending.reject(new Error('WebSocket connection closed'))
            this.pendingRequests.delete(id)
          }
          this.scheduleReconnect()
        }

        this.ws.onerror = () => {
          this.connectPromise = null
          if (!this.connected) {
            reject(new Error('WebSocket connection failed'))
          }
        }
      } catch (err) {
        this.connectPromise = null
        reject(err)
      }
    })

    return this.connectPromise
  }

  async invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect()
    }

    const id = ++this.requestId

    return new Promise<unknown>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new Error(`IPC timeout: ${channel}`))
        }
      }, 30000)

      this.pendingRequests.set(id, { resolve, reject, timer })

      this.ws!.send(
        JSON.stringify({
          jsonrpc: '2.0',
          id,
          method: channel,
          params: args,
        })
      )
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  on(channel: string, callback: Function): () => void {
    if (!this.eventListeners.has(channel)) {
      this.eventListeners.set(channel, new Set())
    }
    this.eventListeners.get(channel)!.add(callback)
    return () => {
      this.eventListeners.get(channel)?.delete(callback)
    }
  }

  private handleMessage(data: string): void {
    let msg: any
    try {
      msg = JSON.parse(data)
    } catch {
      console.warn('[webPreload] Failed to parse WS message:', data)
      return
    }

    // JSON-RPC response to a pending invoke()
    if (msg.id !== undefined && this.pendingRequests.has(msg.id)) {
      const pending = this.pendingRequests.get(msg.id)!
      this.pendingRequests.delete(msg.id)
      clearTimeout(pending.timer)

      if (msg.error) {
        pending.reject(new Error(msg.error.message || 'Unknown RPC error'))
      } else {
        pending.resolve(deserializeResult(msg.result))
      }
      return
    }

    // Server-push event
    if (msg.method === 'event' && msg.params) {
      const { channel, payload } = msg.params
      const listeners = this.eventListeners.get(channel)
      if (listeners) {
        for (const cb of listeners) {
          try {
            cb(payload)
          } catch (err) {
            console.error(`[webPreload] Event handler error on ${channel}:`, err)
          }
        }
      }
    }
  }

  private scheduleReconnect(): void {
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, this.maxReconnectDelay)
    this.reconnectAttempts++
    setTimeout(() => this.connect().catch(() => {}), delay)
  }
}

// ─── Binary Data Handling ────────────────────────────────────────────────────

function deserializeResult(result: unknown): unknown {
  if (result && typeof result === 'object' && (result as any).__binary === true) {
    const base64 = (result as any).data as string
    const binaryStr = atob(base64)
    const bytes = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i)
    }
    return bytes
  }
  return result
}

// ─── Connection Status Overlay ───────────────────────────────────────────────

function showConnectionOverlay(message: string): void {
  let overlay = document.getElementById('ws-connection-overlay')
  if (!overlay) {
    overlay = document.createElement('div')
    overlay.id = 'ws-connection-overlay'
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0;
      background: #f59e0b; color: #000; text-align: center;
      padding: 4px; font-size: 12px; z-index: 99999;
      font-family: system-ui, -apple-system, sans-serif;
    `
    document.body?.prepend(overlay)
  }
  overlay.textContent = message
}

function hideConnectionOverlay(): void {
  document.getElementById('ws-connection-overlay')?.remove()
}

// ─── Monaco Environment ──────────────────────────────────────────────────────

;(window as any).MonacoEnvironment = {
  getWorkerUrl: function (_moduleId: string, label: string) {
    if (label === 'json') return '/monacoeditorwork/json.worker.bundle.js'
    if (label === 'css' || label === 'scss' || label === 'less')
      return '/monacoeditorwork/css.worker.bundle.js'
    if (label === 'html' || label === 'handlebars' || label === 'razor')
      return '/monacoeditorwork/html.worker.bundle.js'
    if (label === 'typescript' || label === 'javascript')
      return '/monacoeditorwork/ts.worker.bundle.js'
    return '/monacoeditorwork/editor.worker.bundle.js'
  },
}

// ─── Auth Token Extraction ───────────────────────────────────────────────────

function getAuthToken(): string | undefined {
  // Prefer the token injected by the server into the HTML page
  if ((window as any).__WEB_TOKEN__) {
    return (window as any).__WEB_TOKEN__
  }
  // Fall back to the wsToken cookie (non-HttpOnly, set by auth middleware)
  const match = document.cookie.match(new RegExp('(^| )wsToken=([^;]+)'))
  return match ? match[2] : undefined
}

// ─── Transport Instance ──────────────────────────────────────────────────────

const transport = new WebSocketTransport(
  `ws://${window.location.host}/ws`,
  getAuthToken()
)

// ─── Desktop-Only Stubs ──────────────────────────────────────────────────────

const DESKTOP_ONLY_ERROR = 'This feature is only available in the desktop app.'

function desktopOnlyStub(channel: string) {
  return async () => ({
    success: false,
    cancelled: true,
    error: `${channel}: ${DESKTOP_ONLY_ERROR}`,
  })
}

function desktopOnlyNoop() {
  return async () => ({ success: true })
}

// ─── PTY API ─────────────────────────────────────────────────────────────────

const ptyAPI = {
  spawn: (id: string, options: any) => transport.invoke('pty:spawn', id, options),
  spawnClaude: (id: string, options: any) => transport.invoke('pty:spawnClaude', id, options),
  write: (id: string, data: string) => transport.invoke('pty:write', id, data),
  resize: (id: string, cols: number, rows: number) =>
    transport.invoke('pty:resize', id, cols, rows),
  kill: (id: string) => transport.invoke('pty:kill', id),
  getCwd: (id: string) => transport.invoke('pty:getCwd', id),
  startRecording: (id: string) => transport.invoke('pty:startRecording', id),
  stopRecording: (id: string) => transport.invoke('pty:stopRecording', id),
  listSessions: () => transport.invoke('pty:listSessions'),

  onData: (id: string, callback: (data: string) => void) =>
    transport.on(`pty:data:${id}`, callback),
  onExit: (
    id: string,
    callback: (result: { exitCode: number | null; signal: number | null }) => void
  ) => transport.on(`pty:exit:${id}`, callback),
  onRecordingState: (id: string, callback: (state: { recording: boolean }) => void) =>
    transport.on(`pty:recordingState:${id}`, callback),
}

// ─── Config API ──────────────────────────────────────────────────────────────

const configAPI = {
  getAll: () => transport.invoke('config:getAll'),
  get: (key: string) => transport.invoke('config:get', key),
  set: (key: string, value: unknown) => transport.invoke('config:set', key, value),
  export: desktopOnlyStub('config:export'),
  import: desktopOnlyStub('config:import'),
  openSettingsFile: desktopOnlyStub('config:openSettingsFile'),

  onExternalChange: (callback: (config: any) => void) =>
    transport.on('config:externalChange', callback),
}

// ─── Files API ───────────────────────────────────────────────────────────────

const filesAPI = {
  writeFile: (filePath: string, data: string) =>
    transport.invoke('files:writeFile', filePath, data),
  saveFile: (filePath: string, content: string) =>
    transport.invoke('files:saveFile', filePath, content),
  readFile: (filePath: string) => transport.invoke('files:readFile', filePath),
  readBinaryFile: (filePath: string) => transport.invoke('files:readBinaryFile', filePath),
  readDir: (dirPath: string) => transport.invoke('files:readDir', dirPath),
  watchDir: (dirPath: string) => transport.invoke('files:watchDir', dirPath),
  unwatchDir: (dirPath: string) => transport.invoke('files:unwatchDir', dirPath),
  selectFolder: desktopOnlyStub('files:selectFolder'),
  createFile: (filePath: string, content?: string) =>
    transport.invoke('files:createFile', filePath, content),
  mkdir: (dirPath: string) => transport.invoke('files:mkdir', dirPath),
  rename: (oldPath: string, newPath: string) =>
    transport.invoke('files:rename', oldPath, newPath),
  copyFile: (sourcePath: string, destPath: string) =>
    transport.invoke('files:copyFile', sourcePath, destPath),
  delete: (targetPath: string) => transport.invoke('files:delete', targetPath),
  softDelete: (targetPath: string) => transport.invoke('files:softDelete', targetPath),
  restoreDeleted: (tempPath: string, originalPath: string) =>
    transport.invoke('files:restoreDeleted', tempPath, originalPath),

  showImageDialog: desktopOnlyStub('files:showImageDialog'),

  onFileChange: (callback: (change: any) => void) => transport.on('files:change', callback),
}

// ─── Hooks API ───────────────────────────────────────────────────────────────

const hooksAPI = {
  onAgentEvent: (callback: (payload: any) => void) => transport.on('hooks:event', callback),

  onToolCall: (callback: (payload: any) => void) => {
    return transport.on('hooks:event', (payload: any) => {
      if (payload.type === 'pre_tool_use' || payload.type === 'post_tool_use') {
        callback(payload)
      }
    })
  },
}

// ─── App API ─────────────────────────────────────────────────────────────────

const appAPI = {
  getVersion: () => transport.invoke('app:getVersion'),
  getPlatform: () => transport.invoke('app:getPlatform'),
  openExternal: (url: string) => {
    window.open(url, '_blank')
    return Promise.resolve({ success: true })
  },

  setTitleBarOverlay: desktopOnlyNoop(),

  notify: (options: any) => transport.invoke('app:notify', options),

  onMenuEvent: (callback: (event: string) => void) => {
    const events = [
      'menu:open-folder',
      'menu:new-terminal',
      'menu:command-palette',
      'menu:settings',
    ]
    const cleanups: Array<() => void> = []
    for (const event of events) {
      cleanups.push(transport.on(event, () => callback(event)))
    }
    return () => cleanups.forEach((cleanup) => cleanup())
  },
}

// ─── Shell API ───────────────────────────────────────────────────────────────

const shellAPI = {
  showItemInFolder: desktopOnlyNoop(),
  openExtensionsFolder: desktopOnlyNoop(),
}

// ─── Theme API ───────────────────────────────────────────────────────────────

const themeAPI = {
  get: () => transport.invoke('theme:get'),
  set: (theme: string) => transport.invoke('theme:set', theme),

  onChange: (callback: (theme: any) => void) => transport.on('theme:changed', callback),
}

// ─── Git API ─────────────────────────────────────────────────────────────────

const gitAPI = {
  isRepo: (root: string) => transport.invoke('git:isRepo', root),
  status: (root: string) => transport.invoke('git:status', root),
  branch: (root: string) => transport.invoke('git:branch', root),
  diff: (root: string, filePath: string) => transport.invoke('git:diff', root, filePath),
  diffRaw: (root: string, filePath: string) => transport.invoke('git:diffRaw', root, filePath),
  blame: (root: string, filePath: string) => transport.invoke('git:blame', root, filePath),
  log: (root: string, filePath?: string, offset?: number) =>
    transport.invoke('git:log', root, filePath, offset ?? 0),
  show: (root: string, hash: string, filePath: string) =>
    transport.invoke('git:show', root, hash, filePath),
  branches: (root: string) => transport.invoke('git:branches', root),
  checkout: (root: string, branch: string) => transport.invoke('git:checkout', root, branch),
  stage: (root: string, filePath: string) => transport.invoke('git:stage', root, filePath),
  unstage: (root: string, filePath: string) => transport.invoke('git:unstage', root, filePath),
  stageAll: (root: string) => transport.invoke('git:stageAll', root),
  unstageAll: (root: string) => transport.invoke('git:unstageAll', root),
  commit: (root: string, message: string) => transport.invoke('git:commit', root, message),
  discardFile: (root: string, filePath: string) =>
    transport.invoke('git:discardFile', root, filePath),
  statusDetailed: (root: string) => transport.invoke('git:statusDetailed', root),
  snapshot: (root: string) => transport.invoke('git:snapshot', root),
  diffReview: (root: string, commitHash?: string) =>
    transport.invoke('git:diffReview', root, commitHash),
  fileAtCommit: (root: string, commitHash: string, filePath: string) =>
    transport.invoke('git:fileAtCommit', root, commitHash, filePath),
  applyHunk: (root: string, patchContent: string) =>
    transport.invoke('git:applyHunk', root, patchContent),
  revertHunk: (root: string, patchContent: string) =>
    transport.invoke('git:revertHunk', root, patchContent),
  stageHunk: (root: string, patchContent: string) =>
    transport.invoke('git:stageHunk', root, patchContent),
  revertFile: (root: string, commitHash: string, filePath: string) =>
    transport.invoke('git:revertFile', root, commitHash, filePath),
  diffBetween: (root: string, fromHash: string, toHash: string) =>
    transport.invoke('git:diffBetween', root, fromHash, toHash),
  changedFilesBetween: (root: string, fromHash: string, toHash: string) =>
    transport.invoke('git:changedFilesBetween', root, fromHash, toHash),
  restoreSnapshot: (root: string, commitHash: string) =>
    transport.invoke('git:restoreSnapshot', root, commitHash),
  createSnapshot: (root: string, label?: string) =>
    transport.invoke('git:createSnapshot', root, label),
  dirtyCount: (root: string) => transport.invoke('git:dirtyCount', root),
}

// ─── Approval API ────────────────────────────────────────────────────────────

const approvalAPI = {
  respond: (requestId: string, decision: string, reason?: string) =>
    transport.invoke('approval:respond', requestId, decision, reason),
  alwaysAllow: (sessionId: string, toolName: string) =>
    transport.invoke('approval:alwaysAllow', sessionId, toolName),
  onRequest: (callback: (request: any) => void) =>
    transport.on('approval:request', callback),
  onResolved: (callback: (resolved: any) => void) =>
    transport.on('approval:resolved', callback),
}

// ─── Sessions API ────────────────────────────────────────────────────────────

const sessionsAPI = {
  save: (session: any) => transport.invoke('sessions:save', session),
  load: () => transport.invoke('sessions:load'),
  delete: (sessionId: string) => transport.invoke('sessions:delete', sessionId),
  export: (session: any, format: string) =>
    transport.invoke('sessions:export', session, format),
}

// ─── Cost API ────────────────────────────────────────────────────────────────

const costAPI = {
  addEntry: (entry: any) => transport.invoke('cost:addEntry', entry),
  getHistory: () => transport.invoke('cost:getHistory'),
  clearHistory: () => transport.invoke('cost:clearHistory'),
}

// ─── Usage API ───────────────────────────────────────────────────────────────

const usageAPI = {
  getSummary: (options: any) => transport.invoke('usage:getSummary', options),
  getSessionDetail: (sessionId: string) =>
    transport.invoke('usage:getSessionDetail', sessionId),
  getRecentSessions: (count: number) => transport.invoke('usage:getRecentSessions', count),
  getWindowedUsage: () => transport.invoke('usage:getWindowedUsage'),
}

// ─── Shell History API ───────────────────────────────────────────────────────

const shellHistoryAPI = {
  read: () => transport.invoke('shellHistory:read'),
}

// ─── Updater API ─────────────────────────────────────────────────────────────

const updaterAPI = {
  check: () => transport.invoke('updater:check'),
  download: () => transport.invoke('updater:download'),
  install: () => transport.invoke('updater:install'),
  onUpdateEvent: (callback: (event: any) => void) =>
    transport.on('updater:event', callback),
}

// ─── Crash API ───────────────────────────────────────────────────────────────

const crashAPI = {
  getCrashLogs: () => transport.invoke('app:getCrashLogs'),
  clearCrashLogs: () => transport.invoke('app:clearCrashLogs'),
  openCrashLogDir: desktopOnlyStub('app:openCrashLogDir'),
  logError: (source: string, message: string, stack?: string) =>
    transport.invoke('app:logError', source, message, stack),
}

// ─── Perf API ────────────────────────────────────────────────────────────────

const perfAPI = {
  ping: () => transport.invoke('perf:ping'),
  subscribe: () => transport.invoke('perf:subscribe'),
  unsubscribe: () => transport.invoke('perf:unsubscribe'),
  onMetrics: (callback: (metrics: any) => void) =>
    transport.on('perf:metrics', callback),
}

// ─── Symbol API ──────────────────────────────────────────────────────────────

const symbolAPI = {
  search: (root: string) => transport.invoke('symbol:search', root),
}

// ─── LSP API ─────────────────────────────────────────────────────────────────

const lspAPI = {
  start: (root: string, language: string) => transport.invoke('lsp:start', root, language),
  stop: (root: string, language: string) => transport.invoke('lsp:stop', root, language),
  completion: (root: string, filePath: string, line: number, character: number) =>
    transport.invoke('lsp:completion', { root, filePath, line, character }),
  hover: (root: string, filePath: string, line: number, character: number) =>
    transport.invoke('lsp:hover', { root, filePath, line, character }),
  definition: (root: string, filePath: string, line: number, character: number) =>
    transport.invoke('lsp:definition', { root, filePath, line, character }),
  diagnostics: (root: string, filePath: string) =>
    transport.invoke('lsp:diagnostics', root, filePath),
  didOpen: (root: string, filePath: string, content: string) =>
    transport.invoke('lsp:didOpen', root, filePath, content),
  didChange: (root: string, filePath: string, content: string) =>
    transport.invoke('lsp:didChange', root, filePath, content),
  didClose: (root: string, filePath: string) =>
    transport.invoke('lsp:didClose', root, filePath),
  getStatus: () => transport.invoke('lsp:getStatus'),
  onDiagnostics: (callback: (data: { filePath: string; diagnostics: any[] }) => void) =>
    transport.on('lsp:diagnostics:push', callback),
  onStatusChange: (callback: (statuses: any[]) => void) =>
    transport.on('lsp:statusChange', callback),
}

// ─── Window API ──────────────────────────────────────────────────────────────

const windowAPI = {
  create: (projectRoot?: string) => transport.invoke('window:new', projectRoot),
  list: () => transport.invoke('window:list'),
  focus: (windowId: number) => transport.invoke('window:focus', windowId),
  close: (windowId: number) => transport.invoke('window:close', windowId),
}

// ─── Extensions API ──────────────────────────────────────────────────────────

const extensionsAPI = {
  list: () => transport.invoke('extensions:list'),
  enable: (name: string) => transport.invoke('extensions:enable', name),
  disable: (name: string) => transport.invoke('extensions:disable', name),
  install: (sourcePath: string) => transport.invoke('extensions:install', sourcePath),
  uninstall: (name: string) => transport.invoke('extensions:uninstall', name),
  getLog: (name: string) => transport.invoke('extensions:getLog', name),
  openFolder: desktopOnlyNoop(),
  activate: (name: string) => transport.invoke('extensions:activate', name),
  commandExecuted: (commandId: string) =>
    transport.invoke('extensions:commandExecuted', commandId),
  onNotification: (callback: (data: { extensionName: string; message: string }) => void) =>
    transport.on('extensions:notification', callback),
}

// ─── MCP API ─────────────────────────────────────────────────────────────────

const mcpAPI = {
  getServers: (projectRoot?: string) =>
    transport.invoke('mcp:getServers', projectRoot ? { projectRoot } : undefined),
  addServer: (name: string, config: any, scope: string, projectRoot?: string) =>
    transport.invoke('mcp:addServer', { name, config, scope, projectRoot }),
  removeServer: (name: string, scope: string, projectRoot?: string) =>
    transport.invoke('mcp:removeServer', { name, scope, projectRoot }),
  updateServer: (name: string, config: any, scope: string, projectRoot?: string) =>
    transport.invoke('mcp:updateServer', { name, config, scope, projectRoot }),
  toggleServer: (name: string, enabled: boolean, scope: string, projectRoot?: string) =>
    transport.invoke('mcp:toggleServer', { name, enabled, scope, projectRoot }),
}

// ─── MCP Store API ───────────────────────────────────────────────────────────

const mcpStoreAPI = {
  search: (query: string, cursor?: string) =>
    transport.invoke('mcpStore:search', query, cursor),
  searchNpm: (query: string, offset?: number) =>
    transport.invoke('mcpStore:searchNpm', query, offset),
  getServerDetails: (name: string) => transport.invoke('mcpStore:getDetails', name),
  installServer: (server: any, scope: string, envOverrides?: any) =>
    transport.invoke('mcpStore:install', server, scope, envOverrides),
  getInstalledServerNames: () => transport.invoke('mcpStore:getInstalled'),
}

// ─── Extension Store API ─────────────────────────────────────────────────────

const extensionStoreAPI = {
  search: (query: string, offset?: number) =>
    transport.invoke('extensionStore:search', query, offset),
  searchMarketplace: (query: string, offset?: number, category?: string) =>
    transport.invoke('extensionStore:searchMarketplace', query, offset, category),
  getDetails: (ns: string, name: string) =>
    transport.invoke('extensionStore:getDetails', ns, name),
  getMarketplaceDetails: (ns: string, name: string) =>
    transport.invoke('extensionStore:getMarketplaceDetails', ns, name),
  install: (ns: string, name: string, version?: string) =>
    transport.invoke('extensionStore:install', ns, name, version),
  installMarketplace: (ns: string, name: string, version?: string) =>
    transport.invoke('extensionStore:installMarketplace', ns, name, version),
  uninstall: (id: string) => transport.invoke('extensionStore:uninstall', id),
  getInstalled: () => transport.invoke('extensionStore:getInstalled'),
  enableContributions: (id: string) =>
    transport.invoke('extensionStore:enableContributions', id),
  disableContributions: (id: string) =>
    transport.invoke('extensionStore:disableContributions', id),
  getThemeContributions: () => transport.invoke('extensionStore:getThemeContributions'),
}

// ─── Context API ─────────────────────────────────────────────────────────────

const contextAPI = {
  scan: (projectRoot: string) => transport.invoke('context:scan', projectRoot),
  generate: (projectRoot: string, options: any) =>
    transport.invoke('context:generate', projectRoot, options),
}

// ─── IDE Tools API ───────────────────────────────────────────────────────────

const ideToolsAPI = {
  respond: (queryId: string, result: any, error?: string) =>
    transport.invoke('ideTools:respond', queryId, result, error),
  onQuery: (callback: (query: any) => void) => transport.on('ide:query', callback),
  getAddress: () => transport.invoke('ideTools:getAddress'),
}

// ─── CodeMode API ────────────────────────────────────────────────────────────

const codemodeAPI = {
  enable: (serverNames: string[], scope: string, projectRoot?: string) =>
    transport.invoke('codemode:enable', { serverNames, scope, projectRoot }),
  disable: () => transport.invoke('codemode:disable'),
  getStatus: () => transport.invoke('codemode:status'),
}

// ─── Agent Chat API ──────────────────────────────────────────────────────────
// Channel names hardcoded from src/main/agentChat/events.ts
// (can't import from main process in browser context)

const agentChatAPI = {
  createThread: (request: any) => transport.invoke('agentChat:createThread', request),
  deleteThread: (threadId: string) => transport.invoke('agentChat:deleteThread', threadId),
  loadThread: (threadId: string) => transport.invoke('agentChat:loadThread', threadId),
  listThreads: (workspaceRoot: string) =>
    transport.invoke('agentChat:listThreads', workspaceRoot),
  sendMessage: (request: any) => transport.invoke('agentChat:sendMessage', request),
  resumeLatestThread: (workspaceRoot: string) =>
    transport.invoke('agentChat:resumeLatestThread', workspaceRoot),
  getLinkedDetails: (link: any) => transport.invoke('agentChat:getLinkedDetails', link),
  branchThread: (threadId: string, fromMessageId: string) =>
    transport.invoke('agentChat:branchThread', threadId, fromMessageId),
  getLinkedTerminal: (threadId: string) =>
    transport.invoke('agentChat:getLinkedTerminal', threadId),
  getBufferedChunks: (threadId: string) =>
    transport.invoke('agentChat:getBufferedChunks', threadId),
  revertToSnapshot: (threadId: string, messageId: string) =>
    transport.invoke('agentChat:revertToSnapshot', threadId, messageId),
  cancelTask: (taskId: string) => transport.invoke('agentChat:cancelTask', taskId),

  onThreadUpdate: (callback: (thread: any) => void) =>
    transport.on('agentChat:thread', callback),
  onMessageUpdate: (callback: (message: any) => void) =>
    transport.on('agentChat:message', callback),
  onStatusChange: (callback: (status: any) => void) =>
    transport.on('agentChat:status', callback),
  onStreamChunk: (callback: (chunk: any) => void) =>
    transport.on('agentChat:stream', callback),
  onEvent: (callback: (event: any) => void) => transport.on('agentChat:event', callback),
}

// ─── Orchestration API ───────────────────────────────────────────────────────
// Channel names hardcoded from src/main/orchestration/events.ts

const orchestrationAPI = {
  previewContext: (request: any) =>
    transport.invoke('orchestration:previewContext', request),
  buildContextPacket: (request: any) =>
    transport.invoke('orchestration:buildContextPacket', request),
  // Routes to agentChat:cancelTask (same as Electron preload)
  cancelTask: (taskId: string) => transport.invoke('agentChat:cancelTask', taskId),
}

// ─── Context Layer API ───────────────────────────────────────────────────────

const contextLayerAPI = {
  onProgress: (callback: (progress: any) => void) =>
    transport.on('contextLayer:progress', callback),
}

// ─── Assemble electronAPI ────────────────────────────────────────────────────

const electronAPI = {
  pty: ptyAPI,
  config: configAPI,
  files: filesAPI,
  hooks: hooksAPI,
  app: appAPI,
  shell: shellAPI,
  theme: themeAPI,
  git: gitAPI,
  approval: approvalAPI,
  sessions: sessionsAPI,
  cost: costAPI,
  usage: usageAPI,
  shellHistory: shellHistoryAPI,
  updater: updaterAPI,
  crash: crashAPI,
  perf: perfAPI,
  symbol: symbolAPI,
  lsp: lspAPI,
  window: windowAPI,
  extensions: extensionsAPI,
  mcp: mcpAPI,
  mcpStore: mcpStoreAPI,
  extensionStore: extensionStoreAPI,
  context: contextAPI,
  ideTools: ideToolsAPI,
  codemode: codemodeAPI,
  agentChat: agentChatAPI,
  orchestration: orchestrationAPI,
  contextLayer: contextLayerAPI,
}

// ─── Expose Globally ─────────────────────────────────────────────────────────

document.documentElement.classList.add('web-mode')
;(window as any).electronAPI = electronAPI

// ─── Connect ─────────────────────────────────────────────────────────────────

transport.connect().catch((err) => {
  console.error('[webPreload] Initial WebSocket connection failed:', err)
  showConnectionOverlay('Connection failed — retrying...')
})
