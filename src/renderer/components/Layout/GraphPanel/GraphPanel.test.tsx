/**
 * GraphPanel.test.tsx — integration smoke tests for the top-level graph panel.
 *
 * @vitest-environment jsdom
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GraphPanel } from './GraphPanel';

// ── ResizeObserver mock (not available in jsdom) ──────────────────────────────

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// ── Canvas mock ───────────────────────────────────────────────────────────────

const mockCtx = {
  clearRect: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  translate: vi.fn(),
  scale: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  fill: vi.fn(),
  fillText: vi.fn(),
  roundRect: vi.fn(),
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 0,
  font: '',
  textBaseline: '',
  textAlign: '',
};

// ── electronAPI mock ──────────────────────────────────────────────────────────

function makeNode(id: string) {
  return { id, type: 'function' as const, name: id, filePath: `/${id}.ts`, line: 1 };
}

const mockGetArchitecture = vi.fn();
const mockSearchGraph = vi.fn();

afterEach(cleanup);

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    mockCtx as unknown as CanvasRenderingContext2D,
  );

  Object.values(mockCtx).forEach((v) => {
    if (typeof v === 'function') (v as ReturnType<typeof vi.fn>).mockClear();
  });

  mockGetArchitecture.mockReset();
  mockSearchGraph.mockReset();

  window.electronAPI = {
    graph: {
      getArchitecture: mockGetArchitecture,
      searchGraph: mockSearchGraph,
      getStatus: vi.fn().mockResolvedValue({ success: true }),
    },
  } as unknown as typeof window.electronAPI;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GraphPanel', () => {
  it('shows loading state initially', () => {
    mockGetArchitecture.mockReturnValue(new Promise(() => {})); // never resolves
    render(<GraphPanel />);
    expect(screen.getByText('Loading graph…')).toBeTruthy();
  });

  it('shows empty state when architecture returns no data', async () => {
    mockGetArchitecture.mockResolvedValue({ success: false });
    render(<GraphPanel />);
    await waitFor(() => {
      expect(screen.getByText('Graph not available')).toBeTruthy();
    });
  });

  it('shows empty state when searchGraph returns no results', async () => {
    mockGetArchitecture.mockResolvedValue({
      success: true,
      architecture: { projectName: 'test', modules: [], hotspots: [], fileTree: [] },
    });
    mockSearchGraph.mockResolvedValue({ success: true, results: [] });
    render(<GraphPanel />);
    await waitFor(() => {
      expect(screen.getByText('Graph not available')).toBeTruthy();
    });
  });

  it('renders canvas when graph data is available', async () => {
    mockGetArchitecture.mockResolvedValue({
      success: true,
      architecture: { projectName: 'proj', modules: [], hotspots: [], fileTree: [] },
    });
    mockSearchGraph.mockResolvedValue({
      success: true,
      results: [
        { node: makeNode('a'), score: 1, matchReason: 'name' },
        { node: makeNode('b'), score: 1, matchReason: 'name' },
        { node: makeNode('c'), score: 1, matchReason: 'name' },
        { node: makeNode('d'), score: 1, matchReason: 'name' },
        { node: makeNode('e'), score: 1, matchReason: 'name' },
      ],
    });
    render(<GraphPanel />);
    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Codebase graph canvas' })).toBeTruthy();
    });
  });

  it('shows empty state when fetch rejects', async () => {
    mockGetArchitecture.mockRejectedValue(new Error('network error'));
    render(<GraphPanel />);
    await waitFor(() => {
      expect(screen.getByText('Graph not available')).toBeTruthy();
    });
  });

  it('renders the toolbar header in all states', () => {
    mockGetArchitecture.mockReturnValue(new Promise(() => {}));
    render(<GraphPanel />);
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reset view' })).toBeTruthy();
    expect(screen.getByRole('searchbox')).toBeTruthy();
  });
});
