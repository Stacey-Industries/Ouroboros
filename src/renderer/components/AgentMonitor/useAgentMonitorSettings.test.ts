/**
 * useAgentMonitorSettings.test.ts — Unit tests for useAgentMonitorSettings hook.
 * @vitest-environment jsdom
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentMonitorSettings, SessionRecord } from '../../types/electron';
import { useAgentMonitorSettings } from './useAgentMonitorSettings';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSession(id: string, settings?: AgentMonitorSettings): SessionRecord {
  return {
    id,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastUsedAt: new Date().toISOString(),
    projectRoot: '/projects/alpha',
    worktree: false,
    tags: [],
    activeTerminalIds: [],
    costRollup: { totalUsd: 0, inputTokens: 0, outputTokens: 0 },
    telemetry: { correlationIds: [], telemetrySessionId: id },
    agentMonitorSettings: settings,
  };
}

// ─── Mock API ─────────────────────────────────────────────────────────────────

type OnChangedCb = (sessions: SessionRecord[]) => void;

let onChangedCallback: OnChangedCb | null = null;

const mockApi = {
  sessionCrud: {
    active: vi.fn().mockResolvedValue({ success: true, sessionId: null }),
    list: vi.fn().mockResolvedValue({ success: true, sessions: [] }),
    updateAgentMonitorSettings: vi.fn().mockResolvedValue({ success: true }),
    onChanged: vi.fn((cb: OnChangedCb) => {
      onChangedCallback = cb;
      return vi.fn();
    }),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  onChangedCallback = null;

  mockApi.sessionCrud.active.mockResolvedValue({ success: true, sessionId: null });
  mockApi.sessionCrud.list.mockResolvedValue({ success: true, sessions: [] });
  mockApi.sessionCrud.updateAgentMonitorSettings.mockResolvedValue({ success: true });
  mockApi.sessionCrud.onChanged.mockImplementation((cb: OnChangedCb) => {
    onChangedCallback = cb;
    return vi.fn();
  });

  Object.defineProperty(window, 'electronAPI', {
    value: mockApi,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useAgentMonitorSettings — defaults', () => {
  it('returns normal viewMode as default when no session is active', async () => {
    const { result } = renderHook(() => useAgentMonitorSettings());
    await waitFor(() => expect(mockApi.sessionCrud.active).toHaveBeenCalled());
    expect(result.current.viewMode).toBe('normal');
  });

  it('returns empty inlineEventTypes as default', async () => {
    const { result } = renderHook(() => useAgentMonitorSettings());
    await waitFor(() => expect(mockApi.sessionCrud.active).toHaveBeenCalled());
    expect(result.current.inlineEventTypes).toEqual([]);
  });
});

describe('useAgentMonitorSettings — loads from active session', () => {
  it('reads viewMode from active session agentMonitorSettings', async () => {
    const session = makeSession('sess-1', { viewMode: 'verbose', inlineEventTypes: [] });
    mockApi.sessionCrud.active.mockResolvedValue({ success: true, sessionId: 'sess-1' });
    mockApi.sessionCrud.list.mockResolvedValue({ success: true, sessions: [session] });

    const { result } = renderHook(() => useAgentMonitorSettings());
    await waitFor(() => expect(result.current.viewMode).toBe('verbose'));
  });

  it('reads inlineEventTypes from active session', async () => {
    const session = makeSession('sess-2', {
      viewMode: 'summary',
      inlineEventTypes: ['pre_tool_use', 'notification'],
    });
    mockApi.sessionCrud.active.mockResolvedValue({ success: true, sessionId: 'sess-2' });
    mockApi.sessionCrud.list.mockResolvedValue({ success: true, sessions: [session] });

    const { result } = renderHook(() => useAgentMonitorSettings());
    await waitFor(() =>
      expect(result.current.inlineEventTypes).toEqual(['pre_tool_use', 'notification']),
    );
  });

  it('falls back to defaults when session has no agentMonitorSettings', async () => {
    const session = makeSession('sess-3', undefined);
    mockApi.sessionCrud.active.mockResolvedValue({ success: true, sessionId: 'sess-3' });
    mockApi.sessionCrud.list.mockResolvedValue({ success: true, sessions: [session] });

    const { result } = renderHook(() => useAgentMonitorSettings());
    await waitFor(() => expect(result.current.viewMode).toBe('normal'));
    expect(result.current.inlineEventTypes).toEqual([]);
  });
});

describe('useAgentMonitorSettings — updateSettings', () => {
  it('calls updateAgentMonitorSettings IPC with sessionId and settings', async () => {
    const session = makeSession('sess-4', { viewMode: 'summary', inlineEventTypes: [] });
    mockApi.sessionCrud.active.mockResolvedValue({ success: true, sessionId: 'sess-4' });
    mockApi.sessionCrud.list.mockResolvedValue({ success: true, sessions: [session] });

    const { result } = renderHook(() => useAgentMonitorSettings());
    // Wait for the async load to resolve — key off a distinctive non-default value.
    await waitFor(() => expect(result.current.viewMode).toBe('summary'));

    const next: AgentMonitorSettings = { viewMode: 'normal', inlineEventTypes: [] };
    await act(async () => {
      await result.current.updateSettings(next);
    });

    expect(mockApi.sessionCrud.updateAgentMonitorSettings).toHaveBeenCalledWith('sess-4', next);
  });

  it('optimistically updates viewMode before IPC round-trip', async () => {
    const session = makeSession('sess-5', { viewMode: 'summary', inlineEventTypes: [] });
    mockApi.sessionCrud.active.mockResolvedValue({ success: true, sessionId: 'sess-5' });
    mockApi.sessionCrud.list.mockResolvedValue({ success: true, sessions: [session] });

    const { result } = renderHook(() => useAgentMonitorSettings());
    await waitFor(() => expect(result.current.viewMode).toBe('summary'));

    const next: AgentMonitorSettings = { viewMode: 'verbose', inlineEventTypes: [] };
    await act(async () => {
      await result.current.updateSettings(next);
    });

    expect(result.current.viewMode).toBe('verbose');
  });

  it('does nothing when no session is active', async () => {
    const { result } = renderHook(() => useAgentMonitorSettings());
    await waitFor(() => expect(mockApi.sessionCrud.active).toHaveBeenCalled());

    await act(async () => {
      await result.current.updateSettings({ viewMode: 'verbose', inlineEventTypes: [] });
    });

    expect(mockApi.sessionCrud.updateAgentMonitorSettings).not.toHaveBeenCalled();
  });
});

describe('useAgentMonitorSettings — live updates', () => {
  it('reloads when onChanged fires', async () => {
    const session = makeSession('sess-6', { viewMode: 'normal', inlineEventTypes: [] });
    mockApi.sessionCrud.active.mockResolvedValue({ success: true, sessionId: 'sess-6' });
    mockApi.sessionCrud.list.mockResolvedValue({ success: true, sessions: [session] });

    const { result } = renderHook(() => useAgentMonitorSettings());
    await waitFor(() => expect(result.current.viewMode).toBe('normal'));

    const updatedSession = makeSession('sess-6', { viewMode: 'verbose', inlineEventTypes: [] });
    mockApi.sessionCrud.list.mockResolvedValue({ success: true, sessions: [updatedSession] });

    await act(async () => {
      onChangedCallback?.([updatedSession]);
    });

    await waitFor(() => expect(result.current.viewMode).toBe('verbose'));
  });
});
