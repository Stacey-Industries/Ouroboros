/**
 * @vitest-environment jsdom
 *
 * Wave 88 Phase 4 — Orchestrator-owned acceptance test.
 *
 * This test asserts the cross-boundary contract for ChatOnlyTerminalToolBridge.
 * Per ~/.claude/rules/orchestrator-owned-acceptance-tests.md, this file is
 * authored by the orchestrator BEFORE Phase 4 implementer dispatch. The
 * implementer MUST NOT modify this file. They implement
 * `./ChatOnlyTerminalToolBridge.tsx` against the contract enumerated here
 * until every test passes.
 *
 * Contract under test:
 *
 * 1. `getTerminalOutput` (with no explicit sessionId) responds with the dock's
 *    ACTIVE session output — NOT the first-registered terminal fallback that
 *    `terminalRegistry.getTerminalLines(undefined)` would return. The whole
 *    reason this bridge exists is to avoid that wrong-semantics fallback that
 *    `IdeToolBridge` exhibits in ChatOnlyShell context (Wave 42 design intent
 *    + Wave 88 Decision 3).
 *
 * 2. `getTerminalOutput` with an explicit `sessionId` param honors the caller's
 *    choice (passes through to the registry without dock-active substitution).
 *
 * 3. File-viewer-flavored queries (`getOpenFiles`, `getActiveFile`,
 *    `getUnsavedContent`, `getSelection`) respond with an "unavailable in
 *    chat-only mode" error envelope — NOT a throw, NOT a silent empty success.
 *    Chat-only mode has no file editor state to report; the chat agent gets a
 *    structured signal rather than meaningless data.
 *
 * 4. The bridge does NOT depend on `useFileViewerManager()` context (which is
 *    not mounted in ChatOnlyShell scope). Mounting the bridge in a render tree
 *    without a FileViewerManager provider must not throw.
 *
 * The bridge's prop surface (`activeDockSessionId: string | null`) is the
 * testable seam. How the production caller sources this value (hook, context,
 * prop drilling from the dock) is an implementation decision the implementer
 * makes — but the prop seam is the contract this test pins.
 */

import { render } from '@testing-library/react';
import type { Terminal } from '@xterm/xterm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerTerminal, unregisterTerminal } from '../../Terminal/terminalRegistry';
import { ChatOnlyTerminalToolBridge } from './ChatOnlyTerminalToolBridge';

interface CapturedQuery {
  queryId: string;
  method: string;
  params?: unknown;
}

type QueryCallback = (q: CapturedQuery) => void;

const onQueryCallbacks: QueryCallback[] = [];
const respondMock = vi.fn();

