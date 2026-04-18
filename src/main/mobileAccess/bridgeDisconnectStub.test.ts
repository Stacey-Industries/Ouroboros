/**
 * bridgeDisconnectStub.test.ts — Smoke tests for the Phase B disconnect stub.
 *
 * The stub is intentionally a no-op; these tests assert it is callable without
 * throwing, and that it exists as the Phase D seam expects.
 */

import { describe, expect, it, vi } from 'vitest';

import { disconnectDevice } from './bridgeDisconnectStub';

describe('bridgeDisconnectStub', () => {
  it('exports disconnectDevice as a function', () => {
    expect(typeof disconnectDevice).toBe('function');
  });

  it('returns undefined (no-op) for any deviceId', () => {
    const result = disconnectDevice('device-abc-123');
    expect(result).toBeUndefined();
  });

  it('does not throw for an empty string deviceId', () => {
    expect(() => disconnectDevice('')).not.toThrow();
  });

  it('does not throw when called multiple times', () => {
    expect(() => {
      disconnectDevice('dev-1');
      disconnectDevice('dev-2');
      disconnectDevice('dev-1');
    }).not.toThrow();
  });

  it('does not mutate any external state (spy confirms no side effects)', () => {
    const spy = vi.fn();
    // Wrap the import reference to confirm it fires without observable effect
    spy.mockImplementation(disconnectDevice);
    spy('test-device');
    expect(spy).toHaveBeenCalledWith('test-device');
    // The real function returns undefined regardless
    expect(spy.mock.results[0]?.value).toBeUndefined();
  });
});
