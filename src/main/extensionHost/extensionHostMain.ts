/**
 * extensionHostMain.ts — ExtensionHost utility process entry point.
 *
 * Loads extension code into a Node `vm` context, runs it isolated from main,
 * and forwards console output and ouroboros API calls back via parentPort.
 *
 * Phase 5 (MVP) scope: activate, deactivate, dispatchEvent, ui.showNotification,
 * config.get against a snapshot. Files / terminal / commands come in Phase 6.
 *
 * The bootstrap is wrapped in a parentPort guard so the file is importable
 * from tests without an Electron parent.
 */

import vm from 'vm';

import type {
  ExtensionHostEvent,
  ExtensionHostOutbound,
  ExtensionHostRequest,
  ExtensionHostResponse,
  ExtensionPackage,
} from './extensionHostProtocol';
import {
  appendHostLog,
  buildHostSandboxAPI,
  getHostSafeSandboxGlobals,
  type HostExtensionState,
  type SandboxHooks,
} from './extensionHostSandbox';

// ── Per-extension state held inside the host ──

interface HostExtension {
  state: HostExtensionState;
  context: vm.Context | null;
  status: 'active' | 'inactive' | 'error';
  errorMessage?: string;
}

const extensions = new Map<string, HostExtension>();

// ── parentPort messaging ──

declare const process: NodeJS.Process & {
  parentPort?: { postMessage: (msg: unknown) => void; on: (e: 'message', cb: (m: unknown) => void) => void };
};

function post(msg: ExtensionHostOutbound): void {
  process.parentPort?.postMessage(msg);
}

function postError(requestId: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  post({ type: 'error', requestId, message });
}

// ── Pending API calls (Host → Main → response) ──

