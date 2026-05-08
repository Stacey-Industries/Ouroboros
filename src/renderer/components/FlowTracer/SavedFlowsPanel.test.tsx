/**
 * SavedFlowsPanel.test.tsx — smoke tests for SavedFlowsPanel.
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FlowTrace, SavedFlowSummary } from '../../../../shared/types/flowTracer';

// ── Mock useFlowPersistence so SavedFlowsPanel is testable in isolation ───────

const mockRefresh = vi.fn().mockResolvedValue(undefined);
const mockLoad = vi.fn();

vi.mock('./useFlowPersistence', () => ({
  useFlowPersistence: () => ({
    savedFlows: mockSavedFlows,
    status: mockStatus,
    refreshSavedFlows: mockRefresh,
    loadFlow: mockLoad,
  }),
}));

// Module-level vars mutated per test
let mockSavedFlows: SavedFlowSummary[] = [];
let mockStatus: { kind: string; message?: string; id?: string } = { kind: 'idle' };

import { SavedFlowsPanel } from './SavedFlowsPanel';

function makeSummary(
  id: string,
  title: string,
  source: 'local' | 'shared' = 'local',
): SavedFlowSummary {
  return { id, title, savedAt: new Date('2026-01-15').getTime(), layerCount: 2, source };
}

function makeTrace(): FlowTrace {
  return {
    id: 'loaded-trace',
    title: 'Loaded',
    entryPoint: { symbol: 'fn', file: 'src/f.ts', line: 1 },
    steps: [],
    edges: [],
    generatedAt: 0,
    graphVersion: 'v1',
    metadata: { layerCount: 1, boundaryCount: 0, depthCapHit: false },
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockSavedFlows = [];
  mockStatus = { kind: 'idle' };
});

describe('SavedFlowsPanel', () => {
  it('shows empty-state message when no flows exist', () => {
    mockSavedFlows = [];
    render(<SavedFlowsPanel onLoadFlow={vi.fn()} />);
    expect(screen.getByText(/no saved flows yet/i)).toBeTruthy();
  });

  it('calls refreshSavedFlows on mount', () => {
    mockSavedFlows = [];
    render(<SavedFlowsPanel onLoadFlow={vi.fn()} />);
    expect(mockRefresh).toHaveBeenCalledOnce();
  });

  it('renders a button for each saved flow', () => {
    mockSavedFlows = [makeSummary('a', 'Flow Alpha'), makeSummary('b', 'Flow Beta')];
    render(<SavedFlowsPanel onLoadFlow={vi.fn()} />);
    expect(screen.getByText('Flow Alpha')).toBeTruthy();
    expect(screen.getByText('Flow Beta')).toBeTruthy();
  });

  it('shows "shared ·" prefix for shared flows', () => {
    mockSavedFlows = [makeSummary('s1', 'Team Flow', 'shared')];
    render(<SavedFlowsPanel onLoadFlow={vi.fn()} />);
    expect(screen.getByText(/shared\s*·/)).toBeTruthy();
  });

  it('calls onLoadFlow with the FlowTrace when a row is clicked', async () => {
    mockSavedFlows = [makeSummary('x', 'Clickable Flow')];
    const trace = makeTrace();
    mockLoad.mockResolvedValue(trace);
    const onLoad = vi.fn();
    render(<SavedFlowsPanel onLoadFlow={onLoad} />);

    fireEvent.click(screen.getByText('Clickable Flow'));
    await waitFor(() => expect(onLoad).toHaveBeenCalledWith(trace));
  });

  it('does not call onLoadFlow when loadFlow returns null', async () => {
    mockSavedFlows = [makeSummary('y', 'Bad Flow')];
    mockLoad.mockResolvedValue(null);
    const onLoad = vi.fn();
    render(<SavedFlowsPanel onLoadFlow={onLoad} />);

    fireEvent.click(screen.getByText('Bad Flow'));
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());
    expect(onLoad).not.toHaveBeenCalled();
  });

  it('shows error message when status is error', () => {
    mockSavedFlows = [makeSummary('e', 'Error Flow')];
    mockStatus = { kind: 'error', message: 'something went wrong' };
    render(<SavedFlowsPanel onLoadFlow={vi.fn()} />);
    expect(screen.getByText('something went wrong')).toBeTruthy();
  });

  it('disables buttons while loading', () => {
    mockSavedFlows = [makeSummary('l', 'Loading Flow')];
    mockStatus = { kind: 'loading' };
    render(<SavedFlowsPanel onLoadFlow={vi.fn()} />);
    const btn = screen.getByRole('button', { name: /Loading Flow/i });
    expect(btn).toHaveProperty('disabled', true);
  });
});
