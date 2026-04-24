/**
 * @vitest-environment jsdom
 *
 * KeyboardShortcutCheatSheet tests — Wave 44 Phase C.
 */

import { act, cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { TOGGLE_SHORTCUT_CHEATSHEET_EVENT } from '../../../hooks/appEventNames';
import { KeyboardShortcutCheatSheet } from './KeyboardShortcutCheatSheet';

afterEach(() => cleanup());

describe('KeyboardShortcutCheatSheet', () => {
  it('renders nothing by default', () => {
    render(<KeyboardShortcutCheatSheet />);
    expect(screen.queryByTestId('cheatsheet-overlay')).toBeNull();
  });

  it('opens when TOGGLE_SHORTCUT_CHEATSHEET_EVENT fires', () => {
    render(<KeyboardShortcutCheatSheet />);
    act(() => {
      window.dispatchEvent(new CustomEvent(TOGGLE_SHORTCUT_CHEATSHEET_EVENT));
    });
    expect(screen.getByTestId('cheatsheet-overlay')).toBeTruthy();
  });

  it('closes when toggled a second time', () => {
    render(<KeyboardShortcutCheatSheet />);
    act(() => {
      window.dispatchEvent(new CustomEvent(TOGGLE_SHORTCUT_CHEATSHEET_EVENT));
    });
    expect(screen.getByTestId('cheatsheet-overlay')).toBeTruthy();
    act(() => {
      window.dispatchEvent(new CustomEvent(TOGGLE_SHORTCUT_CHEATSHEET_EVENT));
    });
    expect(screen.queryByTestId('cheatsheet-overlay')).toBeNull();
  });

  it('closes on Escape key', () => {
    render(<KeyboardShortcutCheatSheet />);
    act(() => {
      window.dispatchEvent(new CustomEvent(TOGGLE_SHORTCUT_CHEATSHEET_EVENT));
    });
    expect(screen.getByTestId('cheatsheet-overlay')).toBeTruthy();
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(screen.queryByTestId('cheatsheet-overlay')).toBeNull();
  });

  it('renders group titles when open', () => {
    render(<KeyboardShortcutCheatSheet />);
    act(() => {
      window.dispatchEvent(new CustomEvent(TOGGLE_SHORTCUT_CHEATSHEET_EVENT));
    });
    expect(screen.getByText('Chat')).toBeTruthy();
    expect(screen.getByText('Settings & Help')).toBeTruthy();
    expect(screen.getByText('Navigation')).toBeTruthy();
  });

  it('closes via close button', () => {
    render(<KeyboardShortcutCheatSheet />);
    act(() => {
      window.dispatchEvent(new CustomEvent(TOGGLE_SHORTCUT_CHEATSHEET_EVENT));
    });
    act(() => {
      screen.getByLabelText('Close keyboard shortcuts').click();
    });
    expect(screen.queryByTestId('cheatsheet-overlay')).toBeNull();
  });

  it('removes event listener on unmount', () => {
    const { unmount } = render(<KeyboardShortcutCheatSheet />);
    unmount();
    act(() => {
      window.dispatchEvent(new CustomEvent(TOGGLE_SHORTCUT_CHEATSHEET_EVENT));
    });
    expect(screen.queryByTestId('cheatsheet-overlay')).toBeNull();
  });
});
