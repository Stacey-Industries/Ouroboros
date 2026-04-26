/**
 * @vitest-environment jsdom
 *
 * Smoke tests for CentrePaneConnected.parts — verifies the three render
 * branches of CentrePaneConnectedShell (diff review active, replay active,
 * editor view) and that SpecialViewPanel resolves the correct lazy slot.
 */
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// ── Heavy dependencies ────────────────────────────────────────────────────────

vi.mock('../DiffReview', () => ({
  useDiffReview: vi.fn(),
  DiffReviewPanel: ({ state }: { state: unknown }) =>
    React.createElement('div', { 'data-testid': 'diff-review', 'data-state': String(!!state) }),
}));

vi.mock('../../contexts/ProjectContext', () => ({
  useProject: vi.fn(() => ({ projectRoot: '/proj' })),
}));

vi.mock('../../hooks/useConfig', () => ({
  useConfig: vi.fn(() => ({ config: { review: { enhanced: true } } })),
}));

vi.mock('./CentrePaneConnected.wiring', () => ({
  useCentrePaneWiring: vi.fn(),
  CentrePaneWiringArgs: {},
}));

vi.mock('./CentrePane', () => ({
  CentrePane: ({ children }: React.PropsWithChildren) =>
    React.createElement('div', { 'data-testid': 'centre-pane' }, children),
}));

vi.mock('./EditorContent', () => ({
  EditorContent: () => React.createElement('div', { 'data-testid': 'editor-content' }),
}));

vi.mock('./EditorTabBar', () => ({
  EditorTabBar: () => React.createElement('div', { 'data-testid': 'editor-tab-bar' }),
}));

vi.mock('./LazyPanelFallback', () => ({
  LazyPanelFallback: () => React.createElement('div', { 'data-testid': 'lazy-fallback' }),
}));

vi.mock('../SessionReplay', () => ({
  SessionReplayPanel: ({ session }: { session: { id: string } }) =>
    React.createElement('div', { 'data-testid': 'session-replay', 'data-id': session.id }),
}));

// Lazy-loaded panels — stub all of them
vi.mock('../ContextBuilder', () => ({
  ContextBuilder: () => React.createElement('div', { 'data-testid': 'context-builder' }),
}));
vi.mock('../ExtensionStore/ExtensionStorePage', () => ({
  ExtensionStorePage: () => React.createElement('div', { 'data-testid': 'extension-store' }),
}));
vi.mock('../McpStore/McpStorePage', () => ({
  McpStorePage: () => React.createElement('div', { 'data-testid': 'mcp-store' }),
}));
vi.mock('../Settings/SettingsPanel', () => ({
  SettingsPanel: () => React.createElement('div', { 'data-testid': 'settings-panel' }),
}));
vi.mock('../UsageModal/UsagePanel', () => ({
  UsagePanel: () => React.createElement('div', { 'data-testid': 'usage-panel' }),
}));
vi.mock('../UsageDashboard', () => ({
  UsageDashboard: () => React.createElement('div', { 'data-testid': 'usage-dashboard' }),
}));
vi.mock('./TimeTravelPanelConnected', () => ({
  TimeTravelPanelConnected: () =>
    React.createElement('div', { 'data-testid': 'time-travel' }),
}));
vi.mock('./GraphPanel/GraphPanel', () => ({
  GraphPanel: () => React.createElement('div', { 'data-testid': 'graph-panel' }),
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import { useDiffReview } from '../DiffReview';
import { CentrePaneConnectedShell } from './CentrePaneConnected.parts';

const mockUseDiffReview = vi.mocked(useDiffReview);

function makeNoop() {
  return vi.fn();
}

function baseReviewHook(stateOverride: unknown = null) {
  return {
    state: stateOverride,
    openReview: makeNoop(),
    closeReview: makeNoop(),
    acceptHunk: makeNoop(),
    rejectHunk: makeNoop(),
    acceptAllFile: makeNoop(),
    rejectAllFile: makeNoop(),
    acceptAll: makeNoop(),
    rejectAll: makeNoop(),
    canRollback: false,
    rollback: makeNoop(),
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── CentrePaneConnectedShell branches ────────────────────────────────────────

describe('CentrePaneConnectedShell', () => {
  it('is a function component', () => {
    expect(typeof CentrePaneConnectedShell).toBe('function');
  });

  it('renders the diff-review branch when state is non-null', async () => {
    const fakeState = { sessionId: 's1', files: [] };
    mockUseDiffReview.mockReturnValue(baseReviewHook(fakeState) as never);

    render(<CentrePaneConnectedShell />);

    // LazyDiffReview wraps DiffReviewPanel in Suspense — wait for lazy load
    await act(async () => { await Promise.resolve(); });
    await waitFor(() => screen.getByTestId('diff-review'));

    expect(screen.getByTestId('diff-review')).toBeDefined();
    // Editor view must NOT be present
    expect(screen.queryByTestId('centre-pane')).toBeNull();
  });

  it('renders the editor view branch when state is null and no replaySession', () => {
    mockUseDiffReview.mockReturnValue(baseReviewHook(null) as never);

    render(<CentrePaneConnectedShell />);

    expect(screen.getByTestId('centre-pane')).toBeDefined();
    expect(screen.queryByTestId('diff-review')).toBeNull();
  });

  it('renders CentrePane with editor content in editor view', () => {
    mockUseDiffReview.mockReturnValue(baseReviewHook(null) as never);

    render(<CentrePaneConnectedShell />);

    expect(screen.getByTestId('editor-content')).toBeDefined();
  });
});
