/**
 * @vitest-environment jsdom
 *
 * Smoke tests for extracted slash keyboard navigation. Behavior is also
 * covered indirectly by SlashCommandPlugin.test.tsx, which mounts these hooks
 * inside the full plugin. These tests verify the exports load and the type
 * shape is stable.
 */
import { describe, expect, it } from 'vitest';

import {
  type SlashEnterOpts,
  type SlashNavRefs,
  type SlashState,
  useSlashArrowDown,
  useSlashArrowUp,
  useSlashEnter,
} from './slashKeyboardNav';

describe('slashKeyboardNav exports', () => {
  it('exports the three keyboard hooks', () => {
    expect(typeof useSlashArrowDown).toBe('function');
    expect(typeof useSlashArrowUp).toBe('function');
    expect(typeof useSlashEnter).toBe('function');
  });

  it('SlashState type is the expected shape', () => {
    const s: SlashState = { isOpen: true, query: 'foo', selectedIndex: 0 };
    expect(s.isOpen).toBe(true);
    expect(s.query).toBe('foo');
    expect(s.selectedIndex).toBe(0);
  });

  it('SlashNavRefs type is the expected shape', () => {
    const refs: SlashNavRefs = {
      isOpenRef: { current: false },
      queryRef: { current: null },
      selectedIndexRef: { current: 0 },
      filteredRef: { current: [] },
    };
    expect(refs.isOpenRef.current).toBe(false);
    expect(refs.filteredRef.current).toEqual([]);
  });

  it('SlashEnterOpts type accepts the expected shape', () => {
    const opts: SlashEnterOpts = {
      onSlashStateChange: () => undefined,
      draft: '',
      onChange: () => undefined,
      refs: {
        isOpenRef: { current: false },
        queryRef: { current: null },
        selectedIndexRef: { current: 0 },
        filteredRef: { current: [] },
      },
    };
    expect(typeof opts.onSlashStateChange).toBe('function');
    expect(typeof opts.onChange).toBe('function');
  });
});
