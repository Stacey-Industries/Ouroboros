/**
 * SelectPill.parts.test.tsx — smoke tests for extracted presentational components.
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  SelectPillGroupItems,
  SelectPillItem,
  SelectPillMenu,
  SelectPillMenuItems,
} from './SelectPill.parts';

afterEach(cleanup);

describe('SelectPillItem', () => {
  it('renders item label', () => {
    render(
      <SelectPillItem item={{ value: 'a', label: 'Alpha' }} selected={false} onSelect={() => {}} />,
    );
    expect(screen.getByText('Alpha')).toBeTruthy();
  });

  it('calls onSelect with value on click', () => {
    const onSelect = vi.fn();
    render(
      <SelectPillItem item={{ value: 'a', label: 'Alpha' }} selected={false} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByText('Alpha'));
    expect(onSelect).toHaveBeenCalledWith('a');
  });

  it('applies accent class when selected', () => {
    const { container } = render(
      <SelectPillItem item={{ value: 'a', label: 'Alpha' }} selected={true} onSelect={() => {}} />,
    );
    expect(container.querySelector('button')?.className).toContain('bg-interactive-accent');
  });
});

describe('SelectPillGroupItems', () => {
  it('renders group label and options', () => {
    const groups = [{ label: 'Group A', options: [{ value: 'x', label: 'X-Ray' }] }];
    render(<SelectPillGroupItems groups={groups} value="" onSelect={() => {}} />);
    expect(screen.getByText('Group A')).toBeTruthy();
    expect(screen.getByText('X-Ray')).toBeTruthy();
  });
});

describe('SelectPillMenuItems', () => {
  it('renders flat options', () => {
    const options = [
      { value: '1', label: 'One' },
      { value: '2', label: 'Two' },
    ];
    render(<SelectPillMenuItems options={options} value="1" onSelect={() => {}} />);
    expect(screen.getByText('One')).toBeTruthy();
    expect(screen.getByText('Two')).toBeTruthy();
  });

  it('renders defaultOption first', () => {
    const defaultOption = { value: 'def', label: 'Default' };
    render(
      <SelectPillMenuItems
        defaultOption={defaultOption}
        options={[{ value: 'opt', label: 'Option' }]}
        value="def"
        onSelect={() => {}}
      />,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons[0].textContent).toBe('Default');
  });
});

describe('SelectPillMenu', () => {
  it('renders with listbox role', () => {
    render(
      <SelectPillMenu
        options={[{ value: 'a', label: 'Alpha' }]}
        value="a"
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole('listbox')).toBeTruthy();
  });
});
