/**
 * SelectPill.test.tsx — smoke tests for the SelectPill composite component.
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SelectPill } from './SelectPill';

afterEach(cleanup);

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
];

describe('SelectPill', () => {
  it('renders the current value label in the button', () => {
    render(
      <SelectPill label="Pick" value="a" options={OPTIONS} onChange={() => {}} />,
    );
    expect(screen.getByText('Alpha')).toBeTruthy();
  });

  it('opens the menu on button click', () => {
    render(
      <SelectPill label="Pick" value="a" options={OPTIONS} onChange={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('listbox')).toBeTruthy();
  });

  it('calls onChange when an option is selected', () => {
    const onChange = vi.fn();
    render(
      <SelectPill label="Pick" value="a" options={OPTIONS} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByText('Beta'));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('closes the menu after selection', () => {
    render(
      <SelectPill label="Pick" value="a" options={OPTIONS} onChange={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByText('Beta'));
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('renders defaultOption label when value matches', () => {
    const defaultOption = { value: '', label: 'Default' };
    render(
      <SelectPill
        label="Pick"
        value=""
        defaultOption={defaultOption}
        options={OPTIONS}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('Default')).toBeTruthy();
  });
});
