/**
 * @vitest-environment jsdom
 *
 * PinnedContextCard.test.tsx — Unit tests for the collapsible pinned context card.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PinnedContextItem, PinnedContextType } from '../../types/electron';
import { PinnedContextCard } from './PinnedContextCard';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<PinnedContextItem> = {}): PinnedContextItem {
  return {
    id: 'item-1',
    type: 'user-file',
    source: '/src/foo.ts',
    title: 'foo.ts',
    content: 'export const foo = 1;',
    tokens: 12,
    addedAt: 1000,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
});

describe('PinnedContextCard', () => {
  it('renders the item title', () => {
    render(
      <PinnedContextCard item={makeItem()} onDismiss={vi.fn()} onRemove={vi.fn()} />,
    );
    expect(screen.getByText('foo.ts')).toBeTruthy();
  });

  it('renders the token count', () => {
    render(
      <PinnedContextCard item={makeItem({ tokens: 42 })} onDismiss={vi.fn()} onRemove={vi.fn()} />,
    );
    expect(screen.getByText('42t')).toBeTruthy();
  });

  it('does not show content when collapsed (default)', () => {
    render(
      <PinnedContextCard item={makeItem()} onDismiss={vi.fn()} onRemove={vi.fn()} />,
    );
    expect(screen.queryByText('export const foo = 1;')).toBeNull();
  });

  it('shows content after clicking the toggle button', () => {
    render(
      <PinnedContextCard item={makeItem()} onDismiss={vi.fn()} onRemove={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /foo\.ts/i }));
    expect(screen.getByText('export const foo = 1;')).toBeTruthy();
  });

  it('collapses again when toggle is clicked twice', () => {
    render(
      <PinnedContextCard item={makeItem()} onDismiss={vi.fn()} onRemove={vi.fn()} />,
    );
    const toggle = screen.getByRole('button', { name: /foo\.ts/i });
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(screen.queryByText('export const foo = 1;')).toBeNull();
  });

  it('calls onDismiss with item id when Dismiss button is clicked', () => {
    const onDismiss = vi.fn();
    render(
      <PinnedContextCard item={makeItem()} onDismiss={onDismiss} onRemove={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledWith('item-1');
  });

  it('calls onRemove with item id when Remove button is clicked', () => {
    const onRemove = vi.fn();
    render(
      <PinnedContextCard item={makeItem()} onDismiss={vi.fn()} onRemove={onRemove} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /remove/i }));
    expect(onRemove).toHaveBeenCalledWith('item-1');
  });

  it.each<[PinnedContextType, string]>([
    ['research-artifact', '📚'],
    ['user-file', '📄'],
    ['symbol-neighborhood', '🔣'],
    ['graph-blast-radius', '🌐'],
  ])('renders the correct icon for type %s', (type, icon) => {
    render(
      <PinnedContextCard item={makeItem({ type })} onDismiss={vi.fn()} onRemove={vi.fn()} />,
    );
    expect(screen.getByText(icon)).toBeTruthy();
  });
});
