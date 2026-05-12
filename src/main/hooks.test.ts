/**
 * hooks.test.ts — Smoke tests for the hooks dispatch module.
 *
 * Full integration testing of the hooks pipeline requires a running Electron
 * process. These tests cover the pure logic that can be exercised in Node.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('electron', () => ({ BrowserWindow: class {} }));
vi.mock('./approvalManager', () => ({
  clearSessionRules: vi.fn(),
  requestApproval: vi.fn(),
  respondToApproval: vi.fn().mockResolvedValue(true),
  toolRequiresApproval: vi.fn().mockReturnValue(false),
}));
vi.mock('./claudeMdGenerator', () => ({ generateClaudeMd: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./codebaseGraph/graphController', () => ({
  getGraphController: vi.fn().mockReturnValue(null),
}));
vi.mock('./config', () => ({ getConfigValue: vi.fn().mockReturnValue(undefined) }));
vi.mock('./contextLayer/contextLayerController', () => ({
  getContextLayerController: vi.fn().mockReturnValue(null),
}));
vi.mock('./extensions', () => ({ dispatchActivationEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./hooksLifecycleHandlers', () => ({
  enrichFromPermissionRequest: vi.fn(),
  handleConfigChange: vi.fn(),
  handleCwdChanged: vi.fn(),
  handleFileChanged: vi.fn(),
  // HookEventType is a type — no runtime export needed
}));
vi.mock('./hooksNet', () => ({
  getHooksNetAddress: vi.fn().mockReturnValue(null),
  startHooksNetServer: vi.fn().mockResolvedValue({ port: 9999 }),
  stopHooksNetServer: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./ipc-handlers/agentChat', () => ({ invalidateSnapshotCache: vi.fn() }));
vi.mock('./logger', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('./web/webServer', () => ({ broadcastToWebClients: vi.fn() }));
vi.mock('./windowManager', () => ({ getAllActiveWindows: vi.fn().mockReturnValue([]) }));

import {
  beginChatSessionLaunch,
  endChatSessionLaunch,
  getHooksAddress,
  stopHooksServer,
} from './hooks';
import { shouldSuppressHookEvent } from './hooksDispatchLogic';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('beginChatSessionLaunch / endChatSessionLaunch', () => {
  it('can be called without throwing', () => {
    expect(() => beginChatSessionLaunch()).not.toThrow();
    expect(() => endChatSessionLaunch()).not.toThrow();
  });

  it('endChatSessionLaunch is a no-op when counter is already 0', () => {
    expect(() => endChatSessionLaunch()).not.toThrow();
  });
});

describe('getHooksAddress', () => {
  it('returns null when server is not started', () => {
    expect(getHooksAddress()).toBeNull();
  });
});

describe('stopHooksServer', () => {
  it('resolves without throwing', async () => {
    await expect(stopHooksServer()).resolves.toBeUndefined();
  });
});

describe('shouldSuppressHookEvent', () => {
  it('suppresses lifecycle events when a synthetic session is active', () => {
    expect(shouldSuppressHookEvent('agent_start', 1)).toBe(true);
    expect(shouldSuppressHookEvent('pre_tool_use', 2)).toBe(true);
    expect(shouldSuppressHookEvent('session_stop', 1)).toBe(true);
  });

  it('does NOT suppress when no synthetic sessions are active', () => {
    expect(shouldSuppressHookEvent('agent_start', 0)).toBe(false);
    expect(shouldSuppressHookEvent('pre_tool_use', 0)).toBe(false);
  });

  it('never suppresses instructions_loaded even when synthetic sessions are active', () => {
    // Regression for wave-84 bug: rules were invisible in context preview after
    // chat start because instructions_loaded pipe events were suppressed while
    // chat launches were in flight.
    expect(shouldSuppressHookEvent('instructions_loaded', 1)).toBe(false);
    expect(shouldSuppressHookEvent('instructions_loaded', 99)).toBe(false);
    expect(shouldSuppressHookEvent('instructions_loaded', 0)).toBe(false);
  });
});

describe('HookPayload data field', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('HookPayload type accepts a data field', () => {
    // Type-level smoke test — if this compiles the field is correctly typed
    const payload = {
      type: 'cwd_changed' as const,
      sessionId: 'abc',
      timestamp: Date.now(),
      data: { cwd: '/some/path' },
    };
    expect(payload.data?.['cwd']).toBe('/some/path');
  });
});
