/**
 * extensionHostProxy.ts — Main-process proxy that fronts the ExtensionHost
 * utility process.
 *
 * Lazily forks the host on first activation. Receives extensionLog,
 * extensionError, extensionStatus, and uiNotification push events from the
 * host and routes them into existing main-process flows:
 *   - extensionLog → appended to the main-process LoadedExtension log buffer
 *   - extensionStatus → updates LoadedExtension status
 *   - uiNotification → webContents.send + broadcastToWebClients (same as direct path)
 *
 * Behavior is gated by the `useExtensionHost` config flag — when off,
 * extensionsLifecycle.ts uses the direct vm.runInContext path and this module
 * is never instantiated.
 */

import { BrowserWindow } from 'electron';
import path from 'path';

import type { AppConfig } from '../config';
import { getConfigValue } from '../config';
import { extensions } from '../extensionsLifecycle';
import { appendLog, buildSandboxAPI } from '../extensionsSandbox';
import type { ExtensionManifest, LoadedExtension } from '../extensionsTypes';
import log from '../logger';
import { UtilityProcessHost } from '../utilityProcessHost';
import { broadcastToWebClients } from '../web/webServer';
import type {
  ExtensionHostEvent,
  ExtensionHostOutbound,
  ExtensionHostRequest,
  ExtensionHostResponse,
  ExtensionPackage,
} from './extensionHostProtocol';
import { isEvent } from './extensionHostProtocol';

let host: UtilityProcessHost<ExtensionHostRequest, ExtensionHostOutbound> | null = null;

/**
 * Tracks the activation packages of currently-active extensions so we can
 * re-activate them after a host crash + auto-restart.
 */
const activeInHost = new Map<string, ExtensionPackage>();

function resolveModulePath(): string {
  const outMainDir = __dirname.endsWith('chunks') ? path.dirname(__dirname) : __dirname;
  return path.join(outMainDir, 'extensionHostMain.js');
}

function getHost(): UtilityProcessHost<ExtensionHostRequest, ExtensionHostOutbound> {
  if (host && host.alive) return host;
  host = new UtilityProcessHost<ExtensionHostRequest, ExtensionHostOutbound>({
    name: 'extensionHost',
    modulePath: resolveModulePath(),
    autoRestart: true,
    onCrash: handleHostCrash,
  });
  host.fork();
  host.onEvent((msg) => {
    if (isEvent(msg)) handleEvent(msg);
  });
  return host;
}

/**
 * After the host crashes and auto-restarts, re-activate every previously
 * active extension. This runs synchronously from onCrash → fires re-activates
 * after the new host has been forked by UtilityProcessHost.handleExit.
 */
function handleHostCrash(exitCode: number): void {
  log.warn(
    `[extensionHostProxy] host crashed (code=${exitCode}), re-activating ${activeInHost.size} extension(s)`,
  );
  for (const [, pkg] of activeInHost) {
    const ext = extensions.get(pkg.manifest.name);
    if (ext) appendLog(ext, '[recovery] ExtensionHost crashed; re-activating');
  }
  // Defer re-activation slightly so the new host's parentPort listener is wired up
  setTimeout(() => {
    for (const [name, pkg] of activeInHost) {
      void reactivateAfterCrash(name, pkg);
    }
  }, 50);
}

