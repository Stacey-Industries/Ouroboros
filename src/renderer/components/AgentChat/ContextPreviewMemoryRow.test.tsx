/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContentCache } from './ContextPreviewMemoryRow';
import { MemoryItemRow } from './ContextPreviewMemoryRow';

const ITEM = {
  id: 'memory:user_role',
  kind: 'memory' as const,
  label: 'User role',
  detail: 'data scientist',
  estimatedTokens: 12,
  enabled: true,
};

function makeCache(initial: ContentCache = {}): ContentCache {
  return { ...initial };
}

function mockMemoryApi(content: string | null = '# Content\nBody text.') {
  const read = vi.fn().mockResolvedValue(
    content !== null ? { success: true, content } : { success: false, error: 'not found' },
  );
  Object.defineProperty(window, 'electronAPI', {
    value: { memory: { read } },
    writable: true,
    configurable: true,
  });
  return read;
}

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: undefined,
    writable: true,
    configurable: true,
  });
});

afterEach(() => cleanup());

describe('MemoryItemRow', () => {
  it('renders the entry label without expanded content initially', () => {
    render(<MemoryItemRow item={ITEM} contentCache={makeCache()} />);
    expect(screen.getByText('User role')).toBeTruthy();
    expect(screen.queryByText(/Body text/)).toBeNull();
  });

  it('calls memory:read with correct args on first expand', async () => {
    const read = mockMemoryApi();
    const cache = makeCache();
    render(<MemoryItemRow item={ITEM} projectRoot="/proj" contentCache={cache} />);

    fireEvent.click(screen.getByTitle('Expand to view content'));

    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    expect(read).toHaveBeenCalledWith({ projectRoot: '/proj', id: 'user_role' });
  });

  it('displays fetched content after expand', async () => {
    mockMemoryApi('# Content\nBody text.');
    const cache = makeCache();
    render(<MemoryItemRow item={ITEM} contentCache={cache} />);

    fireEvent.click(screen.getByTitle('Expand to view content'));

    await waitFor(() => expect(screen.queryByText(/Body text\./)).toBeTruthy());
  });

  it('does not re-fetch on second expand (cache hit)', async () => {
    const read = mockMemoryApi();
    const cache = makeCache();
    render(<MemoryItemRow item={ITEM} contentCache={cache} />);

    const btn = screen.getByTitle('Expand to view content');
    fireEvent.click(btn); // expand
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));

    fireEvent.click(btn); // collapse
    fireEvent.click(screen.getByTitle('Expand to view content')); // re-expand

    expect(read).toHaveBeenCalledTimes(1);
  });

  it('shows error state when read fails', async () => {
    mockMemoryApi(null);
    const cache = makeCache();
    render(<MemoryItemRow item={ITEM} contentCache={cache} />);

    fireEvent.click(screen.getByTitle('Expand to view content'));

    await waitFor(() => expect(screen.queryByText(/Failed to load entry/)).toBeTruthy());
  });

  it('shows error state when memory API is unavailable', async () => {
    const cache = makeCache();
    render(<MemoryItemRow item={ITEM} contentCache={cache} />);

    fireEvent.click(screen.getByTitle('Expand to view content'));

    await waitFor(() => expect(screen.queryByText(/Failed to load entry/)).toBeTruthy());
  });

  it('renders edit button and fires onEditClick with entry id', () => {
    const onEditClick = vi.fn();
    render(<MemoryItemRow item={ITEM} contentCache={makeCache()} onEditClick={onEditClick} />);

    fireEvent.click(screen.getByRole('button', { name: /Edit memory entry: User role/i }));

    expect(onEditClick).toHaveBeenCalledWith('user_role');
  });

  it('renders delete button and fires onDeleteClick with entry id', () => {
    const onDeleteClick = vi.fn();
    render(<MemoryItemRow item={ITEM} contentCache={makeCache()} onDeleteClick={onDeleteClick} />);

    fireEvent.click(screen.getByRole('button', { name: /Delete memory entry: User role/i }));

    expect(onDeleteClick).toHaveBeenCalledWith('user_role');
  });

  it('uses pre-populated cache content without fetching', () => {
    const read = mockMemoryApi();
    const cache = makeCache({ user_role: '# Cached\nPre-loaded.' });
    render(<MemoryItemRow item={ITEM} contentCache={cache} />);

    fireEvent.click(screen.getByTitle('Expand to view content'));

    expect(read).not.toHaveBeenCalled();
    expect(screen.queryByText(/Pre-loaded\./)).toBeTruthy();
  });
});
