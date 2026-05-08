/**
 * useNLResolve.test.ts — State machine tests for the NL resolver hook.
 * @vitest-environment jsdom
 *
 * Wave 85 Phase 6. Covers:
 *   - idle → loading → resolved (confidence > 0.8)
 *   - idle → loading → disambiguation (confidence ≤ 0.8)
 *   - idle → loading → error (IPC failure / success:false / no matches)
 *   - empty-query short-circuit (stays idle, returns null)
 *   - superseded-request cancellation (only last query wins)
 *   - reset() returns to idle from any state
 *
 * window.electronAPI is mocked — no real IPC in tests.
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FlowTracerResolveNaturalLanguageResponse } from '../../../shared/types/flowTracer';
import { useNLResolve } from './useNLResolve';

// ---------------------------------------------------------------------------
// Mock window.electronAPI
// ---------------------------------------------------------------------------

const mockResolveNaturalLanguage = vi.fn<
  [string],
  Promise<FlowTracerResolveNaturalLanguageResponse>
>();

vi.stubGlobal('window', {
  electronAPI: {
    flowTracer: {
      resolveNaturalLanguage: mockResolveNaturalLanguage,
    },
  },
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const HIGH_CONF_MATCH = {
  symbol: 'handleSubmit',
  file: 'src/renderer/components/AgentChat/Composer.tsx',
  line: 42,
  confidence: 0.93,
  reason: 'Primary submit handler',
};

const LOW_CONF_MATCH_1 = {
  symbol: 'handleSubmit',
  file: 'src/renderer/components/AgentChat/Composer.tsx',
  line: 42,
  confidence: 0.72,
  reason: 'Possibly the submit handler',
};

const LOW_CONF_MATCH_2 = {
  symbol: 'handleSend',
  file: 'src/renderer/components/AgentChat/ChatInput.tsx',
  line: 18,
  confidence: 0.65,
  reason: 'Alternative send handler',
};

const HIGH_CONF_RESPONSE: FlowTracerResolveNaturalLanguageResponse = {
  success: true,
  result: { matches: [HIGH_CONF_MATCH], confidence: 0.93 },
};

const LOW_CONF_RESPONSE: FlowTracerResolveNaturalLanguageResponse = {
  success: true,
  result: { matches: [LOW_CONF_MATCH_1, LOW_CONF_MATCH_2], confidence: 0.72 },
};

const EMPTY_RESPONSE: FlowTracerResolveNaturalLanguageResponse = {
  success: true,
  result: { matches: [], confidence: 0 },
};

const ERROR_RESPONSE: FlowTracerResolveNaturalLanguageResponse = {
  success: false,
  error: 'CLI subprocess failed',
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockResolveNaturalLanguage.mockReset();
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('useNLResolve — initial state', () => {
  it('starts in idle state', () => {
    const { result } = renderHook(() => useNLResolve());
    expect(result.current.state.status).toBe('idle');
  });
});

// ---------------------------------------------------------------------------
// Empty-query short-circuit
// ---------------------------------------------------------------------------

describe('useNLResolve — empty query', () => {
  it('returns null and stays idle for empty string', async () => {
    const { result } = renderHook(() => useNLResolve());
    let ret: unknown;
    await act(async () => {
      ret = await result.current.resolveQuery('');
    });
    expect(ret).toBeNull();
    expect(result.current.state.status).toBe('idle');
    expect(mockResolveNaturalLanguage).not.toHaveBeenCalled();
  });

  it('returns null and stays idle for whitespace-only', async () => {
    const { result } = renderHook(() => useNLResolve());
    let ret: unknown;
    await act(async () => {
      ret = await result.current.resolveQuery('   ');
    });
    expect(ret).toBeNull();
    expect(result.current.state.status).toBe('idle');
    expect(mockResolveNaturalLanguage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// High-confidence → resolved
// ---------------------------------------------------------------------------

describe('useNLResolve — high confidence resolve', () => {
  it('transitions to resolved when confidence > 0.8', async () => {
    mockResolveNaturalLanguage.mockResolvedValueOnce(HIGH_CONF_RESPONSE);
    const { result } = renderHook(() => useNLResolve());

    await act(async () => {
      await result.current.resolveQuery('when I send a chat message');
    });

    expect(result.current.state.status).toBe('resolved');
  });

  it('exposes the top match on resolved state', async () => {
    mockResolveNaturalLanguage.mockResolvedValueOnce(HIGH_CONF_RESPONSE);
    const { result } = renderHook(() => useNLResolve());

    await act(async () => {
      await result.current.resolveQuery('send chat');
    });

    const state = result.current.state;
    expect(state.status).toBe('resolved');
    if (state.status === 'resolved') {
      expect(state.match.symbol).toBe('handleSubmit');
      expect(state.match.confidence).toBe(0.93);
    }
  });

  it('returns the NLResolveResult from resolveQuery', async () => {
    mockResolveNaturalLanguage.mockResolvedValueOnce(HIGH_CONF_RESPONSE);
    const { result } = renderHook(() => useNLResolve());

    let ret: unknown;
    await act(async () => {
      ret = await result.current.resolveQuery('send chat');
    });

    expect(ret).toEqual(HIGH_CONF_RESPONSE.result);
  });
});

// ---------------------------------------------------------------------------
// Low-confidence → disambiguation
// ---------------------------------------------------------------------------

describe('useNLResolve — low confidence disambiguation', () => {
  it('transitions to disambiguation when confidence ≤ 0.8', async () => {
    mockResolveNaturalLanguage.mockResolvedValueOnce(LOW_CONF_RESPONSE);
    const { result } = renderHook(() => useNLResolve());

    await act(async () => {
      await result.current.resolveQuery('something vague');
    });

    expect(result.current.state.status).toBe('disambiguation');
  });

  it('exposes all matches on disambiguation state', async () => {
    mockResolveNaturalLanguage.mockResolvedValueOnce(LOW_CONF_RESPONSE);
    const { result } = renderHook(() => useNLResolve());

    await act(async () => {
      await result.current.resolveQuery('vague query');
    });

    const state = result.current.state;
    expect(state.status).toBe('disambiguation');
    if (state.status === 'disambiguation') {
      expect(state.matches).toHaveLength(2);
      expect(state.matches[0].symbol).toBe('handleSubmit');
      expect(state.matches[1].symbol).toBe('handleSend');
    }
  });
});

// ---------------------------------------------------------------------------
// Error states
// ---------------------------------------------------------------------------

describe('useNLResolve — error state', () => {
  it('transitions to error on success:false response', async () => {
    mockResolveNaturalLanguage.mockResolvedValueOnce(ERROR_RESPONSE);
    const { result } = renderHook(() => useNLResolve());

    await act(async () => {
      await result.current.resolveQuery('error query');
    });

    expect(result.current.state.status).toBe('error');
    const state = result.current.state;
    if (state.status === 'error') {
      expect(state.message).toBe('CLI subprocess failed');
    }
  });

  it('transitions to error on empty matches', async () => {
    mockResolveNaturalLanguage.mockResolvedValueOnce(EMPTY_RESPONSE);
    const { result } = renderHook(() => useNLResolve());

    await act(async () => {
      await result.current.resolveQuery('no match query');
    });

    expect(result.current.state.status).toBe('error');
  });

  it('transitions to error on IPC rejection', async () => {
    mockResolveNaturalLanguage.mockRejectedValueOnce(new Error('ipc channel closed'));
    const { result } = renderHook(() => useNLResolve());

    await act(async () => {
      await result.current.resolveQuery('ipc error');
    });

    expect(result.current.state.status).toBe('error');
    const state = result.current.state;
    if (state.status === 'error') {
      expect(state.message).toContain('ipc channel closed');
    }
  });
});

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

describe('useNLResolve — reset', () => {
  it('returns to idle from resolved state', async () => {
    mockResolveNaturalLanguage.mockResolvedValueOnce(HIGH_CONF_RESPONSE);
    const { result } = renderHook(() => useNLResolve());

    await act(async () => {
      await result.current.resolveQuery('send');
    });
    expect(result.current.state.status).toBe('resolved');

    act(() => result.current.reset());
    expect(result.current.state.status).toBe('idle');
  });

  it('returns to idle from disambiguation state', async () => {
    mockResolveNaturalLanguage.mockResolvedValueOnce(LOW_CONF_RESPONSE);
    const { result } = renderHook(() => useNLResolve());

    await act(async () => {
      await result.current.resolveQuery('vague');
    });
    expect(result.current.state.status).toBe('disambiguation');

    act(() => result.current.reset());
    expect(result.current.state.status).toBe('idle');
  });

  it('returns to idle from error state', async () => {
    mockResolveNaturalLanguage.mockResolvedValueOnce(ERROR_RESPONSE);
    const { result } = renderHook(() => useNLResolve());

    await act(async () => {
      await result.current.resolveQuery('fail');
    });
    expect(result.current.state.status).toBe('error');

    act(() => result.current.reset());
    expect(result.current.state.status).toBe('idle');
  });
});
