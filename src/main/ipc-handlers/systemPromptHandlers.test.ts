/**
 * systemPromptHandlers.test.ts — Unit tests for Wave 37 Phase A IPC logic.
 *
 * Tests cache hit / miss / clear behaviour via the shared ptyAgentBridge
 * exports consumed by the handler.  ipcMain is mocked so no Electron
 * bootstrap is needed.
 *
 * Run with:
 *   npx vitest run src/main/ipc-handlers/systemPromptHandlers.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock electron ─────────────────────────────────────────────────────────────
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
  app: { getPath: () => '/mock/userData' },
}));

// ── Import modules after mocks ────────────────────────────────────────────────
import {
  clearSystemPromptForSession,
  getSystemPromptForSession,
} from '../ptyAgentBridge';
import {
  cleanupSystemPromptHandlers,
  registerSystemPromptHandlers,
} from './systemPromptHandlers';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_A = 'sess-a-1234';
const SESSION_B = 'sess-b-5678';
const PROMPT_TEXT = 'You are a helpful assistant.';

// ─────────────────────────────────────────────────────────────────────────────
// Cache miss tests (independent of ptyAgentBridge factory)
// ─────────────────────────────────────────────────────────────────────────────

describe('getSystemPromptForSession', () => {
  beforeEach(() => {
    clearSystemPromptForSession(SESSION_A);
    clearSystemPromptForSession(SESSION_B);
  });

  afterEach(() => {
    clearSystemPromptForSession(SESSION_A);
    clearSystemPromptForSession(SESSION_B);
  });

  it('returns null for an unknown session', () => {
    expect(getSystemPromptForSession('no-such-id')).toBeNull();
  });

  it('returns null after clear', () => {
    clearSystemPromptForSession(SESSION_A);
    expect(getSystemPromptForSession(SESSION_A)).toBeNull();
  });

  it('clears without error when session not in cache', () => {
    expect(() => clearSystemPromptForSession('ghost-session')).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bridge integration — system event populates cache
// ─────────────────────────────────────────────────────────────────────────────

describe('createAgentBridge → system/init caches prompt', () => {
  beforeEach(() => {
    clearSystemPromptForSession(SESSION_A);
    clearSystemPromptForSession(SESSION_B);
  });

  afterEach(() => {
    clearSystemPromptForSession(SESSION_A);
    clearSystemPromptForSession(SESSION_B);
  });

  it('caches system_prompt from system/init event', async () => {
    const { createAgentBridge } = await import('../ptyAgentBridge');
    const bridge = createAgentBridge({
      sessionId: SESSION_A,
      onEvent: vi.fn(),
      onComplete: vi.fn(),
    });
    const event = JSON.stringify({
      type: 'system',
      subtype: 'init',
      system_prompt: PROMPT_TEXT,
      session_id: SESSION_A,
    });
    bridge.feed(`${event}\n`);
    const entry = getSystemPromptForSession(SESSION_A);
    expect(entry).not.toBeNull();
    expect(entry?.text).toBe(PROMPT_TEXT);
    expect(typeof entry?.at).toBe('number');
    bridge.dispose();
  });

  it('falls back to JSON.stringify when system_prompt field absent', async () => {
    const { createAgentBridge } = await import('../ptyAgentBridge');
    const bridge = createAgentBridge({
      sessionId: SESSION_B,
      onEvent: vi.fn(),
      onComplete: vi.fn(),
    });
    const event = JSON.stringify({ type: 'system', subtype: 'init', session_id: SESSION_B });
    bridge.feed(`${event}\n`);
    const entry = getSystemPromptForSession(SESSION_B);
    expect(entry).not.toBeNull();
    expect(typeof entry?.text).toBe('string');
    bridge.dispose();
  });

  it('does not cache hook_started system events', async () => {
    const { createAgentBridge } = await import('../ptyAgentBridge');
    const bridge = createAgentBridge({
      sessionId: SESSION_A,
      onEvent: vi.fn(),
      onComplete: vi.fn(),
    });
    const event = JSON.stringify({
      type: 'system',
      subtype: 'hook_started',
      system_prompt: 'should not appear',
      session_id: SESSION_A,
    });
    bridge.feed(`${event}\n`);
    expect(getSystemPromptForSession(SESSION_A)).toBeNull();
    bridge.dispose();
  });

  it('caches only the first init event', async () => {
    const { createAgentBridge } = await import('../ptyAgentBridge');
    const bridge = createAgentBridge({
      sessionId: SESSION_A,
      onEvent: vi.fn(),
      onComplete: vi.fn(),
    });
    const first = JSON.stringify({ type: 'system', subtype: 'init', system_prompt: 'first', session_id: SESSION_A });
    const second = JSON.stringify({ type: 'system', subtype: 'init', system_prompt: 'second', session_id: SESSION_A });
    bridge.feed(`${first}\n${second}\n`);
    expect(getSystemPromptForSession(SESSION_A)?.text).toBe('first');
    bridge.dispose();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Handler registration (smoke test — ipcMain.handle is mocked)
// ─────────────────────────────────────────────────────────────────────────────

describe('registerSystemPromptHandlers', () => {
  it('returns the expected channel list', () => {
    const channels = registerSystemPromptHandlers();
    expect(channels).toContain('sessions:getSystemPrompt');
  });

  it('cleanupSystemPromptHandlers does not throw', () => {
    expect(() => cleanupSystemPromptHandlers()).not.toThrow();
  });
});
