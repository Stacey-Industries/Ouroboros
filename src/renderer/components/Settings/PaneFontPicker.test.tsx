/**
 * PaneFontPicker.test.tsx — Unit tests for PaneFontPicker.
 * Wave 35 Phase F.
 *
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MONO_FONTS, UI_FONTS } from '../../themes/fontPickerOptions';

// ── Mock useConfig ────────────────────────────────────────────────────────────

const mockSet = vi.fn();
const mockConfig = {
  theming: {
    fonts: { editor: MONO_FONTS[0].value, chat: UI_FONTS[0].value, terminal: MONO_FONTS[0].value },
  },
};

vi.mock('../../hooks/useConfig', () => ({
  useConfig: () => ({ config: mockConfig, set: mockSet }),
}));

// ── Import after mock ─────────────────────────────────────────────────────────

const { PaneFontPicker } = await import('./PaneFontPicker');

afterEach(cleanup);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PaneFontPicker', () => {
  it('renders three dropdowns', () => {
    render(<PaneFontPicker />);
    expect(screen.getByTestId('font-select-editor')).toBeTruthy();
    expect(screen.getByTestId('font-select-chat')).toBeTruthy();
    expect(screen.getByTestId('font-select-terminal')).toBeTruthy();
  });

  it('changing editor font calls set with theming patch', () => {
    render(<PaneFontPicker />);
    const editorSelect = screen.getByTestId('font-select-editor');
    fireEvent.change(editorSelect, { target: { value: 'jetbrains' } });
    const jetbrains = MONO_FONTS.find((f) => f.id === 'jetbrains')!;
    expect(mockSet).toHaveBeenCalledWith(
      'theming',
      expect.objectContaining({
        fonts: expect.objectContaining({ editor: jetbrains.value }),
      }),
    );
  });

  it('changing chat font calls set with theming patch', () => {
    render(<PaneFontPicker />);
    const chatSelect = screen.getByTestId('font-select-chat');
    const inter = UI_FONTS.find((f) => f.id === 'inter')!;
    fireEvent.change(chatSelect, { target: { value: 'inter' } });
    expect(mockSet).toHaveBeenCalledWith(
      'theming',
      expect.objectContaining({
        fonts: expect.objectContaining({ chat: inter.value }),
      }),
    );
  });

  it('reset button clears all three fonts', () => {
    render(<PaneFontPicker />);
    const resetBtn = screen.getByTestId('font-reset-btn');
    fireEvent.click(resetBtn);
    expect(mockSet).toHaveBeenCalledWith(
      'theming',
      expect.objectContaining({
        fonts: { editor: '', chat: '', terminal: '' },
      }),
    );
  });
});
