/**
 * extensionHostProxy.test.ts — Tests for the main-process ExtensionHost proxy.
 *
 * Mocks UtilityProcessHost (as a real class so `new` works) and the
 * extensions Map to verify:
 *   - apiCall events dispatch through the direct sandbox API
 *   - commandRegistered/commandUnregistered events update the LoadedExtension
 *   - autoRestart is enabled and crash recovery re-activates active extensions
 *   - the sanitized config snapshot masks sensitive keys
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted shared state and mock class ──
//
// All state and the mock class itself live inside vi.hoisted so they're
// available when vi.mock() factories run (which are hoisted to the top of
// the file by vitest).

interface MockHostOptions {
  name: string;
  modulePath: string;
  autoRestart?: boolean;
  onCrash?: (c: number) => void;
}

const { configValues, hostState, extensionsMap, sandboxMock, MockUtilityProcessHost } = vi.hoisted(
  () => {
    const sharedHostState: { lastInstance: MockUtilityProcessHostClass | null } = {
      lastInstance: null,
    };

    // Class-based mock so `new UtilityProcessHost(options)` works correctly.
    class MockUtilityProcessHostClass {
      options: MockHostOptions;
      alive = false;
      send = vi.fn();
      request = vi.fn(async () => ({ type: 'activated' }));
      eventHandler: ((e: unknown) => void) | null = null;
      requestCounter = 0;

      constructor(options: MockHostOptions) {
        this.options = options;
        sharedHostState.lastInstance = this;
      }

      fork(): void {
        this.alive = true;
      }
      async kill(): Promise<void> {
        this.alive = false;
      }
      nextRequestId(): string {
        this.requestCounter += 1;
        return `req-${this.requestCounter}`;
      }
      onEvent(cb: (e: unknown) => void): () => void {
        this.eventHandler = cb;
        return () => {
          this.eventHandler = null;
        };
      }
      emitEvent(e: unknown): void {
        this.eventHandler?.(e);
      }
      triggerCrash(code: number): void {
        this.options.onCrash?.(code);
      }
    }

    return {
      configValues: new Map<string, unknown>(),
      hostState: sharedHostState,
      extensionsMap: new Map<string, unknown>(),
      sandboxMock: {
        appendLog: vi.fn() as (...args: unknown[]) => void,
        buildSandboxAPI: vi.fn().mockReturnValue({
          ouroboros: {} as Record<string, unknown>,
        }),
      },
      MockUtilityProcessHost: MockUtilityProcessHostClass,
    };
  },
);

// Type alias used by the rest of the file (refers to the hoisted class).
type MockUtilityProcessHostClass = InstanceType<typeof MockUtilityProcessHost>;

vi.mock('../utilityProcessHost', () => ({
  UtilityProcessHost: MockUtilityProcessHost,
}));

vi.mock('../config', () => ({
  getConfigValue: vi.fn((key: string) => configValues.get(key)),
}));

vi.mock('../extensionsLifecycle', () => ({
  extensions: extensionsMap,
}));

vi.mock('../extensionsSandbox', () => ({
  appendLog: (...args: unknown[]) => sandboxMock.appendLog(...args),
  buildSandboxAPI: (ext: unknown) => sandboxMock.buildSandboxAPI(ext),
}));

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
}));

vi.mock('../web/webServer', () => ({
  broadcastToWebClients: vi.fn(),
}));

// ── Imports (after mocks) ──

import {
  _getActiveInHostForTests,
  _resetForTests,
  activateExtensionViaHost,
  buildConfigSnapshot,
  deactivateExtensionViaHost,
} from './extensionHostProxy';

// ── Helpers ──

function makeManifest(name: string, permissions: string[] = []) {
  return {
    name,
    version: '1.0.0',
    description: '',
    author: '',
    main: 'index.js',
    permissions,
  };
}

interface MockExt {
  manifest: ReturnType<typeof makeManifest>;
  log: string[];
  registeredCommands: Map<string, () => unknown>;
  status: 'active' | 'inactive' | 'pending' | 'error';
  enabled: boolean;
  dir: string;
  context: null;
}

function makeMainExtension(name: string, permissions: string[] = []): MockExt {
  return {
    manifest: makeManifest(name, permissions),
    log: [],
    registeredCommands: new Map(),
    status: 'active',
    enabled: true,
    dir: '/tmp',
    context: null,
  };
}

function getHost(): MockUtilityProcessHostClass {
  const inst = hostState.lastInstance;
  if (!inst) throw new Error('No host instance was created');
  return inst;
}

beforeEach(() => {
  configValues.clear();
  extensionsMap.clear();
  _resetForTests();
  hostState.lastInstance = null;
  sandboxMock.appendLog = vi.fn();
  sandboxMock.buildSandboxAPI = vi.fn(() => ({ ouroboros: {} }));
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── Tests ──

describe('extensionHostProxy', () => {
  describe('buildConfigSnapshot', () => {
    it('masks sensitive keys', () => {
      configValues.set('webAccessToken', 'real-secret');
      configValues.set('webAccessPassword', 'real-password');
      configValues.set('extensionsEnabled', true);
      const snapshot = buildConfigSnapshot();
      expect(snapshot.webAccessToken).toBe('');
      expect(snapshot.webAccessPassword).toBe('');
      expect(snapshot.extensionsEnabled).toBe(true);
    });

    it('masks API keys in modelProviders', () => {
      configValues.set('modelProviders', [
        { name: 'openai', apiKey: 'sk-real-key' },
        { name: 'anthropic', apiKey: '' },
      ]);
      const snapshot = buildConfigSnapshot();
      const providers = snapshot.modelProviders as Array<{ name: string; apiKey: string }>;
      expect(providers[0]!.apiKey).toBe('••••••••');
      expect(providers[1]!.apiKey).toBe('');
    });
  });

  describe('activateExtensionViaHost', () => {
    it('forks the host on first call and tracks the package', async () => {
      const result = await activateExtensionViaHost(makeManifest('ext-a'), '/* code */');
      expect(result.success).toBe(true);
      const inst = getHost();
      expect(inst.alive).toBe(true);
      const tracked = _getActiveInHostForTests();
      expect(tracked.has('ext-a')).toBe(true);
    });

    it('configures autoRestart: true and an onCrash handler', async () => {
      await activateExtensionViaHost(makeManifest('ext-a'), '/* code */');
      const inst = getHost();
      expect(inst.options.autoRestart).toBe(true);
      expect(typeof inst.options.onCrash).toBe('function');
    });

    it('removes from activeInHost on activation failure', async () => {
      // Create a host first via a successful activation
      await activateExtensionViaHost(makeManifest('ext-first'), '/* ok */');
      const inst = getHost();
      // Force the next request to reject
      inst.request.mockRejectedValueOnce(new Error('host says no'));
      const failed = await activateExtensionViaHost(makeManifest('ext-bad'), '/* broken */');
      expect(failed.success).toBe(false);
      expect(_getActiveInHostForTests().has('ext-bad')).toBe(false);
      expect(_getActiveInHostForTests().has('ext-first')).toBe(true);
    });
  });

  describe('deactivateExtensionViaHost', () => {
    it('removes the extension from activeInHost', async () => {
      await activateExtensionViaHost(makeManifest('ext-a'), '/* code */');
      expect(_getActiveInHostForTests().has('ext-a')).toBe(true);
      await deactivateExtensionViaHost('ext-a');
      expect(_getActiveInHostForTests().has('ext-a')).toBe(false);
    });

    it('is a no-op when host is not started', async () => {
      const result = await deactivateExtensionViaHost('never-active');
      expect(result.success).toBe(true);
    });
  });

  describe('apiCall event dispatch', () => {
    it('dispatches files.readFile through the direct sandbox API', async () => {
      const ext = makeMainExtension('ext-a', ['files.read']);
      extensionsMap.set('ext-a', ext);
      sandboxMock.buildSandboxAPI = vi.fn(() => ({
        ouroboros: {
          files: { readFile: vi.fn(async (filePath: string) => `contents of ${filePath}`) },
        },
      }));
      await activateExtensionViaHost(makeManifest('ext-a', ['files.read']), '/* code */');
      const inst = getHost();
      inst.emitEvent({
        type: 'apiCall',
        callId: 'c1',
        extName: 'ext-a',
        namespace: 'files',
        method: 'readFile',
        args: ['/tmp/x'],
      });
      await new Promise((r) => setTimeout(r, 10));
      const sentCalls = inst.send.mock.calls.map((c) => c[0]);
      const responses = sentCalls.filter((m: { type?: string }) => m?.type === 'apiResponse');
      expect(responses).toHaveLength(1);
      expect((responses[0] as { result: unknown }).result).toBe('contents of /tmp/x');
    });

    it('sends apiError when the underlying API throws', async () => {
      const ext = makeMainExtension('ext-no-perm');
      extensionsMap.set('ext-no-perm', ext);
      sandboxMock.buildSandboxAPI = vi.fn(() => ({
        ouroboros: {
          files: {
            readFile: vi.fn(async () => {
              throw new Error('Permission denied: files.read not granted');
            }),
          },
        },
      }));
      await activateExtensionViaHost(makeManifest('ext-no-perm'), '/* code */');
      const inst = getHost();
      inst.emitEvent({
        type: 'apiCall',
        callId: 'c1',
        extName: 'ext-no-perm',
        namespace: 'files',
        method: 'readFile',
        args: ['/tmp/x'],
      });
      await new Promise((r) => setTimeout(r, 10));
      const sentCalls = inst.send.mock.calls.map((c) => c[0]);
      const errors = sentCalls.filter((m: { type?: string }) => m?.type === 'apiError');
      expect(errors).toHaveLength(1);
      expect((errors[0] as { message: string }).message).toContain('Permission denied');
    });

    it('sends apiError when extension is not in main', async () => {
      await activateExtensionViaHost(makeManifest('ext-orphan'), '/* code */');
      const inst = getHost();
      inst.emitEvent({
        type: 'apiCall',
        callId: 'c1',
        extName: 'unknown',
        namespace: 'files',
        method: 'readFile',
        args: ['/tmp/x'],
      });
      await new Promise((r) => setTimeout(r, 10));
      const sentCalls = inst.send.mock.calls.map((c) => c[0]);
      const errors = sentCalls.filter((m: { type?: string }) => m?.type === 'apiError');
      expect(errors).toHaveLength(1);
      expect((errors[0] as { message: string }).message).toContain('not found in main');
    });
  });

  describe('command registration events', () => {
    it('commandRegistered adds a placeholder to ext.registeredCommands', async () => {
      const ext = makeMainExtension('ext-cmd', ['commands.register']);
      extensionsMap.set('ext-cmd', ext);
      await activateExtensionViaHost(makeManifest('ext-cmd', ['commands.register']), '/* code */');
      const inst = getHost();
      inst.emitEvent({
        type: 'commandRegistered',
        extensionName: 'ext-cmd',
        commandId: 'ext:ext-cmd:hello',
      });
      expect(ext.registeredCommands.has('ext:ext-cmd:hello')).toBe(true);
    });

    it('commandUnregistered removes from ext.registeredCommands', async () => {
      const ext = makeMainExtension('ext-cmd', ['commands.register']);
      ext.registeredCommands.set('ext:ext-cmd:hello', () => null);
      extensionsMap.set('ext-cmd', ext);
      await activateExtensionViaHost(makeManifest('ext-cmd', ['commands.register']), '/* code */');
      const inst = getHost();
      inst.emitEvent({
        type: 'commandUnregistered',
        extensionName: 'ext-cmd',
        commandId: 'ext:ext-cmd:hello',
      });
      expect(ext.registeredCommands.has('ext:ext-cmd:hello')).toBe(false);
    });
  });

  describe('crash recovery', () => {
    it('re-activates all active extensions after a host crash', async () => {
      vi.useFakeTimers();
      try {
        await activateExtensionViaHost(makeManifest('ext-a'), '/* a */');
        await activateExtensionViaHost(makeManifest('ext-b'), '/* b */');
        const inst = getHost();
        const before = inst.request.mock.calls.length;
        inst.triggerCrash(137);
        await vi.advanceTimersByTimeAsync(60);
        expect(inst.request.mock.calls.length).toBeGreaterThanOrEqual(before + 2);
      } finally {
        vi.useRealTimers();
      }
    });

    it('keeps activeInHost populated after crash so re-activation works', async () => {
      await activateExtensionViaHost(makeManifest('ext-a'), '/* a */');
      const inst = getHost();
      inst.triggerCrash(1);
      expect(_getActiveInHostForTests().has('ext-a')).toBe(true);
    });
  });
});
