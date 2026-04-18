/**
 * SpinnerPresetPicker.test.tsx
 *
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SPINNER_PRESETS } from '../../themes/thinkingDefaults';
import { SpinnerPresetPicker } from './SpinnerPresetPicker';

afterEach(cleanup);

const BRAILLE_CHARS = SPINNER_PRESETS.find((p) => p.id === 'braille')!.chars;
const DOTS_CHARS    = SPINNER_PRESETS.find((p) => p.id === 'dots')!.chars;

describe('SpinnerPresetPicker', () => {
  it('renders without crashing', () => {
    render(<SpinnerPresetPicker chars={BRAILLE_CHARS} onChange={vi.fn()} />);
    expect(screen.getByTestId('spinner-preset-select')).toBeTruthy();
  });

  it('selects the matching preset when chars matches a known preset', () => {
    render(<SpinnerPresetPicker chars={BRAILLE_CHARS} onChange={vi.fn()} />);
    const sel = screen.getByTestId('spinner-preset-select') as HTMLSelectElement;
    expect(sel.value).toBe('braille');
  });

  it('selects "custom" when chars does not match any preset', () => {
    render(<SpinnerPresetPicker chars="abc" onChange={vi.fn()} />);
    const sel = screen.getByTestId('spinner-preset-select') as HTMLSelectElement;
    expect(sel.value).toBe('custom');
  });

  it('shows custom input when preset is "custom"', () => {
    render(<SpinnerPresetPicker chars="abc" onChange={vi.fn()} />);
    expect(screen.getByTestId('spinner-custom-input')).toBeTruthy();
  });

  it('does not show custom input for a named preset', () => {
    render(<SpinnerPresetPicker chars={BRAILLE_CHARS} onChange={vi.fn()} />);
    expect(screen.queryByTestId('spinner-custom-input')).toBeNull();
  });

  it('calls onChange with preset chars when a preset is selected', () => {
    const onChange = vi.fn();
    render(<SpinnerPresetPicker chars={BRAILLE_CHARS} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('spinner-preset-select'), {
      target: { value: 'dots' },
    });
    expect(onChange).toHaveBeenCalledWith(DOTS_CHARS);
  });

  it('calls onChange with custom chars when custom input changes', () => {
    const onChange = vi.fn();
    render(<SpinnerPresetPicker chars="abc" onChange={onChange} />);
    fireEvent.change(screen.getByTestId('spinner-custom-input'), {
      target: { value: '-+' },
    });
    expect(onChange).toHaveBeenCalledWith('-+');
  });

  it('does not call onChange for empty custom input', () => {
    const onChange = vi.fn();
    render(<SpinnerPresetPicker chars="abc" onChange={onChange} />);
    fireEvent.change(screen.getByTestId('spinner-custom-input'), {
      target: { value: '' },
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders a spinner preview element', () => {
    render(<SpinnerPresetPicker chars={BRAILLE_CHARS} onChange={vi.fn()} />);
    expect(screen.getByTestId('spinner-preview')).toBeTruthy();
  });

  it('switching to Custom preset shows the custom input', () => {
    render(<SpinnerPresetPicker chars={BRAILLE_CHARS} onChange={vi.fn()} />);
    fireEvent.change(screen.getByTestId('spinner-preset-select'), {
      target: { value: 'custom' },
    });
    expect(screen.getByTestId('spinner-custom-input')).toBeTruthy();
  });
});
