/**
 * ResearchSettings.test.tsx — Unit tests for Wave 30 Phase G research
 * auto-firing settings section.
 *
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppConfig } from '../../types/electron';
import { ResearchSettings } from './ResearchSettings';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<AppConfig['researchSettings']> = {}): AppConfig {
  return {
    researchSettings: {
      globalEnabled: false,
      defaultMode: 'conservative',
      ...overrides,
    },
  } as unknown as AppConfig;
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

// ─── Rendering ────────────────────────────────────────────────────────────────

describe('ResearchSettings — rendering', () => {
  it('renders without crashing', () => {
    const onChange = vi.fn();
    render(<ResearchSettings draft={makeConfig()} onChange={onChange} />);
    expect(screen.getByText(/research auto-firing/i)).toBeTruthy();
  });

  it('renders the global toggle', () => {
    render(<ResearchSettings draft={makeConfig()} onChange={vi.fn()} />);
    expect(screen.getByText(/enable automatic research/i)).toBeTruthy();
  });

  it('renders three mode radio options', () => {
    render(<ResearchSettings draft={makeConfig()} onChange={vi.fn()} />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
  });

  it('renders Off, Conservative, and Aggressive mode labels', () => {
    render(<ResearchSettings draft={makeConfig()} onChange={vi.fn()} />);
    expect(screen.getByText('Off')).toBeTruthy();
    expect(screen.getByText('Conservative')).toBeTruthy();
    expect(screen.getByText('Aggressive')).toBeTruthy();
  });

  it('shows the note about per-session override when global is off', () => {
    render(<ResearchSettings draft={makeConfig({ globalEnabled: false })} onChange={vi.fn()} />);
    expect(screen.getByText(/ctrl\+alt\+r/i)).toBeTruthy();
  });

  it('hides the per-session note when global is enabled', () => {
    render(<ResearchSettings draft={makeConfig({ globalEnabled: true })} onChange={vi.fn()} />);
    expect(screen.queryByText(/ctrl\+alt\+r/i)).toBeNull();
  });
});

// ─── Global enabled toggle ────────────────────────────────────────────────────

describe('ResearchSettings — global enabled toggle', () => {
  it('shows toggle as unchecked when globalEnabled is false', () => {
    render(<ResearchSettings draft={makeConfig({ globalEnabled: false })} onChange={vi.fn()} />);
    // SwitchControl renders a button[role=switch]; aria-checked reflects state
    const switchEl = screen.getByRole('switch', { name: /enable automatic research/i });
    expect(switchEl.getAttribute('aria-checked')).toBe('false');
  });

  it('shows toggle as checked when globalEnabled is true', () => {
    render(<ResearchSettings draft={makeConfig({ globalEnabled: true })} onChange={vi.fn()} />);
    const switchEl = screen.getByRole('switch', { name: /enable automatic research/i });
    expect(switchEl.getAttribute('aria-checked')).toBe('true');
  });

  it('calls onChange with researchSettings when toggle is clicked', () => {
    const onChange = vi.fn();
    render(<ResearchSettings draft={makeConfig({ globalEnabled: false })} onChange={onChange} />);
    const switchEl = screen.getByRole('switch', { name: /enable automatic research/i });
    fireEvent.click(switchEl);
    expect(onChange).toHaveBeenCalledOnce();
    const [key, value] = onChange.mock.calls[0] as [string, AppConfig['researchSettings']];
    expect(key).toBe('researchSettings');
    expect(value?.globalEnabled).toBe(true);
  });
});

// ─── Default mode radio group ─────────────────────────────────────────────────

describe('ResearchSettings — default mode radio group', () => {
  it('checks the radio matching current defaultMode', () => {
    render(<ResearchSettings draft={makeConfig({ globalEnabled: true, defaultMode: 'aggressive' })} onChange={vi.fn()} />);
    const radio = document.getElementById('research-mode-aggressive') as HTMLInputElement;
    expect(radio).toBeTruthy();
    expect(radio.checked).toBe(true);
  });

  it('disables all radios when globalEnabled is false', () => {
    render(<ResearchSettings draft={makeConfig({ globalEnabled: false })} onChange={vi.fn()} />);
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios.every((r) => r.disabled)).toBe(true);
  });

  it('enables all radios when globalEnabled is true', () => {
    render(<ResearchSettings draft={makeConfig({ globalEnabled: true })} onChange={vi.fn()} />);
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios.every((r) => !r.disabled)).toBe(true);
  });

  it('calls onChange with new defaultMode when a radio is selected', () => {
    const onChange = vi.fn();
    render(<ResearchSettings draft={makeConfig({ globalEnabled: true, defaultMode: 'conservative' })} onChange={onChange} />);
    const offRadio = document.getElementById('research-mode-off') as HTMLInputElement;
    fireEvent.click(offRadio);
    expect(onChange).toHaveBeenCalledOnce();
    const [key, value] = onChange.mock.calls[0] as [string, AppConfig['researchSettings']];
    expect(key).toBe('researchSettings');
    expect(value?.defaultMode).toBe('off');
  });

  it('preserves globalEnabled when only defaultMode changes', () => {
    const onChange = vi.fn();
    render(<ResearchSettings draft={makeConfig({ globalEnabled: true, defaultMode: 'conservative' })} onChange={onChange} />);
    const aggressiveRadio = document.getElementById('research-mode-aggressive') as HTMLInputElement;
    fireEvent.click(aggressiveRadio);
    const [, value] = onChange.mock.calls[0] as [string, AppConfig['researchSettings']];
    expect(value?.globalEnabled).toBe(true);
    expect(value?.defaultMode).toBe('aggressive');
  });
});

// ─── Defaults when researchSettings is absent ─────────────────────────────────

describe('ResearchSettings — absent config key', () => {
  it('renders without crash when researchSettings is undefined', () => {
    const draft = {} as unknown as AppConfig;
    render(<ResearchSettings draft={draft} onChange={vi.fn()} />);
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  it('defaults to conservative mode when researchSettings is undefined', () => {
    const draft = {} as unknown as AppConfig;
    render(<ResearchSettings draft={draft} onChange={vi.fn()} />);
    const conservative = document.getElementById('research-mode-conservative') as HTMLInputElement;
    expect(conservative).toBeTruthy();
    expect(conservative.checked).toBe(true);
  });
});
