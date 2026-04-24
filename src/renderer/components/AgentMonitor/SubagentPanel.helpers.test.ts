import { describe, expect, it } from 'vitest';

import { formatCost, formatDuration, formatTime } from './SubagentPanel.helpers';

describe('formatCost', () => {
  it('returns <$0.001 for tiny amounts', () => {
    expect(formatCost(0)).toBe('<$0.001');
    expect(formatCost(0.0009)).toBe('<$0.001');
  });

  it('formats normal cost with 4 decimal places', () => {
    expect(formatCost(0.001)).toBe('$0.0010');
    expect(formatCost(1.5)).toBe('$1.5000');
  });
});

describe('formatTime', () => {
  it('returns a time string with hours, minutes, seconds', () => {
    const ts = new Date('2024-01-01T12:34:56').getTime();
    const result = formatTime(ts);
    expect(result).toMatch(/\d{2}:\d{2}:\d{2}/);
  });
});

describe('formatDuration', () => {
  it('formats sub-second as ms', () => {
    expect(formatDuration(1000, 1500)).toBe('500ms');
  });

  it('formats seconds range', () => {
    expect(formatDuration(0, 5000)).toBe('5.0s');
  });

  it('formats minutes range', () => {
    expect(formatDuration(0, 90_000)).toBe('1m 30s');
  });

  it('uses Date.now() when endedAt is undefined', () => {
    const start = Date.now() - 2000;
    const result = formatDuration(start, undefined);
    expect(result).toMatch(/^\d+(\.\d)?s$|^\d+ms$/);
  });
});
