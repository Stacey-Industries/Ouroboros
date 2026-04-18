/**
 * FontDropdown.test.tsx — Unit tests for the FontDropdown component.
 * Wave 35 Phase F.
 *
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MONO_FONTS } from '../../themes/fontPickerOptions';
import { FontDropdown } from './FontDropdown';

afterEach(cleanup);

const TEST_OPTIONS = MONO_FONTS;

describe('FontDropdown', () => {
  it('renders label and select', () => {
    render(
      <FontDropdown
        label="Editor"
        options={TEST_OPTIONS}
        value={TEST_OPTIONS[0].value}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Editor')).toBeTruthy();
    expect(screen.getByTestId('font-select-editor')).toBeTruthy();
  });

  it('selects the matching option for a known value', () => {
    const jetbrains = TEST_OPTIONS.find((o) => o.id === 'jetbrains')!;
    render(
      <FontDropdown
        label="Editor"
        options={TEST_OPTIONS}
        value={jetbrains.value}
        onChange={vi.fn()}
      />,
    );
    const select = screen.getByTestId('font-select-editor') as HTMLSelectElement;
    expect(select.value).toBe('jetbrains');
  });

  it('calls onChange with option value when a preset is selected', () => {
    const onChange = vi.fn();
    render(
      <FontDropdown
        label="Editor"
        options={TEST_OPTIONS}
        value={TEST_OPTIONS[0].value}
        onChange={onChange}
      />,
    );
    const select = screen.getByTestId('font-select-editor');
    fireEvent.change(select, { target: { value: 'jetbrains' } });
    const jetbrains = TEST_OPTIONS.find((o) => o.id === 'jetbrains')!;
    expect(onChange).toHaveBeenCalledWith(jetbrains.value);
  });

  it('shows custom input when value does not match any preset', () => {
    render(
      <FontDropdown
        label="Editor"
        options={TEST_OPTIONS}
        value='"My Font", monospace'
        onChange={vi.fn()}
      />,
    );
    const customInput = screen.getByTestId('font-custom-editor');
    expect(customInput).toBeTruthy();
    expect((customInput as HTMLInputElement).value).toBe('"My Font", monospace');
  });

  it('does not show custom input for a known preset value', () => {
    render(
      <FontDropdown
        label="Editor"
        options={TEST_OPTIONS}
        value={TEST_OPTIONS[0].value}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('font-custom-editor')).toBeNull();
  });

  it('calls onChange with empty string when Custom… is selected', () => {
    const onChange = vi.fn();
    render(
      <FontDropdown
        label="Editor"
        options={TEST_OPTIONS}
        value={TEST_OPTIONS[0].value}
        onChange={onChange}
      />,
    );
    const select = screen.getByTestId('font-select-editor');
    fireEvent.change(select, { target: { value: '__custom__' } });
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('calls onChange when custom input text changes', () => {
    const onChange = vi.fn();
    render(
      <FontDropdown
        label="Editor"
        options={TEST_OPTIONS}
        value='"My Font", monospace'
        onChange={onChange}
      />,
    );
    const customInput = screen.getByTestId('font-custom-editor');
    fireEvent.change(customInput, { target: { value: '"Other Font", monospace' } });
    expect(onChange).toHaveBeenCalledWith('"Other Font", monospace');
  });
});
