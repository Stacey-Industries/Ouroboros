/**
 * webPreload.ts — Entry point for the web preload IIFE shim.
 *
 * This file provides the EXACT same window.electronAPI interface as the Electron
 * preload (preload.ts + preloadSupplementalApis.ts), but routes all IPC calls
 * through a WebSocket JSON-RPC transport instead of Electron's ipcRenderer.
 *
 * Built as an IIFE by vite.webpreload.config.ts; Vite bundles all imports inline.
 * Must execute synchronously before the React app bootstraps.
 */

import {
  buildAppApi,
  buildConfigApi,
  buildFilesApi,
  buildGitApi,
  buildHooksApi,
  buildPtyApis,
  buildShellThemeApis,
} from './webPreloadApis'
import {
  buildAgentChatApi,
  buildLspApi,
  buildMcpApis,
  buildMonitorApis,
  buildOrchestrationApis,
  buildStoreContextApis,
  buildTransactionApis,
  buildWindowExtensionsApis,
} from './webPreloadApis2'
import { showConnectionOverlay, WebSocketTransport } from './webPreloadTransport'

// ─── Monaco Environment ──────────────────────────────────────────────────────

type MonacoEnv = { getWorkerUrl: (_moduleId: string, label: string) => string }
;(window as unknown as { MonacoEnvironment: MonacoEnv }).MonacoEnvironment = {
  getWorkerUrl: (_moduleId: string, label: string) => {
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
  const win = window as unknown as Record<string, unknown>
  if (win['__WEB_TOKEN__']) return win['__WEB_TOKEN__'] as string
  const match = document.cookie.match(/(^| )wsToken=([^;]+)/)
  return match ? match[2] : undefined
}

// ─── Transport + API ─────────────────────────────────────────────────────────

const transport = new WebSocketTransport(
  `ws://${window.location.host}/ws`,
  getAuthToken()
)

const { ptyAPI, codexAPI } = buildPtyApis(transport)
const configAPI = buildConfigApi(transport)
const filesAPI = buildFilesApi(transport)
const hooksAPI = buildHooksApi(transport)
const appAPI = buildAppApi(transport)
const { shellAPI, themeAPI } = buildShellThemeApis(transport)
const gitAPI = buildGitApi(transport)
const { approvalAPI, sessionsAPI, costAPI, usageAPI } = buildTransactionApis(transport)
const { shellHistoryAPI, updaterAPI, crashAPI, perfAPI, symbolAPI } =
  buildMonitorApis(transport)
const lspAPI = buildLspApi(transport)
const { windowAPI, extensionsAPI } = buildWindowExtensionsApis(transport)
const { mcpAPI, mcpStoreAPI } = buildMcpApis(transport)
const { extensionStoreAPI, contextAPI, ideToolsAPI } = buildStoreContextApis(transport)
const agentChatAPI = buildAgentChatApi(transport)
const { codemodeAPI, orchestrationAPI, contextLayerAPI } = buildOrchestrationApis(transport)

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
  codex: codexAPI,
  agentChat: agentChatAPI,
  orchestration: orchestrationAPI,
  contextLayer: contextLayerAPI,
}

// ─── Expose Globally ─────────────────────────────────────────────────────────

document.documentElement.classList.add('web-mode')
;(window as unknown as { electronAPI: typeof electronAPI }).electronAPI = electronAPI

// ─── Connect ─────────────────────────────────────────────────────────────────

transport.connect().catch((err) => {
  console.error('[webPreload] Initial WebSocket connection failed:', err)
  showConnectionOverlay('Connection failed — retrying...')
})
