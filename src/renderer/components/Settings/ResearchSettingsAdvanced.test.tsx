/**
 * ResearchSettingsAdvanced.test.tsx — Smoke tests for the Phase I Advanced
 * tuning-knobs subsection.
 *
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ResearchSettingsAdvanced } from './ResearchSettingsAdvanced';

// ─── Fixture ──────────────────────────────────────────────────────────────────

function makeSettings(overrides: Record<string, unknown> = {}) {
  return {
    globalEnabled: true,
    defaultMode: 'conservative' as const,
    stalenessConfidenceFloor: 0.0,
    factClaimEnabled: true,
    factClaimMinPatternConfidence: 'medium' as const,
    preEditDryRunOnly: false,
    maxLatencyMs: 800,
    ...overrides,
  };
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

// ─── Collapsed state ──────────────────────────────────────────────────────────

describe('ResearchSettingsAdvanced — collapsed by default', () => {
  it('renders the section heading', () => {
    const onUpdate = vi.fn();
    render(<ResearchSettingsAdvanced settings={makeSettings()} onUpdate={onUpdate} />);
    expect(screen.getByText(/advanced.*tuning knobs/i)).toBeTruthy();
  });

  it('does not render knob controls when collapsed', () => {
    render(<ResearchSettingsAdvanced settings={makeSettings()} onUpdate={vi.fn()} />);
    expect(screen.queryByText(/staleness confidence floor/i)).toBeNull();
    expect(screen.queryByText(/fact-claim detector/i)).toBeNull();
    expect(screen.queryByText(/pre-edit dry-run/i)).toBeNull();
    expect(screen.queryByText(/max latency/i)).toBeNull();
  });
});

// ─── Expand / collapse ────────────────────────────────────────────────────────

describe('ResearchSettingsAdvanced — expand on click', () => {
  it('expands when the heading button is clicked', () => {
    render(<ResearchSettingsAdvanced settings={makeSettings()} onUpdate={vi.fn()} />);
    const btn = screen.getByRole('button', { name: /advanced.*tuning knobs/i });
    fireEvent.click(btn);
    expect(screen.getByText(/staleness confidence floor/i)).toBeTruthy();
    expect(screen.getAllByText(/fact-claim detector/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/min pattern confidence/i)).toBeTruthy();
    expect(screen.getByText(/pre-edit dry-run mode/i)).toBeTruthy();
    expect(screen.getByText(/max latency/i)).toBeTruthy();
  });

  it('collapses again on second click', () => {
    render(<ResearchSettingsAdvanced settings={makeSettings()} onUpdate={vi.fn()} />);
    const btn = screen.getByRole('button', { name: /advanced.*tuning knobs/i });
    fireEvent.click(btn); // expand
    fireEvent.click(btn); // collapse
    expect(screen.queryByText(/staleness confidence floor/i)).toBeNull();
  });
});

// ─── Initial values ───────────────────────────────────────────────────────────

describe('ResearchSettingsAdvanced — reads initial values', () => {
  function expandAndRender(overrides: Record<string, unknown> = {}) {
    const onUpdate = vi.fn();
    render(<ResearchSettingsAdvanced settings={makeSettings(overrides)} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByRole('button', { name: /advanced.*tuning knobs/i }));
    return { onUpdate };
  }

  it('shows the current staleness floor value', () => {
    expandAndRender({ stalenessConfidenceFloor: 0.5 });
    expect(screen.getByText('0.5')).toBeTruthy();
  });

  it('reflects factClaimEnabled=false on the toggle', () => {
    expandAndRender({ factClaimEnabled: false });
    const toggle = screen.getByRole('switch', { name: /fact-claim detector/i });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('reflects factClaimEnabled=true on the toggle', () => {
    expandAndRender({ factClaimEnabled: true });
    const toggle = screen.getByRole('switch', { name: /fact-claim detector/i });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });

  it('checks the correct min-confidence radio', () => {
    expandAndRender({ factClaimMinPatternConfidence: 'high' });
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    const highRadio = radios.find((r) => r.value === 'high');
    expect(highRadio?.checked).toBe(true);
  });

  it('reflects preEditDryRunOnly=true on its toggle', () => {
    expandAndRender({ preEditDryRunOnly: true });
    const toggle = screen.getByRole('switch', { name: /pre-edit dry-run mode/i });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });

  it('shows the current maxLatencyMs in the number input', () => {
    expandAndRender({ maxLatencyMs: 1200 });
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(input.value).toBe('1200');
  });
});

// ─── onChange dispatches ──────────────────────────────────────────────────────

describe('ResearchSettingsAdvanced — change dispatches config write', () => {
  function expandAndRender(overrides: Record<string, unknown> = {}) {
    const onUpdate = vi.fn();
    render(<ResearchSettingsAdvanced settings={makeSettings(overrides)} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByRole('button', { name: /advanced.*tuning knobs/i }));
    return { onUpdate };
  }

  it('calls onUpdate with new factClaimEnabled when toggle is clicked', () => {
    const { onUpdate } = expandAndRender({ factClaimEnabled: true });
    const toggle = screen.getByRole('switch', { name: /fact-claim detector/i });
    fireEvent.click(toggle);
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ factClaimEnabled: false }));
  });

  it('calls onUpdate with new preEditDryRunOnly when toggle is clicked', () => {
    const { onUpdate } = expandAndRender({ preEditDryRunOnly: false });
    const toggle = screen.getByRole('switch', { name: /pre-edit dry-run mode/i });
    fireEvent.click(toggle);
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ preEditDryRunOnly: true }));
  });

  it('calls onUpdate with new factClaimMinPatternConfidence when radio changes', () => {
    const { onUpdate } = expandAndRender({ factClaimMinPatternConfidence: 'medium' });
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    const lowRadio = radios.find((r) => r.value === 'low')!;
    fireEvent.click(lowRadio);
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ factClaimMinPatternConfidence: 'low' }),
    );
  });

  it('calls onUpdate with new maxLatencyMs when input changes', () => {
    const { onUpdate } = expandAndRender({ maxLatencyMs: 800 });
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '1500' } });
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ maxLatencyMs: 1500 }));
  });

  it('clamps maxLatencyMs to 100 minimum', () => {
    const { onUpdate } = expandAndRender({ maxLatencyMs: 800 });
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '0' } });
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ maxLatencyMs: 100 }));
  });

  it('clamps maxLatencyMs to 5000 maximum', () => {
    const { onUpdate } = expandAndRender({ maxLatencyMs: 800 });
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '9999' } });
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ maxLatencyMs: 5000 }));
  });
});
