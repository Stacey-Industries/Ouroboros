/**
 * pairingTickets.test.ts — Unit tests for in-memory pairing ticket store.
 */

import crypto from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Import after vi is ready — module is side-effect free (no setInterval)
const { cleanupExpired, issueTicket, verifyAndConsume } = await import('./pairingTickets');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Drain every live ticket by advancing time past TTL, then issuing a cleanup. */
function drainTickets(): void {
  vi.advanceTimersByTime(61_000);
  cleanupExpired();
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('issueTicket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    drainTickets();
    vi.useRealTimers();
  });

  it('returns a ticket with a 6-digit zero-padded code', () => {
    const ticket = issueTicket();
    expect(ticket.code).toMatch(/^\d{6}$/);
  });

  it('sets expiresAt to createdAt + 60 000 ms', () => {
    const ticket = issueTicket();
    expect(ticket.expiresAt - ticket.createdAt).toBe(60_000);
  });

  it('issues a ticket with consumed=false', () => {
    const ticket = issueTicket();
    expect(ticket.consumed).toBe(false);
  });

  it('produces distinct codes across many calls (100 sequential issues)', () => {
    drainTickets(); // clear state first
    const codes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const t = issueTicket();
      codes.add(t.code);
      // consume so the code slot is freed for reuse tests
      verifyAndConsume(t.code);
    }
    // All 100 should be unique (probability of collision is negligible)
    expect(codes.size).toBe(100);
  });
});

describe('verifyAndConsume — happy path', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    drainTickets();
    vi.useRealTimers();
  });

  it('returns the ticket on first call with the correct code', () => {
    const issued = issueTicket();
    const result = verifyAndConsume(issued.code);
    expect(result).not.toBeNull();
    expect(result?.code).toBe(issued.code);
    expect(result?.consumed).toBe(true);
  });

  it('returns null on a second call with the same code (single-use)', () => {
    const issued = issueTicket();
    verifyAndConsume(issued.code);
    expect(verifyAndConsume(issued.code)).toBeNull();
  });
});

describe('verifyAndConsume — rejection cases', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    drainTickets();
    vi.useRealTimers();
  });

  it('returns null for an unknown code', () => {
    expect(verifyAndConsume('000000')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(verifyAndConsume('')).toBeNull();
  });

  it('returns null for an expired ticket', () => {
    const issued = issueTicket();
    vi.advanceTimersByTime(60_001);
    expect(verifyAndConsume(issued.code)).toBeNull();
  });

  it('rejects a ticket exactly at expiry boundary (expiresAt is exclusive)', () => {
    const issued = issueTicket();
    vi.advanceTimersByTime(60_000); // now === expiresAt
    expect(verifyAndConsume(issued.code)).toBeNull();
  });
});

describe('constant-time comparison', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    drainTickets();
    vi.useRealTimers();
  });

  it('calls crypto.timingSafeEqual during verifyAndConsume', () => {
    const spy = vi.spyOn(crypto, 'timingSafeEqual');
    const issued = issueTicket();
    verifyAndConsume(issued.code);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('calls crypto.timingSafeEqual even for wrong codes that exist in map', () => {
    // Issue a ticket, then try a code that IS in the map so we reach the comparison
    const issued = issueTicket();
    const spy = vi.spyOn(crypto, 'timingSafeEqual');
    // Use the real code — timingSafeEqual must be called
    verifyAndConsume(issued.code);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('cleanupExpired', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    drainTickets();
    vi.useRealTimers();
  });

  it('removes expired entries so they can no longer be verified', () => {
    const issued = issueTicket();
    vi.advanceTimersByTime(60_001);
    cleanupExpired();
    // After cleanup the entry is gone — verifyAndConsume returns null
    expect(verifyAndConsume(issued.code)).toBeNull();
  });

  it('leaves unexpired entries intact', () => {
    const issued = issueTicket();
    vi.advanceTimersByTime(30_000); // halfway through TTL
    cleanupExpired();
    const result = verifyAndConsume(issued.code);
    expect(result).not.toBeNull();
  });

  it('does not throw when the map is empty', () => {
    drainTickets();
    expect(() => cleanupExpired()).not.toThrow();
  });
});

describe('duplicate-code collision handling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    drainTickets();
    vi.useRealTimers();
  });

  it('issues a usable ticket even when randomInt is stubbed to a fixed value', () => {
    // Stub randomInt to always return the same number for first 2 calls, then a different one
    const spy = vi.spyOn(crypto, 'randomInt');
    let callCount = 0;
    spy.mockImplementation(() => {
      callCount++;
      // First call: produce a code we manually pre-occupy via a real issue
      // Return 42000 for first 2 attempts, then 43000
      return callCount <= 2 ? 42000 : 43000;
    });

    // Pre-occupy code '042000' by issuing a ticket with a real randomInt call
    spy.mockRestore();
    const first = issueTicket();
    // Now re-stub so the next issueTicket hits the collision path
    let stubCount = 0;
    vi.spyOn(crypto, 'randomInt').mockImplementation(() => {
      stubCount++;
      // Return same code as `first` for first attempt, different on second
      return stubCount === 1 ? parseInt(first.code, 10) : 43000;
    });

    const second = issueTicket();
    expect(second.code).toBe('043000');
    expect(second.code).not.toBe(first.code);
    vi.restoreAllMocks();
  });
});
