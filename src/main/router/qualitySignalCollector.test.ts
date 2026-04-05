import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  _getPendingCount,
  _resetState,
  trackChatTurn,
  trackSessionEnd,
  trackTaskCompleted,
} from './qualitySignalCollector';
import {
  computeJaccardOverlap,
  isCorrectionPrefix,
  isValidCwd,
} from './qualitySignalCollectorHelpers';

// Mock electron + fs to prevent real I/O
vi.mock('electron', () => ({ app: { getPath: () => '/tmp/test-quality' } }));
vi.mock('node:fs', () => ({
  default: { appendFileSync: vi.fn() },
}));
vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}));

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  _resetState();
});
afterEach(() => {
  _resetState();
});

// ─── Helper tests ─────────────────────────────────────────────────────────────

describe('computeJaccardOverlap', () => {
  it('returns 0 for short texts (< 5 words)', () => {
    expect(computeJaccardOverlap('yes', 'yes')).toBe(0);
    expect(computeJaccardOverlap('do it now', 'do it now')).toBe(0);
  });

  it('returns 1.0 for identical texts with enough words', () => {
    const text = 'please fix the authentication bug in the login flow';
    expect(computeJaccardOverlap(text, text)).toBe(1);
  });

  it('returns high overlap for similar prompts', () => {
    const a = 'please fix the authentication bug in the login flow';
    const b = 'please fix the authentication issue in the login flow';
    expect(computeJaccardOverlap(a, b)).toBeGreaterThan(0.7);
  });

  it('returns low overlap for different prompts', () => {
    const a = 'please fix the authentication bug in the login flow';
    const b = 'add a new button to the settings page for dark mode';
    expect(computeJaccardOverlap(a, b)).toBeLessThan(0.3);
  });

  it('handles empty strings', () => {
    expect(computeJaccardOverlap('', '')).toBe(0);
    expect(computeJaccardOverlap('hello world', '')).toBe(0);
  });
});

describe('isCorrectionPrefix', () => {
  it('detects correction prefixes', () => {
    expect(isCorrectionPrefix('actually, I wanted something else')).toBe(true);
    expect(isCorrectionPrefix('no wait, do it differently')).toBe(true);
    expect(isCorrectionPrefix('I meant the other file')).toBe(true);
    expect(isCorrectionPrefix('scratch that, start over')).toBe(true);
    expect(isCorrectionPrefix('sorry, I should have said...')).toBe(true);
  });

  it('returns false for normal prompts', () => {
    expect(isCorrectionPrefix('fix the bug in auth')).toBe(false);
    expect(isCorrectionPrefix('what does this function do?')).toBe(false);
    expect(isCorrectionPrefix('yes')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isCorrectionPrefix('Actually, change the approach')).toBe(true);
    expect(isCorrectionPrefix('NO WAIT, stop')).toBe(true);
  });

  it('handles leading whitespace', () => {
    expect(isCorrectionPrefix('  actually, use the other API')).toBe(true);
  });
});

describe('isValidCwd', () => {
  it('accepts absolute paths', () => {
    expect(isValidCwd('/home/user/project')).toBe(true);
    expect(isValidCwd('C:\\Users\\dev\\project')).toBe(true);
  });

  it('rejects relative paths', () => {
    expect(isValidCwd('relative/path')).toBe(false);
    expect(isValidCwd('./relative')).toBe(false);
  });

  it('rejects undefined and empty', () => {
    expect(isValidCwd(undefined)).toBe(false);
    expect(isValidCwd('')).toBe(false);
  });
});

// ─── Collector tests ──────────────────────────────────────────────────────────

describe('trackChatTurn', () => {
  it('does nothing on first turn (no history to compare)', () => {
    trackChatTurn({ traceId: 't1', threadId: 'th1', prompt: 'fix the bug' });
    expect(_getPendingCount()).toBe(0);
  });

  it('detects regeneration when prompts are similar', () => {
    trackChatTurn({
      traceId: 't1',
      threadId: 'th1',
      prompt: 'please fix the authentication bug in the login flow',
    });
    trackChatTurn({
      traceId: 't2',
      threadId: 'th1',
      prompt: 'please fix the authentication issue in the login flow',
    });
    expect(_getPendingCount()).toBeGreaterThanOrEqual(1);
  });

  it('does not detect regeneration for different prompts', () => {
    trackChatTurn({
      traceId: 't1',
      threadId: 'th1',
      prompt: 'please fix the authentication bug in the login flow',
    });
    trackChatTurn({
      traceId: 't2',
      threadId: 'th1',
      prompt: 'add a new button to the settings page for dark mode',
    });
    expect(_getPendingCount()).toBe(0);
  });

  it('detects correction prefix on follow-up', () => {
    trackChatTurn({
      traceId: 't1',
      threadId: 'th1',
      prompt: 'implement the feature with React hooks',
    });
    trackChatTurn({
      traceId: 't2',
      threadId: 'th1',
      prompt: 'actually, use class components instead',
    });
    // Should have at least 1 annotation (correction; regeneration may or may not fire)
    expect(_getPendingCount()).toBeGreaterThanOrEqual(1);
  });

  it('tracks separate threads independently', () => {
    trackChatTurn({
      traceId: 't1',
      threadId: 'thread-A',
      prompt: 'please fix the authentication bug in the login flow',
    });
    trackChatTurn({
      traceId: 't2',
      threadId: 'thread-B',
      prompt: 'please fix the authentication bug in the login flow',
    });
    // Different threads — no regeneration
    expect(_getPendingCount()).toBe(0);
  });

  it('skips when threadId is missing', () => {
    trackChatTurn({ traceId: 't1', prompt: 'test' });
    expect(_getPendingCount()).toBe(0);
  });
});

describe('trackSessionEnd', () => {
  it('emits terminal_natural_stop for session_stop', () => {
    trackSessionEnd({ type: 'session_stop', sessionId: 's1' });
    expect(_getPendingCount()).toBe(1);
  });

  it('emits terminal_natural_stop for agent_end', () => {
    trackSessionEnd({ type: 'agent_end', sessionId: 's1' });
    expect(_getPendingCount()).toBe(1);
  });

  it('emits terminal_user_abort for other end types', () => {
    trackSessionEnd({ type: 'agent_stop', sessionId: 's1' });
    expect(_getPendingCount()).toBe(1);
  });
});

describe('trackTaskCompleted', () => {
  it('emits task_completed annotation', () => {
    trackTaskCompleted('s1');
    expect(_getPendingCount()).toBe(1);
  });
});
