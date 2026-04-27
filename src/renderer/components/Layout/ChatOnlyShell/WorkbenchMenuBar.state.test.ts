/**
 * @vitest-environment jsdom
 *
 * WorkbenchMenuBar.state — smoke tests for the keyboard handler + state hook.
 */
import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { MenuDefinition } from '../TitleBar.menus';
import { buildKeyHandler, useWorkbenchMenuBarState } from './WorkbenchMenuBar.state';

const FILE_MENU: MenuDefinition = {
  label: 'File',
  items: [
    { label: 'New Session', action: vi.fn() },
    { label: '', divider: true },
    { label: 'Exit' },
  ],
};
const EDIT_MENU: MenuDefinition = {
  label: 'Edit',
  items: [{ label: 'Find', action: vi.fn() }],
};

function makeArgs(overrides: Record<string, unknown> = {}) {
  return {
    openIdx: null,
    highlighted: -1,
    menus: [FILE_MENU, EDIT_MENU],
    setOpenIdx: vi.fn(),
    setHighlighted: vi.fn(),
    itemRefs: {
      current: [] as (HTMLButtonElement | null)[],
    } as React.MutableRefObject<(HTMLButtonElement | null)[]>,
    closeMenu: vi.fn(),
    ...overrides,
  };
}

describe('buildKeyHandler', () => {
  it('Alt+F opens the File menu (idx 0)', () => {
    const args = makeArgs();
    const handler = buildKeyHandler(args);
    handler(new KeyboardEvent('keydown', { key: 'f', altKey: true }));
    expect(args.setOpenIdx).toHaveBeenCalledWith(0);
  });

  it('Alt+E opens the Edit menu (idx 1)', () => {
    const args = makeArgs();
    const handler = buildKeyHandler(args);
    handler(new KeyboardEvent('keydown', { key: 'e', altKey: true }));
    expect(args.setOpenIdx).toHaveBeenCalledWith(1);
  });

  it('ignores plain letter keys without Alt', () => {
    const args = makeArgs();
    const handler = buildKeyHandler(args);
    handler(new KeyboardEvent('keydown', { key: 'f' }));
    expect(args.setOpenIdx).not.toHaveBeenCalled();
  });

  it('Escape closes when a menu is open', () => {
    const args = makeArgs({ openIdx: 0 });
    const handler = buildKeyHandler(args);
    handler(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(args.closeMenu).toHaveBeenCalledOnce();
  });

  it('Escape does nothing when no menu is open', () => {
    const args = makeArgs();
    const handler = buildKeyHandler(args);
    handler(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(args.closeMenu).not.toHaveBeenCalled();
  });

  it('ArrowDown when File is open advances highlighted past dividers', () => {
    const args = makeArgs({ openIdx: 0, highlighted: -1 });
    const handler = buildKeyHandler(args);
    handler(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(args.setHighlighted).toHaveBeenCalled();
  });

  it('Enter triggers the highlighted item action and closes', () => {
    const action = vi.fn();
    const menu: MenuDefinition = { label: 'X', items: [{ label: 'Run', action }] };
    const args = makeArgs({ openIdx: 0, highlighted: 0, menus: [menu] });
    const handler = buildKeyHandler(args);
    handler(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(action).toHaveBeenCalledOnce();
    expect(args.closeMenu).toHaveBeenCalledOnce();
  });
});

describe('useWorkbenchMenuBarState', () => {
  it('initial state has no menu open and no highlight', () => {
    const { result } = renderHook(() => useWorkbenchMenuBarState([FILE_MENU]));
    expect(result.current.openIdx).toBeNull();
    expect(result.current.highlighted).toBe(-1);
  });

  it('handleClick toggles the menu open then closed', () => {
    const { result } = renderHook(() => useWorkbenchMenuBarState([FILE_MENU, EDIT_MENU]));
    act(() => result.current.handleClick(0));
    expect(result.current.openIdx).toBe(0);
    act(() => result.current.handleClick(0));
    expect(result.current.openIdx).toBeNull();
  });

  it('handleHover swaps the open menu while one is open', () => {
    const { result } = renderHook(() => useWorkbenchMenuBarState([FILE_MENU, EDIT_MENU]));
    act(() => result.current.handleClick(0));
    act(() => result.current.handleHover(1));
    expect(result.current.openIdx).toBe(1);
  });

  it('handleHover does nothing when no menu is open', () => {
    const { result } = renderHook(() => useWorkbenchMenuBarState([FILE_MENU, EDIT_MENU]));
    act(() => result.current.handleHover(1));
    expect(result.current.openIdx).toBeNull();
  });

  it('closeMenu resets state', () => {
    const { result } = renderHook(() => useWorkbenchMenuBarState([FILE_MENU]));
    act(() => result.current.handleClick(0));
    act(() => result.current.closeMenu());
    expect(result.current.openIdx).toBeNull();
    expect(result.current.highlighted).toBe(-1);
  });
});
