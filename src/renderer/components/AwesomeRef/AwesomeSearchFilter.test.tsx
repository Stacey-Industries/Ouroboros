/**
 * @vitest-environment jsdom
 *
 * AwesomeSearchFilter.test.tsx — Unit tests for the search + chip filter UI.
 *
 * Wave 37 Phase E.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AwesomeSearchFilter } from './AwesomeSearchFilter';

afterEach(() => cleanup());

function renderFilter(overrides: Partial<React.ComponentProps<typeof AwesomeSearchFilter>> = {}) {
  const props = {
    query: '',
    category: 'all' as const,
    onQueryChange: vi.fn(),
    onCategoryChange: vi.fn(),
    ...overrides,
  };
  return { ...render(<AwesomeSearchFilter {...props} />), props };
}

describe('AwesomeSearchFilter', () => {
  it('renders the search input', () => {
    renderFilter();
    expect(screen.getByRole('searchbox')).toBeTruthy();
  });

  it('renders "All" chip and one chip per category', () => {
    renderFilter();
    expect(screen.getByRole('button', { name: 'All' })).toBeTruthy();
    // Each category has a visible labelled chip
    expect(screen.getByRole('button', { name: 'Hooks' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Slash commands' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'MCP configs' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rules' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Skills' })).toBeTruthy();
  });

  it('"All" chip has aria-pressed=true when category is all', () => {
    renderFilter({ category: 'all' });
    const allChip = screen.getByRole('button', { name: 'All' });
    expect(allChip.getAttribute('aria-pressed')).toBeTruthy();
    expect(allChip.getAttribute('aria-pressed')).not.toBe('false');
  });

  it('category chip has aria-pressed=true when active', () => {
    renderFilter({ category: 'hooks' });
    const hookChip = screen.getByRole('button', { name: 'Hooks' });
    expect(hookChip.getAttribute('aria-pressed')).not.toBe('false');
    const allChip = screen.getByRole('button', { name: 'All' });
    expect(allChip.getAttribute('aria-pressed')).toBe('false');
  });

  it('calls onQueryChange when typing in the search input', () => {
    const { props } = renderFilter();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'slack' } });
    expect(props.onQueryChange).toHaveBeenCalledWith('slack');
  });

  it('calls onCategoryChange with "all" when All chip clicked', () => {
    const { props } = renderFilter({ category: 'hooks' });
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(props.onCategoryChange).toHaveBeenCalledWith('all');
  });

  it('calls onCategoryChange with category when a category chip clicked', () => {
    const { props } = renderFilter();
    fireEvent.click(screen.getByRole('button', { name: 'Rules' }));
    expect(props.onCategoryChange).toHaveBeenCalledWith('rules');
  });

  it('displays the current query value in the input', () => {
    renderFilter({ query: 'prettier' });
    const input = screen.getByRole('searchbox') as HTMLInputElement;
    expect(input.value).toBe('prettier');
  });
});
