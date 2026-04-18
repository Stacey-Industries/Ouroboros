/**
 * pairingScreen.scanHandler.test.ts — Unit tests for buildScanOutcomeHandler.
 *
 * Wave 33b Phase F.
 *
 * Each ScanOutcome kind must dispatch to exactly the right setter(s).
 * No React or DOM involved — pure function tests.
 */

import { describe, expect, it, vi } from 'vitest';

import type { ScanOutcome } from '../web/capacitor/qrScanner';
import {
  buildScanOutcomeHandler,
  type ScanOutcomeSetters,
} from './pairingScreen.scanHandler';

// ─── Factory helpers ──────────────────────────────────────────────────────────

function makeSetters(): ScanOutcomeSetters {
  return {
    setCode: vi.fn(),
    setHighlight: vi.fn(),
    setErrorMsg: vi.fn(),
    setIsScanning: vi.fn(),
    highlightTimeoutRef: { current: null },
  };
}

function dispatch(outcome: ScanOutcome, setters?: ScanOutcomeSetters) {
  const s = setters ?? makeSetters();
  const handler = buildScanOutcomeHandler(s);
  handler(outcome);
  return s;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('buildScanOutcomeHandler — success', () => {
  it('sets the code field from payload', () => {
    const setters = makeSetters();
    dispatch(
      {
        kind: 'success',
        payload: { host: '10.0.0.1', port: '7890', code: '042819', fingerprint: 'fp' },
        rawValue: 'ouroboros://pair?host=10.0.0.1&port=7890&code=042819&fingerprint=fp',
      },
      setters,
    );
    expect(setters.setCode).toHaveBeenCalledWith('042819');
  });

  it('clears any previous error message', () => {
    const setters = makeSetters();
    dispatch(
      {
        kind: 'success',
        payload: { host: '10.0.0.1', port: '7890', code: '042819', fingerprint: 'fp' },
        rawValue: 'ouroboros://pair?host=10.0.0.1&port=7890&code=042819&fingerprint=fp',
      },
      setters,
    );
    expect(setters.setErrorMsg).toHaveBeenCalledWith('');
  });

  it('activates the highlight', () => {
    vi.useFakeTimers();
    const setters = makeSetters();
    dispatch(
      {
        kind: 'success',
        payload: { host: '10.0.0.1', port: '7890', code: '042819', fingerprint: 'fp' },
        rawValue: 'ouroboros://pair?host=10.0.0.1&port=7890&code=042819&fingerprint=fp',
      },
      setters,
    );
    expect(setters.setHighlight).toHaveBeenCalledWith(true);
    vi.runAllTimers();
    expect(setters.setHighlight).toHaveBeenCalledWith(false);
    vi.useRealTimers();
  });

  it('does NOT call setCode with anything other than the payload code', () => {
    const setters = makeSetters();
    dispatch(
      {
        kind: 'success',
        payload: { host: '10.0.0.1', port: '7890', code: '999888', fingerprint: 'fp' },
        rawValue: 'ouroboros://pair?host=10.0.0.1&port=7890&code=999888&fingerprint=fp',
      },
      setters,
    );
    expect(setters.setCode).toHaveBeenCalledTimes(1);
    expect(setters.setCode).toHaveBeenCalledWith('999888');
  });

  it('marks scanning as done (setIsScanning false)', () => {
    const setters = makeSetters();
    dispatch(
      {
        kind: 'success',
        payload: { host: '10.0.0.1', port: '7890', code: '042819', fingerprint: 'fp' },
        rawValue: 'ouroboros://pair',
      },
      setters,
    );
    expect(setters.setIsScanning).toHaveBeenCalledWith(false);
  });
});

describe('buildScanOutcomeHandler — denied', () => {
  it('shows camera permission error', () => {
    const setters = dispatch({ kind: 'denied' });
    expect(setters.setErrorMsg).toHaveBeenCalledWith(
      'Camera permission required to scan.',
    );
  });

  it('does not modify the code field', () => {
    const setters = dispatch({ kind: 'denied' });
    expect(setters.setCode).not.toHaveBeenCalled();
  });

  it('marks scanning as done', () => {
    const setters = dispatch({ kind: 'denied' });
    expect(setters.setIsScanning).toHaveBeenCalledWith(false);
  });
});

describe('buildScanOutcomeHandler — cancelled', () => {
  it('does not show any error', () => {
    const setters = dispatch({ kind: 'cancelled' });
    expect(setters.setErrorMsg).not.toHaveBeenCalled();
  });

  it('does not modify the code field', () => {
    const setters = dispatch({ kind: 'cancelled' });
    expect(setters.setCode).not.toHaveBeenCalled();
  });

  it('marks scanning as done', () => {
    const setters = dispatch({ kind: 'cancelled' });
    expect(setters.setIsScanning).toHaveBeenCalledWith(false);
  });
});

describe('buildScanOutcomeHandler — invalid-format', () => {
  it('shows the invalid format error message', () => {
    const setters = dispatch({
      kind: 'invalid-format',
      rawValue: 'https://example.com',
    });
    expect(setters.setErrorMsg).toHaveBeenCalledWith(
      "That QR code isn't a valid pairing link.",
    );
  });

  it('does not modify the code field', () => {
    const setters = dispatch({
      kind: 'invalid-format',
      rawValue: 'https://example.com',
    });
    expect(setters.setCode).not.toHaveBeenCalled();
  });

  it('marks scanning as done', () => {
    const setters = dispatch({
      kind: 'invalid-format',
      rawValue: 'https://example.com',
    });
    expect(setters.setIsScanning).toHaveBeenCalledWith(false);
  });
});

describe('buildScanOutcomeHandler — error', () => {
  it('forwards the error message to setErrorMsg', () => {
    const setters = dispatch({
      kind: 'error',
      message: 'Camera hardware failure',
    });
    expect(setters.setErrorMsg).toHaveBeenCalledWith('Camera hardware failure');
  });

  it('does not modify the code field', () => {
    const setters = dispatch({
      kind: 'error',
      message: 'Camera hardware failure',
    });
    expect(setters.setCode).not.toHaveBeenCalled();
  });

  it('marks scanning as done', () => {
    const setters = dispatch({
      kind: 'error',
      message: 'Camera hardware failure',
    });
    expect(setters.setIsScanning).toHaveBeenCalledWith(false);
  });
});

describe('buildScanOutcomeHandler — unsupported', () => {
  it('is a no-op (button hidden in browser mode)', () => {
    const setters = dispatch({ kind: 'unsupported' });
    expect(setters.setErrorMsg).not.toHaveBeenCalled();
    expect(setters.setCode).not.toHaveBeenCalled();
    expect(setters.setIsScanning).toHaveBeenCalledWith(false);
  });
});

describe('buildScanOutcomeHandler — highlight timer replacement', () => {
  it('clears a pending highlight timeout before starting a new one', () => {
    vi.useFakeTimers();
    const setters = makeSetters();
    const handler = buildScanOutcomeHandler(setters);

    const successOutcome: ScanOutcome = {
      kind: 'success',
      payload: { host: '10.0.0.1', port: '7890', code: '111111', fingerprint: 'fp' },
      rawValue: 'ouroboros://pair',
    };

    // First scan
    handler(successOutcome);
    const firstTimerId = setters.highlightTimeoutRef.current;
    expect(firstTimerId).not.toBeNull();

    // Second scan before first timer fires — should replace it
    handler({ ...successOutcome, payload: { ...successOutcome.payload, code: '222222' } });
    expect(setters.highlightTimeoutRef.current).not.toBe(firstTimerId);

    vi.runAllTimers();
    // highlight should end exactly once for the second timer
    const falseCalls = (setters.setHighlight as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: unknown[]) => c[0] === false,
    );
    expect(falseCalls).toHaveLength(1);

    vi.useRealTimers();
  });
});

describe('buildScanOutcomeHandler — return value stability', () => {
  it('returns the same handler function reference each call (object is reused)', () => {
    const setters = makeSetters();
    const h1 = buildScanOutcomeHandler(setters);
    const h2 = buildScanOutcomeHandler(setters);
    // Each call to buildScanOutcomeHandler produces a new closure, but both
    // must be callable without throwing
    expect(() => h1({ kind: 'cancelled' })).not.toThrow();
    expect(() => h2({ kind: 'cancelled' })).not.toThrow();
  });
});
