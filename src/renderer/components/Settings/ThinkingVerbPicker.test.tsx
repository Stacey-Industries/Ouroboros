/**
 * ThinkingVerbPicker.test.tsx
 *
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SPINNER_CHARS, DEFAULT_THINKING_VERBS } from '../../themes/thinkingDefaults';
import { ThinkingVerbPicker } from './ThinkingVerbPicker';

// ── Mock useConfig ────────────────────────────────────────────────────────────

const mockSet = vi.fn().mockResolvedValue(undefined);
const mockConfig = vi.fn();

vi.mock('../../hooks/useConfig', () => ({
  useConfig: () => mockConfig(),
}));

function makeConfig(theming?: Record<string, unknown>) {
  return { config: { theming: theming ?? {} }, set: mockSet };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ThinkingVerbPicker — render', () => {
  it('renders the section without crashing', () => {
    mockConfig.mockReturnValue(makeConfig());
    render(<ThinkingVerbPicker />);
    expect(screen.getByTestId('thinking-verb-picker')).toBeTruthy();
  });

  it('renders the reset button', () => {
    mockConfig.mockReturnValue(makeConfig());
    render(<ThinkingVerbPicker />);
    expect(screen.getByTestId('thinking-reset-btn')).toBeTruthy();
  });

  it('renders the verb list', () => {
    mockConfig.mockReturnValue(makeConfig());
    render(<ThinkingVerbPicker />);
    expect(screen.getByTestId('verb-chip-list')).toBeTruthy();
  });

  it('renders the spinner preset dropdown', () => {
    mockConfig.mockReturnValue(makeConfig());
    render(<ThinkingVerbPicker />);
    expect(screen.getByTestId('spinner-preset-select')).toBeTruthy();
  });

  it('override toggle is unchecked when verbOverride is empty', () => {
    mockConfig.mockReturnValue(makeConfig({ verbOverride: '' }));
    render(<ThinkingVerbPicker />);
    const toggle = screen.getByTestId('override-toggle') as HTMLInputElement;
    expect(toggle.checked).toBe(false);
  });

  it('override toggle is checked when verbOverride is set', () => {
    mockConfig.mockReturnValue(makeConfig({ verbOverride: 'ruminating' }));
    render(<ThinkingVerbPicker />);
    const toggle = screen.getByTestId('override-toggle') as HTMLInputElement;
    expect(toggle.checked).toBe(true);
  });

  it('shows override input when verbOverride is set', () => {
    mockConfig.mockReturnValue(makeConfig({ verbOverride: 'ruminating' }));
    render(<ThinkingVerbPicker />);
    const input = screen.getByTestId('override-input') as HTMLInputElement;
    expect(input.value).toBe('ruminating');
  });

  it('hides override input when verbOverride is empty', () => {
    mockConfig.mockReturnValue(makeConfig({ verbOverride: '' }));
    render(<ThinkingVerbPicker />);
    expect(screen.queryByTestId('override-input')).toBeNull();
  });
});

describe('ThinkingVerbPicker — interactions', () => {
  it('enabling override toggle writes verbOverride to config', () => {
    mockConfig.mockReturnValue(makeConfig({ thinkingVerbs: ['pondering'], verbOverride: '' }));
    render(<ThinkingVerbPicker />);
    fireEvent.click(screen.getByTestId('override-toggle'));
    expect(mockSet).toHaveBeenCalledWith(
      'theming',
      expect.objectContaining({ verbOverride: 'pondering' }),
    );
  });

  it('disabling override toggle clears verbOverride', () => {
    mockConfig.mockReturnValue(makeConfig({ verbOverride: 'ruminating' }));
    render(<ThinkingVerbPicker />);
    fireEvent.click(screen.getByTestId('override-toggle'));
    expect(mockSet).toHaveBeenCalledWith(
      'theming',
      expect.objectContaining({ verbOverride: '' }),
    );
  });

  it('typing in override input updates verbOverride', () => {
    mockConfig.mockReturnValue(makeConfig({ verbOverride: 'musing' }));
    render(<ThinkingVerbPicker />);
    fireEvent.change(screen.getByTestId('override-input'), {
      target: { value: 'cogitating' },
    });
    expect(mockSet).toHaveBeenCalledWith(
      'theming',
      expect.objectContaining({ verbOverride: 'cogitating' }),
    );
  });

  it('reset button restores defaults', () => {
    mockConfig.mockReturnValue(makeConfig({
      thinkingVerbs: ['custom'],
      spinnerChars: '|/',
      verbOverride: 'ruminating',
    }));
    render(<ThinkingVerbPicker />);
    fireEvent.click(screen.getByTestId('thinking-reset-btn'));
    expect(mockSet).toHaveBeenCalledWith(
      'theming',
      expect.objectContaining({
        thinkingVerbs: Array.from(DEFAULT_THINKING_VERBS),
        spinnerChars: DEFAULT_SPINNER_CHARS,
        verbOverride: '',
      }),
    );
  });
});
