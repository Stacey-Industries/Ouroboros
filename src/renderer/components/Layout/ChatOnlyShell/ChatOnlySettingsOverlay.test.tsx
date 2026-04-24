/**
 * @vitest-environment jsdom
 *
 * ChatOnlySettingsOverlay tests — Wave 44 Phase C.
 */

import { act, cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OPEN_SETTINGS_EVENT } from '../../../hooks/appEventNames';

// SettingsModal renders into document.body via createPortal and has complex
// internal state. Stub it so tests focus on the overlay's own wiring.
vi.mock('../../Settings/SettingsModal', () => ({
  SettingsModal: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? (
      <div data-testid="settings-modal">
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}));

import { ChatOnlySettingsOverlay } from './ChatOnlySettingsOverlay';

afterEach(() => cleanup());

describe('ChatOnlySettingsOverlay', () => {
  it('renders closed by default', () => {
    render(<ChatOnlySettingsOverlay />);
    expect(screen.queryByTestId('settings-modal')).toBeNull();
  });

  it('opens when OPEN_SETTINGS_EVENT fires', () => {
    render(<ChatOnlySettingsOverlay />);
    act(() => {
      window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT));
    });
    expect(screen.getByTestId('settings-modal')).toBeTruthy();
  });

  it('closes when onClose is called', () => {
    render(<ChatOnlySettingsOverlay />);
    act(() => {
      window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT));
    });
    expect(screen.getByTestId('settings-modal')).toBeTruthy();
    act(() => {
      screen.getByText('Close').click();
    });
    expect(screen.queryByTestId('settings-modal')).toBeNull();
  });

  it('removes event listener on unmount', () => {
    const { unmount } = render(<ChatOnlySettingsOverlay />);
    unmount();
    act(() => {
      window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT));
    });
    // No error; modal simply never opened
    expect(screen.queryByTestId('settings-modal')).toBeNull();
  });
});
