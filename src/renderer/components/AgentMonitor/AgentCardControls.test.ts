/**
 * AgentCardControls.test.ts — Unit tests for AgentCardControls pure helpers.
 */

import { describe, expect, it } from 'vitest';

import { formatDuration, getCardContainerStyle } from './AgentCardControls';

describe('formatDuration', () => {
  it('formats sub-second durations as ms', () => {
    expect(formatDuration(0)).toBe('0ms');
    expect(formatDuration(999)).toBe('999ms');
  });

  it('formats seconds with one decimal place', () => {
    expect(formatDuration(1000)).toBe('1.0s');
    expect(formatDuration(1500)).toBe('1.5s');
    expect(formatDuration(59_999)).toBe('60.0s');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(60_000)).toBe('1m 0s');
    expect(formatDuration(90_000)).toBe('1m 30s');
    expect(formatDuration(125_000)).toBe('2m 5s');
  });
});

describe('getCardContainerStyle', () => {
  it('returns error left border for error status', () => {
    const style = getCardContainerStyle('error');
    expect(style.borderLeft).toBe('3px solid var(--status-error)');
    expect(style.opacity).toBe(1);
  });

  it('returns transparent left border for non-error statuses', () => {
    expect(getCardContainerStyle('running').borderLeft).toBe('3px solid transparent');
    expect(getCardContainerStyle('idle').borderLeft).toBe('3px solid transparent');
  });

  it('reduces opacity for complete status', () => {
    expect(getCardContainerStyle('complete').opacity).toBe(0.7);
  });

  it('keeps full opacity for running status', () => {
    expect(getCardContainerStyle('running').opacity).toBe(1);
  });
});
