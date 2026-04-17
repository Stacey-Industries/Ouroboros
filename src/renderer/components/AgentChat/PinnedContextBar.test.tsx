/**
 * @vitest-environment jsdom
 *
 * PinnedContextBar.test.tsx — Unit tests for the PinnedContextBar container.
 *
 * Mocks usePinnedContext so the bar's own rendering logic can be tested
 * without wiring real IPC.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PinnedContextItem } from '../../types/electron';

// ─── Mock usePinnedContext ────────────────────────────────────────────────────

const mockDismiss = vi.fn();
const mockRemove = vi.fn();
let mockItems: PinnedContextItem[] = [];

vi.mock('../../hooks/usePinnedContext', () => ({
  // Stub — parameter satisfies the hook type signature but is unused in mock.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  usePinnedContext: (_sessionId: string | null) => ({
    items: mockItems,
    dismiss: mockDismiss,
    remove: mockRemove,
    add: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// ─── Subject ──────────────────────────────────────────────────────────────────

import { PinnedContextBar } from './PinnedContextBar';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<PinnedContextItem> = {}): PinnedContextItem {
  return {
    id: 'item-1',
    type: 'user-file',
    source: '/src/foo.ts',
    title: 'foo.ts',
    content: 'export {}',
    tokens: 4,
    addedAt: 1000,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
  mockItems = [];
  vi.clearAllMocks();
});

describe('PinnedContextBar', () => {
  it('renders nothing when there are no items', () => {
    mockItems = [];
    const { container } = render(<PinnedContextBar activeSessionId="sess-1" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a card for each pinned item', () => {
    mockItems = [
      makeItem({ id: 'a', title: 'alpha.ts' }),
      makeItem({ id: 'b', title: 'beta.ts' }),
    ];
    render(<PinnedContextBar activeSessionId="sess-1" />);
    expect(screen.getByText('alpha.ts')).toBeTruthy();
    expect(screen.getByText('beta.ts')).toBeTruthy();
  });

  it('renders the bar container when items are present', () => {
    mockItems = [makeItem()];
    render(<PinnedContextBar activeSessionId="sess-1" />);
    expect(screen.getByTestId('pinned-context-bar')).toBeTruthy();
  });

  it('calls dismiss with the item id when Dismiss is clicked', () => {
    mockItems = [makeItem({ id: 'dismiss-me' })];
    render(<PinnedContextBar activeSessionId="sess-1" />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(mockDismiss).toHaveBeenCalledWith('dismiss-me');
  });

  it('calls remove with the item id when Remove is clicked', () => {
    mockItems = [makeItem({ id: 'remove-me' })];
    render(<PinnedContextBar activeSessionId="sess-1" />);
    fireEvent.click(screen.getByRole('button', { name: /remove/i }));
    expect(mockRemove).toHaveBeenCalledWith('remove-me');
  });

  it('passes null sessionId through to usePinnedContext without crashing', () => {
    mockItems = [];
    const { container } = render(<PinnedContextBar activeSessionId={null} />);
    expect(container.firstChild).toBeNull();
  });
});
