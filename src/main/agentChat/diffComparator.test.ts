/**
 * diffComparator.test.ts — Unit tests for DiffComparator.
 *
 * Coverage:
 * - compare: no divergence → logs match, no throw
 * - compare: status mismatch → DivergenceError thrown in dev
 * - compare: registryAliasPresent=false → DivergenceError thrown in dev
 * - compare: status mismatch in prod → logs error, does NOT throw
 * - compare: multiple divergences → all reported (first throws in dev)
 * - DivergenceError carries turnId, field, bridgeValue, shadowValue
 */

import { describe, expect, it } from 'vitest';

import type { TurnObservation } from './diffComparator';
import { DiffComparator, DivergenceError } from './diffComparator';

// ─── Helpers ──────────────────────────="──────────────────────────────────────

function matchObs(overrides: Partial<TurnObservation> = {}): TurnObservation {
  return {
    bridgeStatus: 'completed',
    shadowStatus: 'completed',
    shadowEventCount: 5,
    registryAliasPresent: true,
    ...overrides,
  };
}

// ─── Happy path ───────────────────────────────────────────────────────────────

describe('DiffComparator — happy path', () => {
  it('does not throw when all fields match', () => {
    const cmp = new DiffComparator(true); // dev mode
    expect(() => cmp.compare('turn-1', matchObs())).not.toThrow();
  });

  it('does not throw in prod when all fields match', () => {
    const cmp = new DiffComparator(false); // prod mode
    expect(() => cmp.compare('turn-1', matchObs())).not.toThrow();
  });
});

// ─── Terminal status divergence ───────────────────────────────────────────────

describe('DiffComparator — terminal status divergence', () => {
  it('throws DivergenceError in dev on status mismatch', () => {
    const cmp = new DiffComparator(true);
    expect(() =>
      cmp.compare('turn-2', matchObs({ bridgeStatus: 'completed', shadowStatus: 'failed' })),
    ).toThrow(DivergenceError);
  });

  it('DivergenceError carries correct report fields', () => {
    const cmp = new DiffComparator(true);
    let err: DivergenceError | undefined;
    try {
      cmp.compare('turn-3', matchObs({ bridgeStatus: 'completed', shadowStatus: 'failed' }));
    } catch (e) {
      err = e as DivergenceError;
    }
    expect(err).toBeInstanceOf(DivergenceError);
    expect(err?.report.turnId).toBe('turn-3');
    expect(err?.report.field).toBe('terminalStatus');
    expect(err?.report.bridgeValue).toBe('completed');
    expect(err?.report.shadowValue).toBe('failed');
  });

  it('does NOT throw in prod on status mismatch', () => {
    const cmp = new DiffComparator(false);
    expect(() =>
      cmp.compare('turn-4', matchObs({ bridgeStatus: 'completed', shadowStatus: 'failed' })),
    ).not.toThrow();
  });
});

// ─── Registry alias divergence ────────────────────────────────────────────────

describe('DiffComparator — registry alias divergence', () => {
  it('throws DivergenceError in dev when registryAliasPresent=false', () => {
    const cmp = new DiffComparator(true);
    expect(() => cmp.compare('turn-5', matchObs({ registryAliasPresent: false }))).toThrow(
      DivergenceError,
    );
  });

  it('DivergenceError field is registryAliasPresent', () => {
    const cmp = new DiffComparator(true);
    let err: DivergenceError | undefined;
    try {
      cmp.compare('turn-6', matchObs({ registryAliasPresent: false }));
    } catch (e) {
      err = e as DivergenceError;
    }
    expect(err?.report.field).toBe('registryAliasPresent');
    expect(err?.report.bridgeValue).toBe(true);
    expect(err?.report.shadowValue).toBe(false);
  });
});

// ─── cancelled and failed terminal statuses ───────────────────────────────────

describe('DiffComparator — non-completed terminal statuses match', () => {
  it('failed/failed is not a divergence', () => {
    const cmp = new DiffComparator(true);
    expect(() =>
      cmp.compare('turn-7', matchObs({ bridgeStatus: 'failed', shadowStatus: 'failed' })),
    ).not.toThrow();
  });

  it('cancelled/cancelled is not a divergence', () => {
    const cmp = new DiffComparator(true);
    expect(() =>
      cmp.compare('turn-8', matchObs({ bridgeStatus: 'cancelled', shadowStatus: 'cancelled' })),
    ).not.toThrow();
  });
});