interface PendingApiCall {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

const pendingApiCalls = new Map<string, PendingApiCall>();
let apiCallCounter = 0;

function nextCallId(): string {
  apiCallCounter += 1;
  return `${Date.now().toString(36)}-${apiCallCounter}`;
}

function requestApiCall(
  extName: string,
  namespace: 'files' | 'terminal',
  method: string,
  args: unknown[],
): Promise<unknown> {
  const callId = nextCallId();
  return new Promise((resolve, reject) => {
    pendingApiCalls.set(callId, { resolve, reject });
    post({ type: 'apiCall', callId, extName, namespace, method, args });
  });
}

function resolveApiCall(callId: string, result: unknown): void {
  const pending = pendingApiCalls.get(callId);
  if (!pending) return;
  pendingApiCalls.delete(callId);
  pending.resolve(result);
}

function rejectApiCall(callId: string, message: string): void {
  const pending = pendingApiCalls.get(callId);
  if (!pending) return;
  pendingApiCalls.delete(callId);
  pending.reject(new Error(message));
}

// ── Sandbox hooks (push events to main) ──

const hooks: SandboxHooks = {
  onLog: (extName, message) => {
    post({ type: 'extensionLog', name: extName, message });
  },
  onUiNotification: (extName, message) => {
    post({ type: 'uiNotification', extensionName: extName, message });
  },
  requestApiCall,
  onCommandRegistered: (extName, fullCommandId) => {
    post({ type: 'commandRegistered', extensionName: extName, commandId: fullCommandId });
  },
  onCommandUnregistered: (extName, fullCommandId) => {
    post({ type: 'commandUnregistered', extensionName: extName, commandId: fullCommandId });
  },
};

// ── Activation ──

function buildContext(state: HostExtensionState): vm.Context {
  const api = buildHostSandboxAPI(state, hooks);
  return vm.createContext(
    {
      ...getHostSafeSandboxGlobals(),
      ouroboros: api.ouroboros,
      console: api.console,
    },
    {
      name: `ext:${state.manifest.name}`,
      codeGeneration: { strings: false, wasm: false },
    },
  );
}

function buildScript(state: HostExtensionState, code: string): vm.Script {
  const wrappedCode = `(async function() {\n${code}\n})()`;
  return new vm.Script(wrappedCode, {
    filename: `ext:${state.manifest.name}/${state.manifest.main}`,
  });
}

async function activatePackage(pkg: ExtensionPackage): Promise<HostExtension> {
  const state: HostExtensionState = {
    manifest: pkg.manifest,
    configSnapshot: pkg.configSnapshot,
    log: [],
  };
  appendHostLog(state, 'Activating in ExtensionHost...');
  hooks.onLog(pkg.manifest.name, 'Activating in ExtensionHost...');
  const context = buildContext(state);
  const script = buildScript(state, pkg.code);
  await script.runInContext(context, { timeout: 10000 });
  appendHostLog(state, 'Activated successfully.');
  hooks.onLog(pkg.manifest.name, 'Activated successfully.');
  return { state, context, status: 'active' };
}

async function handleActivate(requestId: string, pkg: ExtensionPackage): Promise<void> {
  const existing = extensions.get(pkg.manifest.name);
  if (existing && existing.status === 'active') {
    post({ type: 'activated', requestId, name: pkg.manifest.name });
    return;
  }
  try {
    const ext = await activatePackage(pkg);
    extensions.set(pkg.manifest.name, ext);
    post({ type: 'extensionStatus', name: pkg.manifest.name, status: 'active' });
    post({ type: 'activated', requestId, name: pkg.manifest.name });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    extensions.set(pkg.manifest.name, {
      state: { manifest: pkg.manifest, configSnapshot: pkg.configSnapshot, log: [] },
      context: null, status: 'error', errorMessage: message,
    });
    post({ type: 'extensionError', name: pkg.manifest.name, message });
    post({ type: 'extensionStatus', name: pkg.manifest.name, status: 'error', errorMessage: message });
    postError(requestId, err);
  }
}

// ── Deactivation ──

function handleDeactivate(requestId: string, name: string): void {
  const ext = extensions.get(name);
  if (!ext) {
    post({ type: 'deactivated', requestId, name });
    return;
  }
  ext.context = null;
  ext.status = 'inactive';
  post({ type: 'extensionStatus', name, status: 'inactive' });
  post({ type: 'deactivated', requestId, name });
}

// ── Config snapshot updates ──

function handleConfigSnapshotUpdate(name: string, snapshot: Record<string, unknown>): void {
  const ext = extensions.get(name);
  if (ext) ext.state.configSnapshot = snapshot;
}

// ── Event dispatch (no-op in MVP — extensions don't subscribe yet) ──
// Phase 6 will route activation events to extensions that registered handlers.
// For MVP, extensions activate eagerly via the activate request and don't
// subscribe to runtime events.

// ── Dispatcher ──

export async function dispatch(msg: ExtensionHostRequest): Promise<void> {
  switch (msg.type) {
    case 'activate':
      await handleActivate(msg.requestId, msg.package);
      return;
    case 'deactivate':
      handleDeactivate(msg.requestId, msg.name);
      return;
    case 'updateConfigSnapshot':
      handleConfigSnapshotUpdate(msg.name, msg.configSnapshot);
      return;
    case 'apiResponse':
      resolveApiCall(msg.callId, msg.result);
      return;
    case 'apiError':
      rejectApiCall(msg.callId, msg.message);
      return;
    case 'dispatchEvent':
      // Phase 6: route to extensions that subscribed via activation events.
      return;
  }
}

/** Reset all extensions — used by tests. */
export function _resetForTests(): void {
  extensions.clear();
}

/** Test-only accessor for the in-host extension map. */
export function _getExtensionsForTests(): Map<string, HostExtension> {
  return extensions;
}

/** Bootstrap parentPort listener. Skipped in test environment. */
function bootstrap(): void {
  if (typeof process.parentPort === 'undefined') return;
  process.parentPort.on('message', (raw: unknown) => {
    const data = (raw as { data?: unknown })?.data ?? raw;
    if (typeof data !== 'object' || data === null) return;
    void dispatch(data as ExtensionHostRequest).catch((err) => {
      const requestId = (data as { requestId?: string }).requestId ?? 'unknown';
      postError(requestId, err);
    });
  });
}

bootstrap();

// Re-export types so the bundler resolves them.
export type { ExtensionHostEvent,ExtensionHostRequest, ExtensionHostResponse };
