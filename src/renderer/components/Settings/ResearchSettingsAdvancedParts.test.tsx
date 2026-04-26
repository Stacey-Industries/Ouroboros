/**
 * ResearchSettingsAdvancedParts.test.tsx — Smoke tests for extracted parts.
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ConfidenceRadioGroup,
  helpTextStyle,
  inputStyle,
  KnobRow,
  labelColStyle,
  labelTextStyle,
  MiniToggle,
  rowStyle,
} from './ResearchSettingsAdvancedParts';

afterEach(cleanup);

describe('style constants', () => {
  it('rowStyle has display flex', () => {
    expect(rowStyle.display).toBe('flex');
  });
  it('labelColStyle has flex 1', () => {
    expect(labelColStyle.flex).toBe(1);
  });
  it('labelTextStyle has fontSize 13px', () => {
    expect(labelTextStyle.fontSize).toBe('13px');
  });
  it('helpTextStyle has fontSize 11px', () => {
    expect(helpTextStyle.fontSize).toBe('11px');
  });
  it('inputStyle has fontFamily mono', () => {
    expect(inputStyle.fontFamily).toBe('var(--font-mono)');
  });
});

describe('MiniToggle', () => {
  it('renders a button with role switch', () => {
    render(<MiniToggle checked={false} label="test toggle" onChange={vi.fn()} />);
    expect(screen.getByRole('switch')).toBeDefined();
  });

  it('calls onChange with toggled value when clicked', () => {
    const onChange = vi.fn();
    render(<MiniToggle checked={false} label="toggle" onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('calls onChange with false when currently checked', () => {
    const onChange = vi.fn();
    render(<MiniToggle checked={true} label="toggle" onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(false);
  });
});

describe('KnobRow', () => {
  it('renders label and help text', () => {
    render(<KnobRow label="My Label" help="My help text" control={<span>ctrl</span>} />);
    expect(screen.getByText('My Label')).toBeDefined();
    expect(screen.getByText('My help text')).toBeDefined();
    expect(screen.getByText('ctrl')).toBeDefined();
  });
});

describe('ConfidenceRadioGroup', () => {
  it('renders High, Medium, Low options', () => {
    render(<ConfidenceRadioGroup value="medium" onChange={vi.fn()} />);
    expect(screen.getByText('High')).toBeDefined();
    expect(screen.getByText('Medium')).toBeDefined();
    expect(screen.getByText('Low')).toBeDefined();
  });

  it('calls onChange with selected value', () => {
    const onChange = vi.fn();
    render(<ConfidenceRadioGroup value="medium" onChange={onChange} />);
    fireEvent.click(screen.getByDisplayValue('high'));
    expect(onChange).toHaveBeenCalledWith('high');
  });
});