async function reactivateAfterCrash(name: string, pkg: ExtensionPackage): Promise<void> {
  if (!host || !host.alive) return;
  try {
    const requestId = host.nextRequestId();
    // Refresh the snapshot in case config changed since the original activation
    const refreshedPkg: ExtensionPackage = { ...pkg, configSnapshot: buildConfigSnapshot() };
    activeInHost.set(name, refreshedPkg);
    await host.request<ExtensionHostResponse>({
      type: 'activate',
      requestId,
      package: refreshedPkg,
    });
    const ext = extensions.get(name);
    if (ext) appendLog(ext, '[recovery] re-activated successfully');
  } catch (err) {
    const ext = extensions.get(name);
    if (ext) {
      appendLog(
        ext,
        `[recovery] re-activation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      ext.status = 'error';
    }
  }
}

// ── Event handlers ──

function handleEvent(event: ExtensionHostEvent): void {
  switch (event.type) {
    case 'extensionLog':
      handleExtensionLog(event.name, event.message);
      return;
    case 'extensionError':
      handleExtensionError(event.name, event.message);
      return;
    case 'extensionStatus':
      handleExtensionStatus(event.name, event.status, event.errorMessage);
      return;
    case 'uiNotification':
      handleUiNotification(event.extensionName, event.message);
      return;
    case 'apiCall':
      void handleApiCall(event);
      return;
    case 'commandRegistered':
      handleCommandRegistered(event.extensionName, event.commandId);
      return;
    case 'commandUnregistered':
      handleCommandUnregistered(event.extensionName, event.commandId);
      return;
  }
}

// ── Host → Main API call dispatch ──

interface ApiCallEvent {
  callId: string;
  extName: string;
  namespace: 'files' | 'terminal';
  method: string;
  args: unknown[];
}

/** Dispatch an API call from the host by reusing the direct sandbox API. */
async function handleApiCall(event: ApiCallEvent): Promise<void> {
  if (!host || !host.alive) return;
  try {
    const ext = extensions.get(event.extName);
    if (!ext) throw new Error(`Extension "${event.extName}" not found in main`);
    const api = buildSandboxAPI(ext);
    const ouroboros = api.ouroboros as Record<
      string,
      Record<string, (...args: unknown[]) => unknown>
    >;

    const ns = ouroboros[event.namespace];
    if (!ns) throw new Error(`Unknown API namespace: ${event.namespace}`);

    const fn = ns[event.method];
    if (typeof fn !== 'function')
      throw new Error(`Unknown API method: ${event.namespace}.${event.method}`);
    const result = await fn(...event.args);
    host.send({ type: 'apiResponse', callId: event.callId, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    host?.send({ type: 'apiError', callId: event.callId, message });
  }
}

// ── Command registration events ──

function commandPlaceholder(): unknown {
  // Real handler lives in the host; main only stores a marker so the IDE can
  // list registered commands.
  return null;
}

function handleCommandRegistered(extensionName: string, fullCommandId: string): void {
  const ext = extensions.get(extensionName);
  if (!ext) return;
  ext.registeredCommands.set(fullCommandId, commandPlaceholder);
  appendLog(ext, `[host] command registered: ${fullCommandId}`);
}

function handleCommandUnregistered(extensionName: string, fullCommandId: string): void {
  const ext = extensions.get(extensionName);
  if (!ext) return;
  ext.registeredCommands.delete(fullCommandId);
  appendLog(ext, `[host] command unregistered: ${fullCommandId}`);
}

function handleExtensionLog(name: string, message: string): void {
  const ext = extensions.get(name);
  if (ext) appendLog(ext, message);
}

function handleExtensionError(name: string, message: string): void {
  const ext = extensions.get(name);
  if (ext) {
    appendLog(ext, `[error] ${message}`);
    log.error(`[ext:${name}] ${message}`);
  }
}

function handleExtensionStatus(
  name: string,
  status: 'active' | 'inactive' | 'error',
  errorMessage?: string,
): void {
  const ext = extensions.get(name);
  if (!ext) return;
  ext.status = status;
  if (errorMessage !== undefined) {
    ext.errorMessage = errorMessage;
  } else if (status !== 'error') {
    ext.errorMessage = undefined;
  }
}

function handleUiNotification(extensionName: string, message: string): void {
  const window = BrowserWindow.getAllWindows()[0];
  if (window && !window.isDestroyed()) {
    window.webContents.send('extensions:notification', { extensionName, message });
  }
  broadcastToWebClients('extensions:notification', { extensionName, message });
}

// ── Snapshot helpers ──

const SENSITIVE_KEYS = new Set(['webAccessToken', 'webAccessPassword']);

function sanitizeProvider(provider: Record<string, unknown>): Record<string, unknown> {
  return { ...provider, apiKey: provider.apiKey ? '••••••••' : '' };
}

/** Build a sanitized config snapshot — strips secrets, masks API keys. */
export function buildConfigSnapshot(): Record<string, unknown> {
  const snapshot = new Map<string, unknown>();
  // electron-store does not expose all keys generically; we cherry-pick.
  // Phase 6 may extend this to a fuller schema-driven snapshot.
  const safeKeys: Array<keyof AppConfig> = [
    'extensionsEnabled',
    'defaultProjectRoot',
    'glassOpacity',
    'commandBlocksEnabled',
    'terminalCursorStyle',
    'formatOnSave',
  ];
  for (const key of safeKeys) {
    snapshot.set(key as string, getConfigValue(key));
  }
  // Sensitive keys are explicit empty strings (extension can detect "not present").
  for (const key of SENSITIVE_KEYS) snapshot.set(key, '');
  // modelProviders gets API keys masked.
  const providers = getConfigValue('modelProviders');
  if (Array.isArray(providers)) {
    snapshot.set(
      'modelProviders',
      (providers as unknown as Array<Record<string, unknown>>).map(sanitizeProvider),
    );
  }
  return Object.fromEntries(snapshot);
}

// ── Public API ──

/**
 * Activate an extension via the host. Returns a promise that resolves when
 * the host has finished running the extension's main file. The package is
 * tracked in `activeInHost` so it can be re-activated after a host crash.
 */
export async function activateExtensionViaHost(
  manifest: ExtensionManifest,
  code: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const h = getHost();
    const requestId = h.nextRequestId();
    const pkg: ExtensionPackage = { manifest, code, configSnapshot: buildConfigSnapshot() };
    activeInHost.set(manifest.name, pkg);
    await h.request<ExtensionHostResponse>({ type: 'activate', requestId, package: pkg });
    return { success: true };
  } catch (err) {
    activeInHost.delete(manifest.name);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Deactivate an extension in the host and stop tracking it for crash recovery. */
export async function deactivateExtensionViaHost(
  name: string,
): Promise<{ success: boolean; error?: string }> {
  activeInHost.delete(name);
  if (!host || !host.alive) return { success: true }; // host not started — nothing to do
  try {
    const requestId = host.nextRequestId();
    await host.request<ExtensionHostResponse>({ type: 'deactivate', requestId, name });
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Test-only accessor for the active package map. */
export function _getActiveInHostForTests(): Map<string, ExtensionPackage> {
  return activeInHost;
}

/** Test-only reset (doesn't kill the host since tests don't actually fork one). */
export function _resetForTests(): void {
  activeInHost.clear();
  host = null;
}

/** Push an updated config snapshot to the host (e.g. after setConfigValue). */
export function updateConfigSnapshotInHost(name: string): void {
  if (!host || !host.alive) return;
  host.send({ type: 'updateConfigSnapshot', name, configSnapshot: buildConfigSnapshot() });
}

/** Shutdown the host (called from main on app quit). */
export async function shutdownExtensionHost(): Promise<void> {
  activeInHost.clear();
  if (!host) return;
  await host.kill();
  host = null;
}

// Re-export so consumers can detect a fresh proxy import (for tests).
export type { LoadedExtension };
