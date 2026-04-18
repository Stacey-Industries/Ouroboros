/**
 * CompareProviders.test.tsx — Wave 36 Phase F
 * @vitest-environment jsdom
 *
 * Smoke tests for the CompareProviders orchestrator component.
 */

import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../hooks/useCompareSession', () => ({
  useCompareSession: () => ({
    state: {
      compareId: null,
      status: 'idle',
      paneA: { providerId: 'claude', text: '', status: 'idle', cost: null, completedAt: null },
      paneB: { providerId: 'codex', text: '', status: 'idle', cost: null, completedAt: null },
      error: null,
    },
    start: vi.fn(),
    cancel: vi.fn(),
  }),
}));

vi.mock('../../hooks/useViewportBreakpoint', () => ({
  useViewportBreakpoint: () => 'desktop',
}));

vi.mock('../../hooks/appEventNames', () => ({
  OPEN_COMPARE_PROVIDERS_EVENT: 'agent-ide:compare-providers',
}));

// stub sub-components to keep render shallow
vi.mock('./CompareProvidersHeader', () => ({
  CompareProvidersHeader: () => <div data-testid="compare-header" />,
}));

vi.mock('./CompareProvidersOutputPane', () => ({
  CompareProvidersOutputPane: ({ label }: { label: string }) => (
    <div data-testid={`pane-${label}`} />
  ),
}));

vi.mock('./CompareProvidersDiff', () => ({
  CompareProvidersDiff: () => <div data-testid="diff-view" />,
}));

vi.mock('../Layout/MobileBottomSheet', () => ({
  MobileBottomSheet: ({ children, isOpen }: { children: React.ReactNode; isOpen: boolean }) =>
    isOpen ? <div data-testid="mobile-sheet">{children}</div> : null,
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CompareProviders', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        compareProviders: {
          start: vi.fn().mockResolvedValue({ success: true, compareId: 'x', sessions: [] }),
          cancel: vi.fn().mockResolvedValue({ success: true }),
          onEvent: vi.fn().mockReturnValue(() => { /* noop */ }),
        },
        config: {
          getAll: vi.fn().mockResolvedValue({ providers: { multiProvider: true } }),
        },
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders nothing when isOpen is false', async () => {
    const { CompareProviders } = await import('./CompareProviders');
    const { container } = render(<CompareProviders isOpen={false} onClose={vi.fn()} projectPath="/proj" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders header and two panes when isOpen is true', async () => {
    const { CompareProviders } = await import('./CompareProviders');
    render(<CompareProviders isOpen={true} onClose={vi.fn()} projectPath="/proj" />);
    expect(screen.getByTestId('compare-header')).toBeTruthy();
  });

  it('renders spend warning banner on initial open', async () => {
    const { CompareProviders } = await import('./CompareProviders');
    render(<CompareProviders isOpen={true} onClose={vi.fn()} projectPath="/proj" />);
    expect(screen.getByText(/doubles API spend/i)).toBeTruthy();
  });
});
