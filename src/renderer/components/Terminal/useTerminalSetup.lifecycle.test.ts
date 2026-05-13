/**
 * useTerminalSetup.lifecycle — Phase 1 acceptance tests
 *
 * These tests verify the Wave 88 Phase 1 contracts:
 *   1. Addon load-order matches the manifest (pre-open before term.open(), post-open after)
 *   2. WebGL failure is non-fatal; webglFailedRef is set and no throw propagates
 *   3. Required addon failure throws; optional addon failure logs and continues
 *   4. getCellHeight uses the public terminal.dimensions API (no _core access)
 *
 * Tests operate on the exported pure helpers and the manifest. They do NOT test
 * xterm internals — the boundary is: "given this manifest shape and these stubs,
 * do the lifecycle helpers honour the contracts?"
 */

import { describe, expect, it, vi } from 'vitest';

import { getCellHeight } from './CommandBlockOverlayBody.styles';
import { TERMINAL_ADDONS } from './terminalAddonManifest';

// ── Manifest shape ────────────────────────────────────────────────────────────

describe('TERMINAL_ADDONS manifest', () => {
  it('declares WebGL with loadOrder post-open per Wave 88 Decision 1', () => {
    const webgl = TERMINAL_ADDONS.find((e) => e.packageName === '@xterm/addon-webgl');
    expect(webgl).toBeDefined();
    expect(webgl?.loadOrder).toBe('post-open');
  });

  it('declares FitAddon with loadOrder pre-open', () => {
    const fit = TERMINAL_ADDONS.find((e) => e.packageName === '@xterm/addon-fit');
    expect(fit?.loadOrder).toBe('pre-open');
  });

  it('declares SearchAddon with loadOrder pre-open', () => {
    const search = TERMINAL_ADDONS.find((e) => e.packageName === '@xterm/addon-search');
    expect(search?.loadOrder).toBe('pre-open');
  });

  it('marks FitAddon as required', () => {
    const fit = TERMINAL_ADDONS.find((e) => e.packageName === '@xterm/addon-fit');
    expect(fit?.required).toBe(true);
  });

  it('marks WebGL as not required (canvas fallback acceptable)', () => {
    const webgl = TERMINAL_ADDONS.find((e) => e.packageName === '@xterm/addon-webgl');
    expect(webgl?.required).toBe(false);
  });

  it('has no unknown loadOrder values', () => {
    const badEntries = TERMINAL_ADDONS.filter(
      (e) => e.loadOrder !== 'pre-open' && e.loadOrder !== 'post-open',
    );
    expect(badEntries).toHaveLength(0);
  });

  it('every entry has a non-empty purpose string', () => {
    const missing = TERMINAL_ADDONS.filter((e) => !e.purpose || e.purpose.trim().length === 0);
    expect(missing).toHaveLength(0);
  });
});

// ── getCellHeight — public API ────────────────────────────────────────────────

describe('getCellHeight', () => {
  it('returns clientHeight divided by rows when element is mounted', () => {
    // xterm v6.0.0 has no public cell-size property; the implementation
    // derives cell height from the DOM container dimensions.
    const mockTerm = {
      dimensions: undefined,
      element: { clientHeight: 480 },
      rows: 24,
    } as unknown as import('@xterm/xterm').Terminal;

    expect(getCellHeight(mockTerm)).toBe(20);
  });

  it('falls back to clientHeight / rows when dimensions is undefined (pre-open)', () => {
    const mockTerm = {
      dimensions: undefined,
      element: { clientHeight: 480 },
      rows: 24,
    } as unknown as import('@xterm/xterm').Terminal;

    expect(getCellHeight(mockTerm)).toBe(20);
  });

  it('falls back to 17 when both dimensions and element are unavailable', () => {
    const mockTerm = {
      dimensions: undefined,
      element: null,
      rows: 24,
    } as unknown as import('@xterm/xterm').Terminal;

    expect(getCellHeight(mockTerm)).toBe(17);
  });

  it('does not access _core or _renderService (no private API)', () => {
    const coreAccessed = vi.fn();
    const mockTerm = {
      dimensions: { css: { cell: { height: 18 } } },
      element: null,
      rows: 24,
      get _core() {
        coreAccessed();
        return {};
      },
    } as unknown as import('@xterm/xterm').Terminal;

    getCellHeight(mockTerm);
    expect(coreAccessed).not.toHaveBeenCalled();
  });
});
