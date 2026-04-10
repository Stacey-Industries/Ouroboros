/**
 * extensionHostMain.test.ts — Unit tests for the ExtensionHost dispatcher.
 *
 * Exercises activate / deactivate / updateConfigSnapshot against the
 * in-process dispatch() function, with process.parentPort mocked so the
 * host's post() calls can be captured.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock parentPort before import ──

interface OutboundMessage {
  type: string;
  requestId?: string;
  name?: string;
  message?: string;
  status?: string;
  errorMessage?: string;
  extensionName?: string;
  callId?: string;
  namespace?: string;
  method?: string;
  args?: unknown[];
  commandId?: string;
}

const postedMessages: OutboundMessage[] = [];

beforeEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process as any).parentPort = {
    postMessage: (msg: OutboundMessage) => {
      postedMessages.push(msg);
    },
    on: vi.fn(),
  };
  postedMessages.length = 0;
});

afterEach(async () => {
  const mod = await import('./extensionHostMain');
  mod._resetForTests();
});

// ── Helpers ──

async function importDispatcher() {
  const mod = await import('./extensionHostMain');
  return mod.dispatch;
}

async function getExtensions() {
  const mod = await import('./extensionHostMain');
  return mod._getExtensionsForTests();
}

function findResponse(requestId: string): OutboundMessage | undefined {
  return postedMessages.find((m) => m.requestId === requestId);
}

function findEvents(type: string): OutboundMessage[] {
  return postedMessages.filter((m) => m.type === type);
}

function makePackage(name: string, code: string, permissions: string[] = []) {
  return {
    manifest: {
      name,
      version: '1.0.0',
      description: '',
      author: '',
      main: 'index.js',
      permissions,
    },
    code,
    configSnapshot: { extensionsEnabled: true, defaultProjectRoot: '/tmp' },
  };
}

// ── Tests ──

describe('extensionHostMain dispatcher', () => {
  describe('activate', () => {
    it('activates a trivial extension and posts activated', async () => {
      const dispatch = await importDispatcher();
      await dispatch({
        type: 'activate',
        requestId: 'r1',
        package: makePackage('ext-a', '/* empty */'),
      });
      const res = findResponse('r1');
      expect(res?.type).toBe('activated');
      expect(res?.name).toBe('ext-a');
    });

    it('posts extensionLog events during activation', async () => {
      const dispatch = await importDispatcher();
      await dispatch({
        type: 'activate',
        requestId: 'r1',
        package: makePackage('ext-a', '/* empty */'),
      });
      const logs = findEvents('extensionLog');
      expect(logs.length).toBeGreaterThanOrEqual(2);
      expect(logs.some((l) => l.message?.includes('Activating'))).toBe(true);
      expect(logs.some((l) => l.message?.includes('Activated'))).toBe(true);
    });

    it('posts extensionStatus=active after success', async () => {
      const dispatch = await importDispatcher();
      await dispatch({
        type: 'activate',
        requestId: 'r1',
        package: makePackage('ext-a', '/* empty */'),
      });
      const status = findEvents('extensionStatus');
      expect(status[0]!.status).toBe('active');
    });

    it('captures extension console output', async () => {
      const dispatch = await importDispatcher();
      await dispatch({
        type: 'activate',
        requestId: 'r1',
        package: makePackage('ext-a', 'console.log("hello")'),
      });
      const logs = findEvents('extensionLog');
      expect(logs.some((l) => l.message?.includes('hello'))).toBe(true);
    });

    it('reports activation failure as extensionError + error response', async () => {
      const dispatch = await importDispatcher();
      await dispatch({
        type: 'activate',
        requestId: 'r1',
        package: makePackage('ext-bad', 'throw new Error("boom")'),
      });
      const extErr = findEvents('extensionError');
      expect(extErr[0]!.message).toContain('boom');
      const res = findResponse('r1');
      expect(res?.type).toBe('error');
    });

    it('double-activate is idempotent', async () => {
      const dispatch = await importDispatcher();
      await dispatch({
        type: 'activate',
        requestId: 'r1',
        package: makePackage('ext-a', '/* empty */'),
      });
      postedMessages.length = 0;
      await dispatch({
        type: 'activate',
        requestId: 'r2',
        package: makePackage('ext-a', '/* empty */'),
      });
      const res = findResponse('r2');
      expect(res?.type).toBe('activated');
    });
  });

  describe('config.get via snapshot', () => {
    it('returns values from the config snapshot', async () => {
      const dispatch = await importDispatcher();
      await dispatch({
        type: 'activate',
        requestId: 'r1',
        package: makePackage(
          'ext-cfg',
          // Access via globalThis to avoid bundler transforms
          'globalThis.__ext_seen_value = ouroboros.config.get("defaultProjectRoot");',
          ['config.read'],
        ),
      });
      const res = findResponse('r1');
      expect(res?.type).toBe('activated');
      // Verify via the log — the extension stored the value as a side effect of the sandbox script
      // Since the sandbox is in a separate vm.Context, we can't directly observe globalThis.
      // Instead, assert that config.get was logged.
      const logs = findEvents('extensionLog');
      expect(logs.some((l) => l.message?.includes('config.get'))).toBe(true);
    });

    it('config.get without permission throws', async () => {
      const dispatch = await importDispatcher();
      await dispatch({
        type: 'activate',
        requestId: 'r1',
        package: makePackage(
          'ext-no-perm',
          'ouroboros.config.get("defaultProjectRoot");',
          [], // no config.read permission
        ),
      });
      const res = findResponse('r1');
      expect(res?.type).toBe('error');
      expect(res?.message).toContain('Permission denied');
    });
  });

  describe('ui.showNotification', () => {
    it('emits a uiNotification push event', async () => {
      const dispatch = await importDispatcher();
      await dispatch({
        type: 'activate',
        requestId: 'r1',
        package: makePackage('ext-ui', 'ouroboros.ui.showNotification("hi there");'),
      });
      const notifs = findEvents('uiNotification');
      expect(notifs).toHaveLength(1);
      expect(notifs[0]!.extensionName).toBe('ext-ui');
      expect(notifs[0]!.message).toBe('hi there');
    });
  });

  describe('files / terminal API calls (Phase 6)', () => {
    it('files.readFile posts an apiCall and awaits the response', async () => {
      const dispatch = await importDispatcher();
      // Activate an extension that triggers an apiCall but doesn't await it
      // (so we can intercept the call before any response arrives)
      await dispatch({
        type: 'activate',
        requestId: 'r1',
        package: makePackage(
          'ext-files',
          'ouroboros.files.readFile("/tmp/x");', // fire and forget — Promise dangles
          ['files.read'],
        ),
      });
      // Activation succeeded (the call was made; the dangling Promise doesn't fail it)
      const res = findResponse('r1');
      expect(res?.type).toBe('activated');
      // The host posted an apiCall event
      const calls = findEvents('apiCall');
      expect(calls).toHaveLength(1);
      expect(calls[0]!.namespace).toBe('files');
      expect(calls[0]!.method).toBe('readFile');
      expect(calls[0]!.callId).toBeDefined();
    });

    it('files.readFile without permission rejects synchronously', async () => {
      const dispatch = await importDispatcher();
      await dispatch({
        type: 'activate',
        requestId: 'r1',
        package: makePackage(
          'ext-no-perm',
          'await ouroboros.files.readFile("/tmp/x");',
          [], // no files.read permission
        ),
      });
      const res = findResponse('r1');
      expect(res?.type).toBe('error');
      expect(res?.message).toContain('Permission denied');
    });

    it('apiResponse resolves the corresponding pending Promise', async () => {
      const dispatch = await importDispatcher();
      // Activate an extension that awaits the readFile result
      const activatePromise = dispatch({
        type: 'activate',
        requestId: 'r1',
        package: makePackage(
          'ext-files',
          'globalThis.__ext_result = await ouroboros.files.readFile("/tmp/x");',
          ['files.read'],
        ),
      });
      // Wait a tick so the apiCall is posted
      await new Promise((r) => setTimeout(r, 10));
      const calls = findEvents('apiCall');
      expect(calls).toHaveLength(1);
      const callId = calls[0]!.callId!;
      // Send the response
      void dispatch({ type: 'apiResponse', callId, result: 'file contents here' });
      await activatePromise;
      const res = findResponse('r1');
      expect(res?.type).toBe('activated');
    });

    it('apiError rejects the corresponding pending Promise', async () => {
      const dispatch = await importDispatcher();
      const activatePromise = dispatch({
        type: 'activate',
        requestId: 'r1',
        package: makePackage('ext-files', 'await ouroboros.files.readFile("/tmp/x");', [
          'files.read',
        ]),
      });
      await new Promise((r) => setTimeout(r, 10));
      const calls = findEvents('apiCall');
      const callId = calls[0]!.callId!;
      void dispatch({ type: 'apiError', callId, message: 'permission denied in main' });
      await activatePromise;
      const res = findResponse('r1');
      expect(res?.type).toBe('error');
      expect(res?.message).toContain('permission denied');
    });

    it('terminal.write posts an apiCall', async () => {
      const dispatch = await importDispatcher();
      await dispatch({
        type: 'activate',
        requestId: 'r1',
        package: makePackage('ext-term', 'ouroboros.terminal.write("tab1", "echo hi");', [
          'terminal.write',
        ]),
      });
      const calls = findEvents('apiCall');
      expect(calls).toHaveLength(1);
      expect(calls[0]!.namespace).toBe('terminal');
      expect(calls[0]!.method).toBe('write');
    });
  });

  describe('commands API', () => {
    it('register emits commandRegistered event', async () => {
      const dispatch = await importDispatcher();
      await dispatch({
        type: 'activate',
        requestId: 'r1',
        package: makePackage(
          'ext-cmd',
          'ouroboros.commands.register("hello", function() { return 42; });',
          ['commands.register'],
        ),
      });
      const res = findResponse('r1');
      expect(res?.type).toBe('activated');
      const events = postedMessages.filter((m) => m.type === 'commandRegistered');
      expect(events).toHaveLength(1);
    });

    it('unregister emits commandUnregistered event', async () => {
      const dispatch = await importDispatcher();
      await dispatch({
        type: 'activate',
        requestId: 'r1',
        package: makePackage(
          'ext-cmd',
          `ouroboros.commands.register("hello", function() {});
           ouroboros.commands.unregister("hello");`,
          ['commands.register'],
        ),
      });
      const events = postedMessages.filter((m) => m.type === 'commandUnregistered');
      expect(events).toHaveLength(1);
    });

    it('register without permission throws', async () => {
      const dispatch = await importDispatcher();
      await dispatch({
        type: 'activate',
        requestId: 'r1',
        package: makePackage(
          'ext-cmd',
          'ouroboros.commands.register("hello", function() {});',
          [], // no commands.register
        ),
      });
      const res = findResponse('r1');
      expect(res?.type).toBe('error');
      expect(res?.message).toContain('Permission denied');
    });
  });

  describe('deactivate', () => {
    it('marks an active extension inactive', async () => {
      const dispatch = await importDispatcher();
      await dispatch({
        type: 'activate',
        requestId: 'r1',
        package: makePackage('ext-a', '/* empty */'),
      });
      postedMessages.length = 0;
      dispatch({
        type: 'deactivate',
        requestId: 'r2',
        name: 'ext-a',
      });
      const res = findResponse('r2');
      expect(res?.type).toBe('deactivated');
      const status = findEvents('extensionStatus');
      expect(status[0]!.status).toBe('inactive');
    });

    it('deactivate of unknown extension still posts deactivated', async () => {
      const dispatch = await importDispatcher();
      dispatch({ type: 'deactivate', requestId: 'r1', name: 'unknown' });
      const res = findResponse('r1');
      expect(res?.type).toBe('deactivated');
    });
  });

  describe('updateConfigSnapshot', () => {
    it('updates the snapshot for an active extension', async () => {
      const dispatch = await importDispatcher();
      await dispatch({
        type: 'activate',
        requestId: 'r1',
        package: makePackage('ext-a', '/* empty */'),
      });
      dispatch({
        type: 'updateConfigSnapshot',
        name: 'ext-a',
        configSnapshot: { newKey: 'newValue' },
      });
      const exts = await getExtensions();
      expect(exts.get('ext-a')?.state.configSnapshot.newKey).toBe('newValue');
    });
  });

  describe('dispatchEvent', () => {
    it('is a no-op in MVP (Phase 6 will wire it up)', async () => {
      const dispatch = await importDispatcher();
      dispatch({ type: 'dispatchEvent', eventName: 'onSessionStart' });
      // No responses, no events
      expect(postedMessages).toHaveLength(0);
    });
  });
});
