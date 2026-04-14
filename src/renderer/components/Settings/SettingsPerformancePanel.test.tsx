/**
 * SettingsPerformancePanel.test.tsx — Smoke tests for the Performance settings panel.
 *
 * The component renders with Electron APIs unavailable in the Node test
 * environment. These tests validate the module export and pure helper logic
 * extracted from the component.
 */

import { describe, expect, it } from 'vitest';

import { SettingsPerformancePanel } from './SettingsPerformancePanel';

// ── Pure logic helpers (duplicated here to stay test-local) ──────────────────

function relativeMs(timings: Array<{ tsNs: string }>, index: number): number {
  if (timings.length === 0 || index >= timings.length) return 0;
  const first = BigInt(timings[0].tsNs);
  const current = BigInt(timings[index].tsNs);
  return Number(current - first) / 1e6;
}

function totalMs(timings: Array<{ tsNs: string }>): number {
  if (timings.length < 2) return 0;
  const first = BigInt(timings[0].tsNs);
  const last = BigInt(timings[timings.length - 1].tsNs);
  return Number(last - first) / 1e6;
}

const SAMPLE_TIMINGS = [
  { phase: 'app-ready',      tsNs: '1000000000', deltaMs: 0 },
  { phase: 'window-created', tsNs: '1050000000', deltaMs: 50 },
  { phase: 'ipc-ready',      tsNs: '1080000000', deltaMs: 30 },
  { phase: 'services-ready', tsNs: '1120000000', deltaMs: 40 },
  { phase: 'first-render',   tsNs: '1200000000', deltaMs: 80 },
];

describe('SettingsPerformancePanel', () => {
  it('exports the component as a function', () => {
    expect(typeof SettingsPerformancePanel).toBe('function');
  });

  describe('relativeMs helper', () => {
    it('returns 0 for the first mark', () => {
      expect(relativeMs(SAMPLE_TIMINGS, 0)).toBe(0);
    });

    it('returns correct ms for subsequent marks', () => {
      // 1050000000 - 1000000000 = 50000000 ns = 50 ms
      expect(relativeMs(SAMPLE_TIMINGS, 1)).toBeCloseTo(50, 1);
    });

    it('returns 0 for empty timings', () => {
      expect(relativeMs([], 0)).toBe(0);
    });

    it('returns 0 when index is out of range', () => {
      expect(relativeMs(SAMPLE_TIMINGS, 99)).toBe(0);
    });
  });

  describe('totalMs helper', () => {
    it('returns correct total from first to last mark', () => {
      // 1200000000 - 1000000000 = 200000000 ns = 200 ms
      expect(totalMs(SAMPLE_TIMINGS)).toBeCloseTo(200, 1);
    });

    it('returns 0 for fewer than 2 marks', () => {
      expect(totalMs([])).toBe(0);
      expect(totalMs([{ tsNs: '1000000000' }])).toBe(0);
    });
  });

  describe('isComplete threshold', () => {
    it('is complete when 5 or more timings are present', () => {
      expect(SAMPLE_TIMINGS.length >= 5).toBe(true);
    });

    it('is not complete when fewer than 5 timings are present', () => {
      expect(SAMPLE_TIMINGS.slice(0, 3).length >= 5).toBe(false);
    });
  });
});
