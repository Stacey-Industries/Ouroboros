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
} from './webPreloadApis';
import { buildAuthApi, buildProvidersApi } from './webPreloadApisAuth';
import { buildClaudeMdApi } from './webPreloadApisClaudeMd';
import { buildRulesAndSkillsApi } from './webPreloadApisRulesSkills';
import {
  buildAgentChatApi,
  buildLspApi,
  buildMcpApis,
  buildMobileAccessApi,
  buildMonitorApis,
  buildOrchestrationApis,
  buildStoreContextApis,
  buildTransactionApis,
  buildWindowExtensionsApis,
} from './webPreloadApisSupplemental';
import { showConnectionOverlay, WebSocketTransport } from './webPreloadTransport';

// ─── Monaco Environment ──────────────────────────────────────────────────────

type MonacoEnv = { getWorkerUrl: (_moduleId: string, label: string) => string };
(window as unknown as { MonacoEnvironment: MonacoEnv }).MonacoEnvironment = {
  getWorkerUrl: (_moduleId: string, label: string) => {
    if (label === 'json') return '/monacoeditorwork/json.worker.bundle.js';
    if (label === 'css' || label === 'scss' || label === 'less')
      return '/monacoeditorwork/css.worker.bundle.js';
    if (label === 'html' || label === 'handlebars' || label === 'razor')
      return '/monacoeditorwork/html.worker.bundle.js';
    if (label === 'typescript' || label === 'javascript')
      return '/monacoeditorwork/ts.worker.bundle.js';
    return '/monacoeditorwork/editor.worker.bundle.js';
  },
};

// ─── WS Ticket Fetch ─────────────────────────────────────────────────────────

interface WsTicketResponse {
  ticket: string;
  expiresInMs: number;
}

async function fetchWsTicket(): Promise<string> {
  const res = await fetch('/api/ws-ticket', { method: 'POST', credentials: 'same-origin' });
  if (!res.ok) {
    throw new Error(`Failed to fetch WS ticket: HTTP ${res.status}`);
  }
  const body = (await res.json()) as WsTicketResponse;
  return body.ticket;
}

// ─── Transport + API ─────────────────────────────────────────────────────────

const transport = new WebSocketTransport(`ws://${window.location.host}/ws`);
transport.setTicketFetcher(fetchWsTicket);

const { ptyAPI, codexAPI } = buildPtyApis(transport);
const configAPI = buildConfigApi(transport);
const filesAPI = buildFilesApi(transport);
const hooksAPI = buildHooksApi(transport);
const appAPI = buildAppApi(transport);
const { shellAPI, themeAPI } = buildShellThemeApis(transport);
const gitAPI = buildGitApi(transport);
const { approvalAPI, sessionsAPI, costAPI, usageAPI } = buildTransactionApis(transport);
const { shellHistoryAPI, updaterAPI, crashAPI, perfAPI, symbolAPI } = buildMonitorApis(transport);
const lspAPI = buildLspApi(transport);
const { windowAPI, extensionsAPI } = buildWindowExtensionsApis(transport);
const { mcpAPI, mcpStoreAPI } = buildMcpApis(transport);
const { extensionStoreAPI, contextAPI, ideToolsAPI } = buildStoreContextApis(transport);
const agentChatAPI = buildAgentChatApi(transport);
const { codemodeAPI, orchestrationAPI, contextLayerAPI } = buildOrchestrationApis(transport);
const authAPI = buildAuthApi(transport);
const providersAPI = buildProvidersApi(transport);
const claudeMdAPI = buildClaudeMdApi(transport);
const rulesAndSkillsAPI = buildRulesAndSkillsApi(transport);
const mobileAccessAPI = buildMobileAccessApi(transport);

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
  auth: authAPI,
  providers: providersAPI,
  claudeMd: claudeMdAPI,
  rulesAndSkills: rulesAndSkillsAPI,
  mobileAccess: mobileAccessAPI,
};

// ─── Expose Globally ─────────────────────────────────────────────────────────

document.documentElement.classList.add('web-mode');
(window as unknown as { electronAPI: typeof electronAPI }).electronAPI = electronAPI;

// ─── Connect ─────────────────────────────────────────────────────────────────

fetchWsTicket()
  .then((ticket) => transport.connectWithTicket(ticket))
  .catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[webPreload] WS ticket fetch failed, connection aborted:', msg);
    showConnectionOverlay('Authentication failed — please refresh the page.');
  });
