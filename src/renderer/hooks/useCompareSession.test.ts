/**
 * useCompareSession.test.ts — Wave 36 Phase F
 * @vitest-environment jsdom
 *
 * Tests hook lifecycle: spawn fires two IPC calls, events from both providers
 * route to the right pane, cancel kills both.
 */

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── electronAPI mock ──────────────────────────────────────────────────────────

type EventCb = (payload: {
  compareId: string;
  providerId: string;
  event: { type: string; sessionId: string; payload: unknown; at: number };
}) => void;

const mockStart = vi.fn();
const mockCancel = vi.fn();
const mockOnEvent = vi.fn();

function setupElectronAPI() {
  let listener: EventCb | null = null;
  mockOnEvent.mockImplementation((cb: EventCb) => {
    listener = cb;
    return () => { listener = null; };
  });

  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      compareProviders: {
        start: mockStart,
        cancel: mockCancel,
        onEvent: mockOnEvent,
      },
    },
  });

  return {
    emitEvent: (payload: Parameters<EventCb>[0]) => { listener?.(payload); },
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('useCompareSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('starts in idle status', async () => {
    setupElectronAPI();
    const { useCompareSession } = await import('./useCompareSession');
    const { result } = renderHook(() => useCompareSession());
    expect(result.current.state.status).toBe('idle');
    expect(result.current.state.compareId).toBeNull();
  });

  it('transitions to running after a successful start', async () => {
    setupElectronAPI();
    mockStart.mockResolvedValue({ success: true, compareId: 'cmp-1', sessions: [] });

    const { useCompareSession } = await import('./useCompareSession');
    const { result } = renderHook(() => useCompareSession());

    await act(async () => {
      await result.current.start({
        prompt: 'hello',
        projectPath: '/proj',
        providerIds: ['claude', 'codex'],
      });
    });

    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockStart).toHaveBeenCalledWith({
      prompt: 'hello',
      projectPath: '/proj',
      providerIds: ['claude', 'codex'],
    });
    expect(result.current.state.compareId).toBe('cmp-1');
    expect(result.current.state.status).toBe('running');
  });

  it('transitions to error when start returns success: false', async () => {
    setupElectronAPI();
    mockStart.mockResolvedValue({ success: false, error: 'provider unavailable' });

    const { useCompareSession } = await import('./useCompareSession');
    const { result } = renderHook(() => useCompareSession());

    await act(async () => {
      await result.current.start({
        prompt: 'test',
        projectPath: '/proj',
        providerIds: ['claude', 'gemini'],
      });
    });

    expect(result.current.state.status).toBe('error');
    expect(result.current.state.error).toBe('provider unavailable');
  });

  it('routes stdout events to pane A when providerId matches', async () => {
    const { emitEvent } = setupElectronAPI();
    mockStart.mockResolvedValue({ success: true, compareId: 'cmp-2', sessions: [] });

    const { useCompareSession } = await import('./useCompareSession');
    const { result } = renderHook(() => useCompareSession());

    await act(async () => {
      await result.current.start({
        prompt: 'q',
        projectPath: '/p',
        providerIds: ['claude', 'codex'],
      });
    });

    act(() => {
      emitEvent({
        compareId: 'cmp-2',
        providerId: 'claude',
        event: { type: 'stdout', sessionId: 's1', payload: 'hello ', at: 1 },
      });
    });

    expect(result.current.state.paneA.text).toBe('hello ');
    expect(result.current.state.paneA.status).toBe('streaming');
    expect(result.current.state.paneB.text).toBe('');
  });

  it('routes stdout events to pane B when providerId matches', async () => {
    const { emitEvent } = setupElectronAPI();
    mockStart.mockResolvedValue({ success: true, compareId: 'cmp-3', sessions: [] });

    const { useCompareSession } = await import('./useCompareSession');
    const { result } = renderHook(() => useCompareSession());

    await act(async () => {
      await result.current.start({
        prompt: 'q',
        projectPath: '/p',
        providerIds: ['claude', 'codex'],
      });
    });

    act(() => {
      emitEvent({
        compareId: 'cmp-3',
        providerId: 'codex',
        event: { type: 'stdout', sessionId: 's2', payload: 'world', at: 2 },
      });
    });

    expect(result.current.state.paneB.text).toBe('world');
    expect(result.current.state.paneA.text).toBe('');
  });

  it('ignores events for a different compareId', async () => {
    const { emitEvent } = setupElectronAPI();
    mockStart.mockResolvedValue({ success: true, compareId: 'cmp-4', sessions: [] });

    const { useCompareSession } = await import('./useCompareSession');
    const { result } = renderHook(() => useCompareSession());

    await act(async () => {
      await result.current.start({
        prompt: 'q', projectPath: '/p', providerIds: ['claude', 'codex'],
      });
    });

    act(() => {
      emitEvent({
        compareId: 'cmp-OTHER',
        providerId: 'claude',
        event: { type: 'stdout', sessionId: 's3', payload: 'stray', at: 3 },
      });
    });

    expect(result.current.state.paneA.text).toBe('');
    expect(result.current.state.paneB.text).toBe('');
  });

  it('calls cancel IPC and transitions to cancelled', async () => {
    setupElectronAPI();
    mockStart.mockResolvedValue({ success: true, compareId: 'cmp-5', sessions: [] });
    mockCancel.mockResolvedValue({ success: true });

    const { useCompareSession } = await import('./useCompareSession');
    const { result } = renderHook(() => useCompareSession());

    await act(async () => {
      await result.current.start({
        prompt: 'q', projectPath: '/p', providerIds: ['claude', 'codex'],
      });
    });

    await act(async () => {
      await result.current.cancel();
    });

    expect(mockCancel).toHaveBeenCalledWith('cmp-5');
    expect(result.current.state.status).toBe('cancelled');
  });

  it('marks status completed when both panes receive completion events', async () => {
    const { emitEvent } = setupElectronAPI();
    mockStart.mockResolvedValue({ success: true, compareId: 'cmp-6', sessions: [] });

    const { useCompareSession } = await import('./useCompareSession');
    const { result } = renderHook(() => useCompareSession());

    await act(async () => {
      await result.current.start({
        prompt: 'q', projectPath: '/p', providerIds: ['claude', 'codex'],
      });
    });

    act(() => {
      emitEvent({ compareId: 'cmp-6', providerId: 'claude',
        event: { type: 'completion', sessionId: 's1', payload: null, at: 10 } });
    });
    // Still running — only one side done
    expect(result.current.state.status).toBe('running');

    act(() => {
      emitEvent({ compareId: 'cmp-6', providerId: 'codex',
        event: { type: 'completion', sessionId: 's2', payload: null, at: 11 } });
    });
    expect(result.current.state.status).toBe('completed');
  });
});
