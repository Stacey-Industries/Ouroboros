/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AccentPickerColorWheel } from './AccentPickerColorWheel';

afterEach(cleanup);

// Test hex values — user-supplied accent colors; the hex IS the feature under test.
const HEX_INITIAL = '#5ab9ff'; // hardcoded: test data — initial user-supplied accent color
const HEX_RED_LOWER = '#ff0000'; // hardcoded: test data — new accent after color wheel change
const HEX_RED_UPPER = '#FF0000'; // hardcoded: test data — uppercase hex to verify normalisation
const HEX_INITIAL_2 = '#334455'; // hardcoded: test data — initial accent differing from shorthand expansion
const HEX_SHORT = '#123'; // hardcoded: test data — 3-char shorthand to expand on blur
const HEX_SHORT_EXPANDED = '#112233'; // hardcoded: test data — expanded form of #123

describe('AccentPickerColorWheel', () => {
  it('renders color input with the provided hex value', () => {
    render(<AccentPickerColorWheel hex={HEX_INITIAL} onChange={vi.fn()} />);
    const colorInput = screen.getByLabelText('Accent color picker') as HTMLInputElement;
    expect(colorInput.value).toBe(HEX_INITIAL);
  });

  it('renders hex text input with the provided hex value', () => {
    render(<AccentPickerColorWheel hex={HEX_INITIAL} onChange={vi.fn()} />);
    const hexInput = screen.getByLabelText('Accent color hex value') as HTMLInputElement;
    expect(hexInput.value).toBe(HEX_INITIAL);
  });

  it('calls onChange when color wheel changes', () => {
    const onChange = vi.fn();
    render(<AccentPickerColorWheel hex={HEX_INITIAL} onChange={onChange} />);
    const colorInput = screen.getByLabelText('Accent color picker');
    fireEvent.change(colorInput, { target: { value: HEX_RED_LOWER } });
    expect(onChange).toHaveBeenCalledWith(HEX_RED_LOWER);
  });

  it('calls onChange with normalised hex on valid hex text input change', () => {
    const onChange = vi.fn();
    render(<AccentPickerColorWheel hex={HEX_INITIAL} onChange={onChange} />);
    const hexInput = screen.getByLabelText('Accent color hex value');
    fireEvent.change(hexInput, { target: { value: HEX_RED_UPPER } });
    expect(onChange).toHaveBeenCalledWith(HEX_RED_LOWER);
  });

  it('does not call onChange on blur with invalid value', () => {
    const onChange = vi.fn();
    render(<AccentPickerColorWheel hex={HEX_INITIAL} onChange={onChange} />);
    const hexInput = screen.getByLabelText('Accent color hex value') as HTMLInputElement;
    fireEvent.blur(hexInput, { target: { value: 'notacolor' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('normalises 3-char shorthand hex on blur and calls onChange when different from current', () => {
    const onChange = vi.fn();
    render(<AccentPickerColorWheel hex={HEX_INITIAL_2} onChange={onChange} />);
    const hexInput = screen.getByLabelText('Accent color hex value') as HTMLInputElement;
    fireEvent.blur(hexInput, { target: { value: HEX_SHORT } });
    expect(onChange).toHaveBeenCalledWith(HEX_SHORT_EXPANDED);
  });
});
