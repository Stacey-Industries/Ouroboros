/**
 * @vitest-environment jsdom
 *
 * useAwesomeFilter.test.ts — Unit tests for the awesome-ref filter hook.
 *
 * Wave 37 Phase E.
 */

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AWESOME_ENTRIES } from '../../awesomeRef/awesomeData';
import { useAwesomeFilter } from './useAwesomeFilter';

describe('useAwesomeFilter', () => {
  it('returns all entries when query is empty and category is all', () => {
    const { result } = renderHook(() => useAwesomeFilter());
    expect(result.current.filtered.length).toBe(AWESOME_ENTRIES.length);
  });

  it('filters by title substring (case-insensitive)', () => {
    const { result } = renderHook(() => useAwesomeFilter());
    act(() => { result.current.setQuery('slack'); });
    const titles = result.current.filtered.map((e) => e.title.toLowerCase());
    expect(titles.every((t) => t.includes('slack') || result.current.filtered.some(
      (e) => e.description.toLowerCase().includes('slack') || e.tags?.some((tag) => tag.includes('slack')),
    ))).toBe(true);
    expect(result.current.filtered.length).toBeGreaterThan(0);
  });

  it('filters by description text', () => {
    const { result } = renderHook(() => useAwesomeFilter());
    act(() => { result.current.setQuery('prettier'); });
    expect(result.current.filtered.length).toBeGreaterThan(0);
    for (const entry of result.current.filtered) {
      const haystack = [entry.title, entry.description, ...(entry.tags ?? [])].join(' ').toLowerCase();
      expect(haystack).toContain('prettier');
    }
  });

  it('filters by tag', () => {
    const { result } = renderHook(() => useAwesomeFilter());
    act(() => { result.current.setQuery('security'); });
    expect(result.current.filtered.length).toBeGreaterThan(0);
    for (const entry of result.current.filtered) {
      const haystack = [entry.title, entry.description, ...(entry.tags ?? [])].join(' ').toLowerCase();
      expect(haystack).toContain('security');
    }
  });

  it('returns empty when query matches nothing', () => {
    const { result } = renderHook(() => useAwesomeFilter());
    act(() => { result.current.setQuery('zzz-no-match-xyzzy'); });
    expect(result.current.filtered.length).toBe(0);
  });

  it('filters by category', () => {
    const { result } = renderHook(() => useAwesomeFilter());
    act(() => { result.current.setCategory('hooks'); });
    expect(result.current.filtered.length).toBeGreaterThan(0);
    for (const entry of result.current.filtered) {
      expect(entry.category).toBe('hooks');
    }
  });

  it('combines query and category filters', () => {
    const { result } = renderHook(() => useAwesomeFilter());
    act(() => {
      result.current.setCategory('rules');
      result.current.setQuery('secret');
    });
    expect(result.current.filtered.length).toBeGreaterThan(0);
    for (const entry of result.current.filtered) {
      expect(entry.category).toBe('rules');
      const haystack = [entry.title, entry.description, ...(entry.tags ?? [])].join(' ').toLowerCase();
      expect(haystack).toContain('secret');
    }
  });

  it('resetting query to empty restores category-only filter', () => {
    const { result } = renderHook(() => useAwesomeFilter());
    act(() => { result.current.setCategory('skills'); });
    const skillsCount = result.current.filtered.length;

    act(() => { result.current.setQuery('zzzz'); });
    expect(result.current.filtered.length).toBe(0);

    act(() => { result.current.setQuery(''); });
    expect(result.current.filtered.length).toBe(skillsCount);
  });

  it('switching category to all restores full list when query is empty', () => {
    const { result } = renderHook(() => useAwesomeFilter());
    act(() => { result.current.setCategory('mcp-configs'); });
    expect(result.current.filtered.length).toBeLessThan(AWESOME_ENTRIES.length);

    act(() => { result.current.setCategory('all'); });
    expect(result.current.filtered.length).toBe(AWESOME_ENTRIES.length);
  });
});