beforeEach(() => {
  onQueryCallbacks.length = 0;
  respondMock.mockClear();

  // Install a minimal window.electronAPI.ideTools surface for the bridge to consume.
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

function makeFakeTerminal(content: string[]): Terminal {
  const lines = content.map((text) => ({
    translateToString: () => text,
  }));
  return {
    buffer: {
      active: {
        length: lines.length,
        getLine: (i: number) => lines[i],
      },
    },
    clear: vi.fn(),
  } as unknown as Terminal;
}

describe('ChatOnlyTerminalToolBridge — acceptance (Wave 88 Phase 4)', () => {
  describe('getTerminalOutput — dock-active-session routing', () => {
    it('responds with the dock active session lines, NOT the first-registered fallback', () => {
      const dockSessionId = 'dock-active-session';
      const otherSessionId = 'unrelated-other-session';
      // Register the "other" terminal FIRST so it would win the first-registered fallback.
      registerTerminal(otherSessionId, makeFakeTerminal(['other-line-A', 'other-line-B']));
      registerTerminal(dockSessionId, makeFakeTerminal(['dock-line-A', 'dock-line-B']));

      render(<ChatOnlyTerminalToolBridge activeDockSessionId={dockSessionId} />);

      const queryId = fireQuery('getTerminalOutput', {});

      expect(respondMock).toHaveBeenCalledTimes(1);
      const [calledQueryId, result, error] = respondMock.mock.calls[0];
      expect(calledQueryId).toBe(queryId);
      expect(error).toBeUndefined();
      // Result must contain dock content and must NOT contain the other terminal's content.
      const lines = result as string[];
      expect(lines.join('\n')).toContain('dock-line-A');
      expect(lines.join('\n')).not.toContain('other-line');

      unregisterTerminal(dockSessionId);
      unregisterTerminal(otherSessionId);
    });

    it('honors an explicit sessionId param without dock-active substitution', () => {
      const dockSessionId = 'dock-active-session';
      const explicitId = 'caller-specified-session';
      registerTerminal(dockSessionId, makeFakeTerminal(['dock-line']));
      registerTerminal(explicitId, makeFakeTerminal(['explicit-line']));

      render(<ChatOnlyTerminalToolBridge activeDockSessionId={dockSessionId} />);

      fireQuery('getTerminalOutput', { sessionId: explicitId });

      expect(respondMock).toHaveBeenCalledTimes(1);
      const lines = respondMock.mock.calls[0][1] as string[];
      expect(lines.join('\n')).toContain('explicit-line');
      expect(lines.join('\n')).not.toContain('dock-line');

      unregisterTerminal(dockSessionId);
      unregisterTerminal(explicitId);
    });

    it('returns an empty array when no dock session is active and no sessionId param given', () => {
      render(<ChatOnlyTerminalToolBridge activeDockSessionId={null} />);

      fireQuery('getTerminalOutput', {});

      expect(respondMock).toHaveBeenCalledTimes(1);
      const [, result, error] = respondMock.mock.calls[0];
      expect(error).toBeUndefined();
      expect(result).toEqual([]);
    });
  });

  describe('unsupported methods — chat-only mode unavailability envelope', () => {
    it.each([
      ['getOpenFiles', undefined],
      ['getActiveFile', undefined],
      ['getUnsavedContent', { path: '/some/file.ts' }],
      ['getSelection', undefined],
    ])('%s responds with null result + chat-only-mode error', (method, params) => {
      render(<ChatOnlyTerminalToolBridge activeDockSessionId={null} />);

      fireQuery(method, params);

      expect(respondMock).toHaveBeenCalledTimes(1);
      const [, result, error] = respondMock.mock.calls[0];
      expect(result).toBeNull();
      expect(typeof error).toBe('string');
      // Error text must reference chat-only mode AND signal unavailability,
      // so the consuming agent can distinguish this from a transport error.
      expect((error as string).toLowerCase()).toMatch(/chat[\s-]?only/);
      expect((error as string).toLowerCase()).toMatch(/unavail|not available|not supported/);
    });
  });

  describe('FileViewerManager independence', () => {
    it('mounts without a FileViewerManager provider — no context throw', () => {
      // ChatOnlyShell does not mount FileViewerManager at the bridge's scope
      // (Wave 42 design). If the bridge calls useFileViewerManager(), the missing
      // context throws at render. Assert no throw.
      expect(() => {
        render(<ChatOnlyTerminalToolBridge activeDockSessionId={null} />);
      }).not.toThrow();
    });
  });

  describe('Subscription lifecycle', () => {
    it('subscribes to onQuery on mount and unsubscribes on unmount', () => {
      const { unmount } = render(<ChatOnlyTerminalToolBridge activeDockSessionId={null} />);
      expect(onQueryCallbacks.length).toBe(1);

      unmount();
      expect(onQueryCallbacks.length).toBe(0);
    });

    it('does not double-respond when the same query fires twice in succession', () => {
      registerTerminal('dock-x', makeFakeTerminal(['line-x']));
      render(<ChatOnlyTerminalToolBridge activeDockSessionId="dock-x" />);

      fireQuery('getTerminalOutput', {});
      fireQuery('getTerminalOutput', {});

      // Two distinct queries → two distinct responds. Not one per query → 2 responds, not 4 or 0.
      expect(respondMock).toHaveBeenCalledTimes(2);
      unregisterTerminal('dock-x');
    });
  });
});
