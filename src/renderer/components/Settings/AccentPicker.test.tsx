/**
 * @vitest-environment jsdom
 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccentPicker } from './AccentPicker';

// ── Mock useConfig ────────────────────────────────────────────────────────────

const mockSet = vi.fn().mockResolvedValue(undefined);
const mockConfig = vi.fn();

vi.mock('../../hooks/useConfig', () => ({
  useConfig: () => mockConfig(),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeConfig(accentOverride?: string) {
  return {
    config: { theming: accentOverride !== undefined ? { accentOverride } : {} },
    set: mockSet,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Test accent values — user-supplied hex colors exercising the picker override path.
const HEX_OVERRIDE_A = '#ff5500'; // hardcoded: test data — user-supplied accent color
const HEX_OVERRIDE_B = '#aa00bb'; // hardcoded: test data — user-supplied accent color
const HEX_DEFAULT = '#5ab9ff'; // hardcoded: test data — user-supplied accent color
const HEX_NEW = '#123456'; // hardcoded: test data — new accent value after change
const HEX_STEP_1 = '#111111'; // hardcoded: test data — first rapid-fire change value
const HEX_STEP_2 = '#222222'; // hardcoded: test data — second rapid-fire change value
const HEX_STEP_3 = '#333333'; // hardcoded: test data — final rapid-fire change (only one persisted)
const HEX_PENDING = '#deadbe'; // hardcoded: test data — pending debounce value that reset cancels

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AccentPicker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders with no override — shows "(theme default" label and disables reset', () => {
    mockConfig.mockReturnValue(makeConfig());
    render(<AccentPicker />);
    expect(screen.getByText(/\(theme default/i)).toBeTruthy();
    const resetBtn = screen.getByRole('button', { name: /reset to theme default/i });
    expect(resetBtn).toHaveProperty('disabled', true);
  });

  it('renders with override — shows custom hex and enables reset', () => {
    mockConfig.mockReturnValue(makeConfig(HEX_OVERRIDE_A));
    render(<AccentPicker />);
    expect(screen.getByText(/custom/i)).toBeTruthy();
    const resetBtn = screen.getByRole('button', { name: /reset to theme default/i });
    expect(resetBtn).toHaveProperty('disabled', false);
  });

  it('color wheel shows the override value', () => {
    mockConfig.mockReturnValue(makeConfig(HEX_OVERRIDE_B));
    render(<AccentPicker />);
    const colorInput = screen.getByLabelText('Accent color picker') as HTMLInputElement;
    expect(colorInput.value).toBe(HEX_OVERRIDE_B);
  });

  it('changing color wheel debounces config.set by 16ms', async () => {
    mockConfig.mockReturnValue(makeConfig(HEX_DEFAULT));
    render(<AccentPicker />);

    const colorInput = screen.getByLabelText('Accent color picker');
    fireEvent.change(colorInput, { target: { value: HEX_NEW } });

    // Not called yet — still inside debounce window
    expect(mockSet).not.toHaveBeenCalled();

    // Advance past debounce
    await act(async () => { vi.advanceTimersByTime(16); });

    expect(mockSet).toHaveBeenCalledWith(
      'theming',
      expect.objectContaining({ accentOverride: HEX_NEW }),
    );
  });

  it('rapid changes only produce one config.set call (debounce collapses writes)', async () => {
    mockConfig.mockReturnValue(makeConfig(HEX_DEFAULT));
    render(<AccentPicker />);

    const colorInput = screen.getByLabelText('Accent color picker');
    fireEvent.change(colorInput, { target: { value: HEX_STEP_1 } });
    fireEvent.change(colorInput, { target: { value: HEX_STEP_2 } });
    fireEvent.change(colorInput, { target: { value: HEX_STEP_3 } });

    await act(async () => { vi.advanceTimersByTime(16); });

    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledWith(
      'theming',
      expect.objectContaining({ accentOverride: HEX_STEP_3 }),
    );
  });

  it('reset button calls config.set without accentOverride key', () => {
    mockConfig.mockReturnValue(makeConfig(HEX_OVERRIDE_A));
    render(<AccentPicker />);

    const resetBtn = screen.getByRole('button', { name: /reset to theme default/i });
    fireEvent.click(resetBtn);

    expect(mockSet).toHaveBeenCalledWith(
      'theming',
      expect.not.objectContaining({ accentOverride: expect.anything() }),
    );
  });

  it('reset cancels a pending debounced write', async () => {
    mockConfig.mockReturnValue(makeConfig(HEX_DEFAULT));
    render(<AccentPicker />);

    const colorInput = screen.getByLabelText('Accent color picker');
    fireEvent.change(colorInput, { target: { value: HEX_PENDING } });

    // Reset fires before the 16ms debounce expires
    const resetBtn = screen.getByRole('button', { name: /reset to theme default/i });
    fireEvent.click(resetBtn);

    await act(async () => { vi.advanceTimersByTime(16); });

    // Only the reset write should have fired, not the debounced color write
    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledWith(
      'theming',
      expect.not.objectContaining({ accentOverride: HEX_PENDING }),
    );
  });
});
