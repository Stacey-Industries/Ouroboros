/**
 * shadowTap.test.ts — Smoke tests for the shadowTap singleton holder.
 *
 * Coverage:
 * - getShadowTap returns null before setShadowTap is called
 * - setShadowTap installs the instance; getShadowTap returns the same object
 * - clearShadowTap resets to null
 */

import { afterEach, describe, expect, it } from 'vitest';

import { clearShadowTap, getShadowTap, setShadowTap } from './shadowTap';

afterEach(() => {
  clearShadowTap();
});

describe('shadowTap singleton', () => {
  it('returns null before setShadowTap is called', () => {
    expect(getShadowTap()).toBeNull();
  });

  it('returns the installed instance after setShadowTap', () => {
    const fake = { onStreamJsonEvent: () => undefined } as never;
    setShadowTap(fake);
    expect(getShadowTap()).toBe(fake);
  });

  it('clearShadowTap resets to null', () => {
    const fake = { onStreamJsonEvent: () => undefined } as never;
    setShadowTap(fake);
    clearShadowTap();
    expect(getShadowTap()).toBeNull();
  });

  it('getShadowTap returns the same reference on repeated calls', () => {
    const fake = { onStreamJsonEvent: () => undefined } as never;
    setShadowTap(fake);
    expect(getShadowTap()).toBe(getShadowTap());
  });
});
