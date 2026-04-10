/**
 * extensionHostSandbox.ts — Standalone sandbox builder for use INSIDE the
 * ExtensionHost utility process.
 *
 * Mirrors the public API surface of src/main/extensionsSandbox.ts (so
 * extensions don't need to know which process they run in) but with all main-
 * process dependencies replaced by:
 *   - host-local data (config snapshot, log buffer)
 *   - IPC sends back to main (ui.showNotification → uiNotification event)
 *   - throwing stubs (files / terminal / commands → Phase 6)
 *
 * The host has no access to the `electron` module — all integration with the
 * renderer/web flows through ExtensionHostEvent messages dispatched by main.
 */

import type { ExtensionManifest } from '../extensionsTypes';

// ── Per-extension runtime state held inside the host ──

export interface HostExtensionState {
  manifest: ExtensionManifest;
  configSnapshot: Record<string, unknown>;
  log: string[];
}

// ── Console proxy ──

export interface ConsoleProxy {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
}

// ── Outbound API call hooks (sent to main via parentPort) ──

export interface SandboxHooks {
  onLog: (extName: string, message: string) => void;
  onUiNotification: (extName: string, message: string) => void;
  /** Issue a Host→Main API call and await the response. */
  requestApiCall: (extName: string, namespace: 'files' | 'terminal', method: string, args: unknown[]) => Promise<unknown>;
  /** Notify main that an extension registered a command. */
  onCommandRegistered: (extName: string, fullCommandId: string) => void;
  /** Notify main that an extension unregistered a command. */
  onCommandUnregistered: (extName: string, fullCommandId: string) => void;
}

// ── Host-local command registry ──

/**
 * Map of fullCommandId → handler. Shared across all extensions in the host.
 * Handlers are stored here because functions can't cross IPC.
 */
export const hostCommandRegistry = new Map<string, (...args: unknown[]) => unknown>();

// ── Helpers ──

function requirePermission(state: HostExtensionState, permission: string): void {
  if (!state.manifest.permissions.includes(permission)) {
    throw new Error(`Permission denied: ${permission} not granted`);
  }
}

