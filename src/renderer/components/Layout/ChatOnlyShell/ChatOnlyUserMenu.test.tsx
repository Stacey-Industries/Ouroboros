/**
 * @vitest-environment jsdom
 *
 * ChatOnlyUserMenu tests — Wave 44 Phase C.
 */

import { act, cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  OPEN_SETTINGS_EVENT,
  TOGGLE_IMMERSIVE_CHAT_EVENT,
  TOGGLE_SHORTCUT_CHEATSHEET_EVENT,
} from '../../../hooks/appEventNames';

// Stub useConfig — provide a minimal config with a dark theme so toggle logic
// is exercisable without a real electron-store.
vi.mock('../../../hooks/useConfig', () => ({
  useConfig: () => ({
    config: { activeTheme: 'retro' },
    set: vi.fn().mockResolvedValue(undefined),
    isLoading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

import { ChatOnlyUserMenu } from './ChatOnlyUserMenu';

afterEach(() => cleanup());

describe('ChatOnlyUserMenu', () => {
  it('renders the trigger button', () => {
    render(<ChatOnlyUserMenu />);
    expect(screen.getByTestId('user-menu-trigger')).toBeTruthy();
  });

  it('does not show popover by default', () => {
    render(<ChatOnlyUserMenu />);
    expect(screen.queryByTestId('user-menu-popover')).toBeNull();
  });

  it('opens popover on trigger click', () => {
    render(<ChatOnlyUserMenu />);
    // getBoundingClientRect returns zeroes in jsdom; popover only renders when rect is truthy.
    // Patch getBoundingClientRect to return a non-zero rect.
    const trigger = screen.getByTestId('user-menu-trigger');
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      top: 100, left: 10, bottom: 128, right: 200,
      width: 190, height: 28, x: 10, y: 100,
      toJSON: () => ({}),
    } as DOMRect);
    act(() => { trigger.click(); });
    expect(screen.getByTestId('user-menu-popover')).toBeTruthy();
  });

  it('closes on Escape when open', () => {
    render(<ChatOnlyUserMenu />);
    const trigger = screen.getByTestId('user-menu-trigger');
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      top: 100, left: 10, bottom: 128, right: 200,
      width: 190, height: 28, x: 10, y: 100,
      toJSON: () => ({}),
    } as DOMRect);
    act(() => { trigger.click(); });
    expect(screen.getByTestId('user-menu-popover')).toBeTruthy();
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(screen.queryByTestId('user-menu-popover')).toBeNull();
  });

  it('dispatches OPEN_SETTINGS_EVENT when Settings item is clicked', () => {
    render(<ChatOnlyUserMenu />);
    const trigger = screen.getByTestId('user-menu-trigger');
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      top: 100, left: 10, bottom: 128, right: 200,
      width: 190, height: 28, x: 10, y: 100,
      toJSON: () => ({}),
    } as DOMRect);
    act(() => { trigger.click(); });

    const dispatched: string[] = [];
    const listener = (e: Event): void => { dispatched.push(e.type); };
    window.addEventListener(OPEN_SETTINGS_EVENT, listener);
    act(() => { screen.getByText('Settings').click(); });
    window.removeEventListener(OPEN_SETTINGS_EVENT, listener);
    expect(dispatched).toContain(OPEN_SETTINGS_EVENT);
  });

  it('dispatches TOGGLE_IMMERSIVE_CHAT_EVENT when Exit chat mode is clicked', () => {
    render(<ChatOnlyUserMenu />);
    const trigger = screen.getByTestId('user-menu-trigger');
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      top: 100, left: 10, bottom: 128, right: 200,
      width: 190, height: 28, x: 10, y: 100,
      toJSON: () => ({}),
    } as DOMRect);
    act(() => { trigger.click(); });

    const dispatched: string[] = [];
    const listener = (e: Event): void => { dispatched.push(e.type); };
    window.addEventListener(TOGGLE_IMMERSIVE_CHAT_EVENT, listener);
    act(() => { screen.getByText('Exit chat mode').click(); });
    window.removeEventListener(TOGGLE_IMMERSIVE_CHAT_EVENT, listener);
    expect(dispatched).toContain(TOGGLE_IMMERSIVE_CHAT_EVENT);
  });

  it('dispatches TOGGLE_SHORTCUT_CHEATSHEET_EVENT when Keyboard shortcuts clicked', () => {
    render(<ChatOnlyUserMenu />);
    const trigger = screen.getByTestId('user-menu-trigger');
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      top: 100, left: 10, bottom: 128, right: 200,
      width: 190, height: 28, x: 10, y: 100,
      toJSON: () => ({}),
    } as DOMRect);
    act(() => { trigger.click(); });

    const dispatched: string[] = [];
    const listener = (e: Event): void => { dispatched.push(e.type); };
    window.addEventListener(TOGGLE_SHORTCUT_CHEATSHEET_EVENT, listener);
    act(() => { screen.getByText('Keyboard shortcuts').click(); });
    window.removeEventListener(TOGGLE_SHORTCUT_CHEATSHEET_EVENT, listener);
    expect(dispatched).toContain(TOGGLE_SHORTCUT_CHEATSHEET_EVENT);
  });

  it('Log out item is disabled', () => {
    render(<ChatOnlyUserMenu />);
    const trigger = screen.getByTestId('user-menu-trigger');
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      top: 100, left: 10, bottom: 128, right: 200,
      width: 190, height: 28, x: 10, y: 100,
      toJSON: () => ({}),
    } as DOMRect);
    act(() => { trigger.click(); });
    const logoutBtn = screen.getByText('Log out').closest('button');
    expect(logoutBtn?.disabled).toBe(true);
  });
});
