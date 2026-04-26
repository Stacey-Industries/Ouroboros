/**
 * SettingsPerformancePanelHelpers.test.ts — Unit tests for pure helper functions
 * extracted from SettingsPerformancePanel.
 */

import { describe, expect, it } from 'vitest';

import {
  lastPhaseMs,
  phaseLabel,
  relativeMs,
  secondsAgo,
  totalMs,
} from './SettingsPerformancePanelHelpers';

const SAMPLE_TIMINGS = [
  { phase: 'app-ready' as const,              tsNs: '1000000000', deltaMs: 0 },
  { phase: 'window-ready' as const,           tsNs: '1050000000', deltaMs: 50 },
  { phase: 'ipc-ready' as const,              tsNs: '1080000000', deltaMs: 30 },
  { phase: 'services-ready' as const,         tsNs: '1120000000', deltaMs: 40 },
  { phase: 'renderer-bundle-loaded' as const, tsNs: '1150000000', deltaMs: 30 },
  { phase: 'react-root-created' as const,     tsNs: '1170000000', deltaMs: 20 },
  { phase: 'first-render' as const,           tsNs: '1200000000', deltaMs: 30 },
];

// ── phaseLabel ─────────────────────────────────────────────────────────────

describe('phaseLabel', () => {
  it('returns human-readable label for known phases', () => {
    expect(phaseLabel('app-ready')).toBe('App ready');
    expect(phaseLabel('window-ready')).toBe('Window ready');
    expect(phaseLabel('ipc-ready')).toBe('IPC ready');
    expect(phaseLabel('services-ready')).toBe('Services ready');
    expect(phaseLabel('renderer-bundle-loaded')).toBe('Renderer bundle loaded');
    expect(phaseLabel('react-root-created')).toBe('React root created');
    expect(phaseLabel('first-render')).toBe('First render');
  });
});

// ── relativeMs ─────────────────────────────────────────────────────────────

describe('relativeMs', () => {
  it('returns 0 for the first mark', () => {
    expect(relativeMs(SAMPLE_TIMINGS, 0)).toBe(0);
  });

  it('returns correct ms for subsequent marks', () => {
    expect(relativeMs(SAMPLE_TIMINGS, 1)).toBeCloseTo(50, 1);
    expect(relativeMs(SAMPLE_TIMINGS, 2)).toBeCloseTo(80, 1);
  });

  it('returns 0 for empty timings', () => {
    expect(relativeMs([], 0)).toBe(0);
  });

  it('returns 0 when index is out of range', () => {
    expect(relativeMs(SAMPLE_TIMINGS, 99)).toBe(0);
  });
});

// ── totalMs ────────────────────────────────────────────────────────────────

describe('totalMs', () => {
  it('returns correct total from first to last mark', () => {
    expect(totalMs(SAMPLE_TIMINGS)).toBeCloseTo(200, 1);
  });

  it('returns 0 for empty array', () => {
    expect(totalMs([])).toBe(0);
  });

  it('returns 0 for a single mark', () => {
    expect(totalMs([SAMPLE_TIMINGS[0]])).toBe(0);
  });
});

// ── secondsAgo ─────────────────────────────────────────────────────────────

describe('secondsAgo', () => {
  it('returns 0 for the current time', () => {
    expect(secondsAgo(new Date())).toBe(0);
  });

  it('returns ~5 for 5 seconds ago', () => {
    const d = new Date(Date.now() - 5000);
    expect(secondsAgo(d)).toBe(5);
  });

  it('returns ~60 for 1 minute ago', () => {
    const d = new Date(Date.now() - 60000);
    expect(secondsAgo(d)).toBe(60);
  });
});

// ── lastPhaseMs ────────────────────────────────────────────────────────────

describe('lastPhaseMs', () => {
  it('returns the deltaMs of the last timing entry', () => {
    const record = { ts: '2024-01-01T00:00:00Z', timings: SAMPLE_TIMINGS };
    expect(lastPhaseMs(record)).toBe(30);
  });

  it('returns 0 for a record with no timings', () => {
    const record = { ts: '2024-01-01T00:00:00Z', timings: [] };
    expect(lastPhaseMs(record)).toBe(0);
  });

  it('returns the only entry deltaMs for a single-entry record', () => {
    const record = { ts: '2024-01-01T00:00:00Z', timings: [SAMPLE_TIMINGS[0]] };
    expect(lastPhaseMs(record)).toBe(0);
  });
});
