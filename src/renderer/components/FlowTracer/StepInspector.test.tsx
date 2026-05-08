/**
 * StepInspector.test.tsx — smoke tests for the hover-driven What/How/Why panel.
 * @vitest-environment jsdom
 */

import { act, cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FlowTrace, SymbolRef } from '../../../shared/types/flowTracer';
import { StepInspector } from './StepInspector';

const STUB_FLOW: FlowTrace = {
  id: 'trace-1',
  title: 'Test flow',
  entryPoint: { symbol: 'foo', file: 'foo.ts', line: 1 },
  steps: [
    {
      id: 's1',
      layer: 'main',
      symbol: 'foo',
      file: 'foo.ts',
      line: 1,
      kind: 'function',
      narration: null,
    },
  ],
  edges: [],
  generatedAt: 0,
  graphVersion: 'stub',
  metadata: { layerCount: 1, boundaryCount: 0, depthCapHit: false },
};

const HOVER_REF: SymbolRef = { symbol: 'foo', file: 'foo.ts', line: 1 };

const mockGetNarration = vi.fn();
const mockGetFlowWhy = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  mockGetNarration.mockReset().mockResolvedValue({ success: true, narration: null });
  mockGetFlowWhy.mockReset().mockResolvedValue({ success: true, entries: [] });
  window.electronAPI = {
    flowTracer: {
      getNarration: mockGetNarration,
      getFlowWhy: mockGetFlowWhy,
    },
  } as unknown as typeof window.electronAPI;
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('StepInspector', () => {
  it('shows hover prompt when no step is hovered', () => {
    render(<StepInspector flow={STUB_FLOW} hoveredStep={null} hoveredStepId={null} />);
    expect(screen.getByText(/hover a step to inspect/i)).toBeTruthy();
  });

  it('triggers narration fetch after debounce when a step is hovered', async () => {
    render(<StepInspector flow={STUB_FLOW} hoveredStep={HOVER_REF} hoveredStepId="s1" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(mockGetNarration).toHaveBeenCalledWith(HOVER_REF);
  });

  it('renders What and How fields when narration arrives', async () => {
    mockGetNarration.mockResolvedValue({
      success: true,
      narration: { what: 'role text', why: 'placeholder', how: 'mechanism text' },
    });
    render(<StepInspector flow={STUB_FLOW} hoveredStep={HOVER_REF} hoveredStepId="s1" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(screen.getByText(/role text/)).toBeTruthy();
    expect(screen.getByText(/mechanism text/)).toBeTruthy();
  });

  it('renders Why field when chain-aware Why entry is available for hovered step', async () => {
    mockGetFlowWhy.mockResolvedValue({
      success: true,
      entries: [{ stepId: 's1', why: 'invariant text' }],
    });
    render(<StepInspector flow={STUB_FLOW} hoveredStep={HOVER_REF} hoveredStepId="s1" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(screen.getByText(/invariant text/)).toBeTruthy();
  });

  it('shows error state when narration call fails', async () => {
    mockGetNarration.mockResolvedValue({ success: false, error: 'cli timeout' });
    render(<StepInspector flow={STUB_FLOW} hoveredStep={HOVER_REF} hoveredStepId="s1" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(screen.getByText(/cli timeout/i)).toBeTruthy();
  });
});
