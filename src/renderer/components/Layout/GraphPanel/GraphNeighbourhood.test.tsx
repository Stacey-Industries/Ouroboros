/**
 * GraphNeighbourhood.test.tsx — smoke tests for the neighbourhood pop-over overlay.
 *
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GraphNeighbourhoodResult } from '../../../types/electron-graph';
import { GraphNeighbourhood } from './GraphNeighbourhood';

afterEach(cleanup);

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeNode(id: string, name: string, filePath = `src/${name}.ts`) {
  return {
    id,
    type: 'function' as const,
    name,
    filePath,
    line: 1,
  };
}

const SYMBOL = makeNode('sym-1', 'myFunction');

const FULL_DATA: GraphNeighbourhoodResult = {
  success: true,
  symbol: SYMBOL,
  callers: [makeNode('c-1', 'callerA', 'src/callerA.ts')],
  callees: [makeNode('e-1', 'calleeB', 'src/calleeB.ts')],
  imports: [makeNode('i-1', 'importerC', 'src/importerC.ts')],
};

const EMPTY_DATA: GraphNeighbourhoodResult = {
  success: true,
  symbol: SYMBOL,
  callers: [],
  callees: [],
  imports: [],
};

const ERROR_DATA: GraphNeighbourhoodResult = {
  success: false,
  error: 'Symbol not found: myFunction',
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GraphNeighbourhood — feature flag', () => {
  it('renders null when enabled=false', () => {
    const { container } = render(
      <GraphNeighbourhood data={FULL_DATA} loading={false} onClose={vi.fn()} enabled={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders when enabled=true', () => {
    render(
      <GraphNeighbourhood data={FULL_DATA} loading={false} onClose={vi.fn()} enabled={true} />,
    );
    expect(screen.getByText('myFunction')).toBeTruthy();
  });
});

describe('GraphNeighbourhood — loading state', () => {
  it('shows loading text while loading', () => {
    render(
      <GraphNeighbourhood data={null} loading={true} onClose={vi.fn()} enabled={true} />,
    );
    expect(screen.getByText(/loading/i)).toBeTruthy();
  });

  it('does not show node rows while loading', () => {
    render(
      <GraphNeighbourhood data={null} loading={true} onClose={vi.fn()} enabled={true} />,
    );
    expect(screen.queryByText('callerA')).toBeNull();
  });
});

describe('GraphNeighbourhood — error state', () => {
  it('shows error message when success=false', () => {
    render(
      <GraphNeighbourhood data={ERROR_DATA} loading={false} onClose={vi.fn()} enabled={true} />,
    );
    expect(screen.getByText(/Symbol not found/)).toBeTruthy();
  });
});

describe('GraphNeighbourhood — populated data', () => {
  it('shows the symbol name in the header', () => {
    render(
      <GraphNeighbourhood data={FULL_DATA} loading={false} onClose={vi.fn()} enabled={true} />,
    );
    expect(screen.getByText('myFunction')).toBeTruthy();
  });

  it('renders caller node name', () => {
    render(
      <GraphNeighbourhood data={FULL_DATA} loading={false} onClose={vi.fn()} enabled={true} />,
    );
    expect(screen.getByText('callerA')).toBeTruthy();
  });

  it('renders callee node name', () => {
    render(
      <GraphNeighbourhood data={FULL_DATA} loading={false} onClose={vi.fn()} enabled={true} />,
    );
    expect(screen.getByText('calleeB')).toBeTruthy();
  });

  it('renders imported-by node name', () => {
    render(
      <GraphNeighbourhood data={FULL_DATA} loading={false} onClose={vi.fn()} enabled={true} />,
    );
    expect(screen.getByText('importerC')).toBeTruthy();
  });

  it('shows Callers section header', () => {
    render(
      <GraphNeighbourhood data={FULL_DATA} loading={false} onClose={vi.fn()} enabled={true} />,
    );
    expect(screen.getByText('Callers')).toBeTruthy();
  });

  it('shows Callees section header', () => {
    render(
      <GraphNeighbourhood data={FULL_DATA} loading={false} onClose={vi.fn()} enabled={true} />,
    );
    expect(screen.getByText('Callees')).toBeTruthy();
  });

  it('shows file name suffix for each node row', () => {
    render(
      <GraphNeighbourhood data={FULL_DATA} loading={false} onClose={vi.fn()} enabled={true} />,
    );
    expect(screen.getByText('callerA.ts')).toBeTruthy();
  });
});

describe('GraphNeighbourhood — empty neighbours', () => {
  it('shows "No neighbours found" when all arrays are empty', () => {
    render(
      <GraphNeighbourhood data={EMPTY_DATA} loading={false} onClose={vi.fn()} enabled={true} />,
    );
    expect(screen.getByText(/No neighbours found/)).toBeTruthy();
  });
});

describe('GraphNeighbourhood — close button', () => {
  it('calls onClose when the × button is clicked', () => {
    const onClose = vi.fn();
    render(
      <GraphNeighbourhood data={FULL_DATA} loading={false} onClose={onClose} enabled={true} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
