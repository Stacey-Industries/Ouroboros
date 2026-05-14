/**
 * @vitest-environment jsdom
 *
 * Unit tests for ChatOnlyTerminalToolBridge.
 *
 * The orchestrator-owned acceptance test
 * (ChatOnlyTerminalToolBridge.acceptance.test.tsx) covers the full
 * cross-boundary contract. These unit tests cover the internal helper
 * logic and edge cases at the component boundary.
 */

import { render } from '@testing-library/react';
import type { Terminal } from '@xterm/xterm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerTerminal, unregisterTerminal } from '../../Terminal/terminalRegistry';
import { ChatOnlyTerminalToolBridge } from './ChatOnlyTerminalToolBridge';

// ── Minimal electronAPI stub ──────────────────────────────────────────────────

type QueryCallback = (q: { queryId: string; method: string; params?: unknown }) => void;

const onQueryCallbacks: QueryCallback[] = [];
const respondMock = vi.fn();

beforeEach(() => {
  onQueryCallbacks.length = 0;
  respondMock.mockClear();

  (window as unknown as { electronAPI: unknown }).electronAPI = {
    ideTools: {
      onQuery: (callback: QueryCallback) => {
        onQueryCallbacks.push(callback);
        return () => {
          const idx = onQueryCallbacks.indexOf(callback);
          if (idx >= 0) onQueryCallbacks.splice(idx, 1);
        };
      },
      respond: async (queryId: string, result: unknown, error?: string) => {
        respondMock(queryId, result, error);
        return { success: true };
      },
    },
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

function fireQuery(method: string, params?: unknown): string {
  const queryId = `q-${Math.random().toString(36).slice(2)}`;
  for (const cb of onQueryCallbacks) {
    cb({ queryId, method, params });
  }
  return queryId;
}

function makeFakeTerminal(lines: string[]): Terminal {
  const rows = lines.map((text) => ({
    translateToString: () => text,
  }));
  return {
    buffer: {
      active: {
        length: rows.length,
        getLine: (i: number) => rows[i],
      },
    },
    clear: vi.fn(),
  } as unknown as Terminal;
}

// ── getTerminalOutput routing ─────────────────────────────────────────────────

describe('getTerminalOutput — dock-active routing', () => {
  it('returns dock-active session lines when no sessionId param is given', () => {
    registerTerminal('session-a', makeFakeTerminal(['line-from-a']));
    registerTerminal('session-b', makeFakeTerminal(['line-from-b']));

    render(<ChatOnlyTerminalToolBridge activeDockSessionId="session-b" />);
    fireQuery('getTerminalOutput', {});

    const [, result] = respondMock.mock.calls[0];
    const lines = result as string[];
    expect(lines.join('\n')).toContain('line-from-b');
    expect(lines.join('\n')).not.toContain('line-from-a');

    unregisterTerminal('session-a');
    unregisterTerminal('session-b');
  });

  it('returns empty array when activeDockSessionId is null and no sessionId param given', () => {
    render(<ChatOnlyTerminalToolBridge activeDockSessionId={null} />);
    fireQuery('getTerminalOutput', {});

    const [, result, error] = respondMock.mock.calls[0];
    expect(error).toBeUndefined();
    expect(result).toEqual([]);
  });

  it('uses explicit sessionId param without dock substitution', () => {
    registerTerminal('dock', makeFakeTerminal(['dock-line']));
    registerTerminal('explicit', makeFakeTerminal(['explicit-line']));

    render(<ChatOnlyTerminalToolBridge activeDockSessionId="dock" />);
    fireQuery('getTerminalOutput', { sessionId: 'explicit' });

    const [, result] = respondMock.mock.calls[0];
    const lines = result as string[];
    expect(lines.join('\n')).toContain('explicit-line');
    expect(lines.join('\n')).not.toContain('dock-line');

    unregisterTerminal('dock');
    unregisterTerminal('explicit');
  });
});

// ── File-viewer unavailability envelope ───────────────────────────────────────

describe('file-viewer methods — unavailability envelope', () => {
  it.each(['getOpenFiles', 'getActiveFile', 'getUnsavedContent', 'getSelection'])(
    '%s responds with null result and chat-only-mode error string',
    (method) => {
      render(<ChatOnlyTerminalToolBridge activeDockSessionId={null} />);
      fireQuery(method);

      const [, result, error] = respondMock.mock.calls[0];
      expect(result).toBeNull();
      expect(typeof error).toBe('string');
      expect((error as string).toLowerCase()).toMatch(/chat[\s-]?only/);
      expect((error as string).toLowerCase()).toMatch(/unavail|not available|not supported/);
    },
  );
});

// ── Unknown method ────────────────────────────────────────────────────────────

describe('unknown method', () => {
  it('responds with null result and an error string mentioning chat-only mode', () => {
    render(<ChatOnlyTerminalToolBridge activeDockSessionId={null} />);
    fireQuery('getProjectInfo');

    const [, result, error] = respondMock.mock.calls[0];
    expect(result).toBeNull();
    expect(typeof error).toBe('string');
    expect((error as string).toLowerCase()).toContain('chat-only');
  });
});

// ── Subscription lifecycle ────────────────────────────────────────────────────

describe('subscription lifecycle', () => {
  it('registers on mount and unregisters on unmount', () => {
    const { unmount } = render(<ChatOnlyTerminalToolBridge activeDockSessionId={null} />);
    expect(onQueryCallbacks).toHaveLength(1);
    unmount();
    expect(onQueryCallbacks).toHaveLength(0);
  });
});
