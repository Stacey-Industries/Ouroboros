/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DiffReviewPanel } from './DiffReviewPanel';
import type { DiffReviewState } from './types';

vi.mock('./DiffReviewPanelSections', () => ({
  DiffReviewLayout: (props: { enhancedEnabled: boolean; canRollback: boolean }) =>
    React.createElement('div', {
      'data-testid': 'layout',
      'data-enhanced': String(props.enhancedEnabled),
      'data-can-rollback': String(props.canRollback),
    }),
}));

vi.mock('./DiffReviewPanelState', () => ({
  getDiffReviewStats: () => ({ added: 0, removed: 0, totalHunks: 0, decidedHunks: 0, acceptedHunks: 0, rejectedHunks: 0 }),
  getDiffReviewStateView: () => null,
}));

vi.mock('./useDiffReviewKeyboard', () => ({
  useDiffReviewKeyboard: () => ({ focusedIndex: 0, focusedHunkId: null }),
}));

function makeState(overrides: Partial<DiffReviewState> = {}): DiffReviewState {
  return {
    sessionId: 's1',
    snapshotHash: 'abc',
    projectRoot: '/proj',
    files: [],
    loading: false,
    error: null,
    lastAcceptedBatch: null,
    ...overrides,
  };
}

const noop = vi.fn();

function defaultProps(overrides: Partial<React.ComponentProps<typeof DiffReviewPanel>> = {}) {
  return {
    state: makeState(),
    canRollback: false,
    enhancedEnabled: true,
    onAcceptHunk: noop,
    onRejectHunk: noop,
    onAcceptAllFile: noop,
    onRejectAllFile: noop,
    onAcceptAll: noop,
    onRejectAll: noop,
    onRollback: noop,
    onClose: noop,
    ...overrides,
  };
}

afterEach(cleanup);

describe('DiffReviewPanel', () => {
  it('renders layout when state has no loading/error', () => {
    render(React.createElement(DiffReviewPanel, defaultProps()));
    expect(screen.getByTestId('layout')).toBeTruthy();
  });

  it('passes enhancedEnabled=true to layout', () => {
    render(React.createElement(DiffReviewPanel, defaultProps({ enhancedEnabled: true })));
    expect(screen.getByTestId('layout').getAttribute('data-enhanced')).toBe('true');
  });

  it('passes enhancedEnabled=false to layout', () => {
    render(React.createElement(DiffReviewPanel, defaultProps({ enhancedEnabled: false })));
    expect(screen.getByTestId('layout').getAttribute('data-enhanced')).toBe('false');
  });

  it('passes canRollback=true to layout', () => {
    render(React.createElement(DiffReviewPanel, defaultProps({ canRollback: true })));
    expect(screen.getByTestId('layout').getAttribute('data-can-rollback')).toBe('true');
  });

  it('passes canRollback=false to layout', () => {
    render(React.createElement(DiffReviewPanel, defaultProps({ canRollback: false })));
    expect(screen.getByTestId('layout').getAttribute('data-can-rollback')).toBe('false');
  });
});