function requireString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string`);
  }
}

function requireNonEmptyString(value: unknown, label: string): asserts value is string {
  requireString(value, label);
  if (!value) throw new Error(`Invalid ${label.toLowerCase()}`);
}

export function appendHostLog(state: HostExtensionState, message: string): void {
  const timestamp = new Date().toISOString().slice(11, 23);
  state.log.push(`[${timestamp}] ${message}`);
  if (state.log.length > 500) {
    state.log.splice(0, state.log.length - 500);
  }
}

// ── API namespace builders ──

function buildConfigApi(state: HostExtensionState, hooks: SandboxHooks): Record<string, unknown> {
  return {
    get: (key: string): unknown => {
      requirePermission(state, 'config.read');
      requireString(key, 'Key');
      const msg = `config.get: ${key}`;
      appendHostLog(state, msg);
      hooks.onLog(state.manifest.name, msg);
      // eslint-disable-next-line security/detect-object-injection -- key passed through from extension code; snapshot is plain data
      return state.configSnapshot[key];
    },
  };
}

function buildUiApi(state: HostExtensionState, hooks: SandboxHooks): Record<string, unknown> {
  return {
    showNotification: (message: string): void => {
      requireString(message, 'Message');
      const logMsg = `ui.showNotification: ${message.slice(0, 100)}`;
      appendHostLog(state, logMsg);
      hooks.onLog(state.manifest.name, logMsg);
      hooks.onUiNotification(state.manifest.name, message);
    },
  };
}

function buildFilesApi(state: HostExtensionState, hooks: SandboxHooks): Record<string, unknown> {
  return {
    readFile: async (filePath: string): Promise<string> => {
      requirePermission(state, 'files.read');
      requireNonEmptyString(filePath, 'file path');
      appendHostLog(state, `files.readFile: ${filePath}`);
      hooks.onLog(state.manifest.name, `files.readFile: ${filePath}`);
      const result = await hooks.requestApiCall(
        state.manifest.name, 'files', 'readFile', [filePath],
      );
      return result as string;
    },
    writeFile: async (filePath: string, content: string): Promise<void> => {
      requirePermission(state, 'files.write');
      requireNonEmptyString(filePath, 'file path');
      requireString(content, 'Content');
      appendHostLog(state, `files.writeFile: ${filePath}`);
      hooks.onLog(state.manifest.name, `files.writeFile: ${filePath}`);
      await hooks.requestApiCall(
        state.manifest.name, 'files', 'writeFile', [filePath, content],
      );
    },
  };
}

function buildTerminalApi(state: HostExtensionState, hooks: SandboxHooks): Record<string, unknown> {
  return {
    write: async (tabId: string, data: string): Promise<void> => {
      requirePermission(state, 'terminal.write');
      requireString(tabId, 'tabId');
      requireString(data, 'data');
      const msg = `terminal.write: tab=${tabId}, ${data.length} chars`;
      appendHostLog(state, msg);
      hooks.onLog(state.manifest.name, msg);
      await hooks.requestApiCall(
        state.manifest.name, 'terminal', 'write', [tabId, data],
      );
    },
  };
}

function buildCommandsApi(state: HostExtensionState, hooks: SandboxHooks): Record<string, unknown> {
  return {
    register: (id: string, handler: (...args: unknown[]) => unknown): void => {
      requirePermission(state, 'commands.register');
      requireString(id, 'id');
      if (typeof handler !== 'function') {
        throw new Error('Invalid arguments: handler must be a function');
      }
      const fullId = `ext:${state.manifest.name}:${id}`;
      appendHostLog(state, `commands.register: ${fullId}`);
      hostCommandRegistry.set(fullId, handler);
      hooks.onCommandRegistered(state.manifest.name, fullId);
    },
    unregister: (id: string): void => {
      requireString(id, 'id');
      const fullId = `ext:${state.manifest.name}:${id}`;
      appendHostLog(state, `commands.unregister: ${fullId}`);
      hostCommandRegistry.delete(fullId);
      hooks.onCommandUnregistered(state.manifest.name, fullId);
    },
  };
}

// ── Console proxy ──

function buildConsoleMethod(state: HostExtensionState, hooks: SandboxHooks, level: string) {
  return (...args: unknown[]): void => {
    const msg = `[${level}] ${args.map(String).join(' ')}`;
    appendHostLog(state, msg);
    hooks.onLog(state.manifest.name, msg);
  };
}

function buildConsoleProxy(state: HostExtensionState, hooks: SandboxHooks): ConsoleProxy {
  return {
    log: buildConsoleMethod(state, hooks, 'log'),
    warn: buildConsoleMethod(state, hooks, 'warn'),
    error: buildConsoleMethod(state, hooks, 'error'),
    info: buildConsoleMethod(state, hooks, 'info'),
  };
}

// ── Public API ──

export interface HostSandboxApi {
  ouroboros: Record<string, unknown>;
  console: ConsoleProxy;
}

export function buildHostSandboxAPI(
  state: HostExtensionState,
  hooks: SandboxHooks,
): HostSandboxApi {
  return {
    ouroboros: {
      files: buildFilesApi(state, hooks),
      terminal: buildTerminalApi(state, hooks),
      commands: buildCommandsApi(state, hooks),
      config: buildConfigApi(state, hooks),
      ui: buildUiApi(state, hooks),
    },
    console: buildConsoleProxy(state, hooks),
  };
}

// ── Safe globals (mirror of extensionsSandbox.getSafeSandboxGlobals) ──

export function getHostSafeSandboxGlobals(): Record<string, unknown> {
  return {
    setTimeout, clearTimeout, setInterval, clearInterval,
    Promise, JSON, Math, Date, Array, Object, String, Number, Boolean,
    Map, Set, WeakMap, WeakSet, Symbol,
    Error, TypeError, RangeError, URIError, SyntaxError, ReferenceError,
    RegExp, parseInt, parseFloat, isNaN, isFinite,
    encodeURIComponent, decodeURIComponent, encodeURI, decodeURI,
    undefined, NaN, Infinity,
  };
}
