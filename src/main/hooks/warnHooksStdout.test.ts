/**
 * warnHooksStdout.test.ts — Wave 76 Phase D
 *
 * Integration-lite test for the warn-hooks-stdout-surfacing path.
 * Covers: evaluator → runPreToolEnforcement → resolveEnforcementResponse
 * → approval response shape that pre_tool_use.mjs writes to stdout as JSON.
 */

import { describe, expect, it, vi } from 'vitest';

// ── Electron + deep-dep mocks (must precede module imports) ──────────────────
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/test-userdata', getAppPath: () => '/tmp/app' },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  Notification: { isSupported: () => false },
}));

vi.mock('../configStoreLazy', () => ({
  lazyStore: { get: () => undefined, set: vi.fn(), store: {} },
  ensureStore: () => ({ get: () => undefined, set: vi.fn(), store: {} }),
}));

vi.mock('../agentChat/threadStore', () => ({
  getDefaultAgentChatThreadStoreDir: () => '/tmp/threads',
  createAgentChatThreadStore: () => ({}),
}));

// ── Subject under test ────────────────────────────────────────────────────────

import type { HookPayload } from '../hooks';
import { resolveEnforcementResponse, runPreToolEnforcement } from '../hooksSessionHandlers';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bashPayload(command: string): HookPayload {
  return {
    type: 'pre_tool_use',
    sessionId: 'test-session',
    toolName: 'Bash',
    requestId: 'req-test',
    timestamp: Date.now(),
    input: { tool_input: { command } },
  };
}

function nonBashPayload(): HookPayload {
  return {
    type: 'pre_tool_use',
    sessionId: 'test-session',
    toolName: 'Read',
    requestId: 'req-test',
    timestamp: Date.now(),
    input: {},
  };
}

// ─── runPreToolEnforcement — warn path ────────────────────────────────────────

describe('runPreToolEnforcement — warnFullTestSuite', () => {
  it('returns warn for npm test without path', () => {
    const result = runPreToolEnforcement(bashPayload('npm test'));
    expect(result.kind).toBe('warn');
    if (result.kind === 'warn') {
      expect(result.ruleName).toBe('test-scope');
      expect(result.message).toContain('Full test suite');
    }
  });

  it('returns warn for npx vitest run without path', () => {
    const result = runPreToolEnforcement(bashPayload('npx vitest run'));
    expect(result.kind).toBe('warn');
  });

  it('returns pass for npm test with explicit path', () => {
    const result = runPreToolEnforcement(bashPayload('npm test src/main/hooks/'));
    expect(result.kind).toBe('pass');
  });

  it('returns pass for non-Bash tool', () => {
    const result = runPreToolEnforcement(nonBashPayload());
    expect(result.kind).toBe('pass');
  });
});

// ─── resolveEnforcementResponse — approval response shape ────────────────────

describe('resolveEnforcementResponse — approval response shape', () => {
  it('returns approve + message for warn decision (npm test)', () => {
    const response = resolveEnforcementResponse(bashPayload('npm test'));
    expect(response).not.toBeNull();
    expect(response?.decision).toBe('approve');
    expect(typeof response?.message).toBe('string');
    expect(response?.message).toContain('Full test suite');
  });

  it('returns null for pass decision (scoped test)', () => {
    const response = resolveEnforcementResponse(bashPayload('npm test src/main/hooks/'));
    expect(response).toBeNull();
  });

  it('returns null for non-Bash tool', () => {
    const response = resolveEnforcementResponse(nonBashPayload());
    expect(response).toBeNull();
  });
});

// ─── Protocol shape — pre_tool_use.mjs stdout JSON ───────────────────────────

describe('warn stdout JSON shape (protocol contract)', () => {
  it('approve + message produces valid systemMessage JSON', () => {
    const response = resolveEnforcementResponse(bashPayload('npm test'));
    expect(response).not.toBeNull();
    if (!response?.message) throw new Error('expected message');

    // Simulate what pre_tool_use.mjs writes to stdout
    const json = JSON.stringify({
      hookSpecificOutput: { permissionDecision: 'allow' },
      systemMessage: response.message,
    });

    const parsed = JSON.parse(json);
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('allow');
    expect(typeof parsed.systemMessage).toBe('string');
    expect(parsed.systemMessage.length).toBeGreaterThan(0);
  });
});
