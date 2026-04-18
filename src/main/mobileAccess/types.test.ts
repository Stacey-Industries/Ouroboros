/**
 * types.test.ts — Smoke tests for mobileAccess type definitions.
 *
 * These tests verify the exported string-literal union values are correct
 * at runtime (TypeScript type-only errors are caught by tsc --noEmit).
 */

import { describe, expect, it } from 'vitest';

import type {
  Capability,
  PairedDevice,
  PairingTicket,
  QrPayload,
  TimeoutClass,
} from './types';

describe('Capability type values', () => {
  it('accepts all valid capability strings', () => {
    const valid: Capability[] = ['always', 'paired-read', 'paired-write', 'desktop-only'];
    expect(valid).toHaveLength(4);
    expect(valid).toContain('always');
    expect(valid).toContain('paired-read');
    expect(valid).toContain('paired-write');
    expect(valid).toContain('desktop-only');
  });
});

describe('TimeoutClass type values', () => {
  it('accepts all valid timeout class strings', () => {
    const valid: TimeoutClass[] = ['short', 'normal', 'long'];
    expect(valid).toHaveLength(3);
    expect(valid).toContain('short');
    expect(valid).toContain('normal');
    expect(valid).toContain('long');
  });
});

describe('PairedDevice shape', () => {
  it('accepts a well-formed PairedDevice object', () => {
    const device: PairedDevice = {
      id: 'test-uuid-1234',
      label: "Cole's iPhone 14",
      refreshTokenHash: 'abc123base64url',
      fingerprint: 'fp-hash-value',
      capabilities: ['paired-read'],
      issuedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    };
    expect(device.id).toBe('test-uuid-1234');
    expect(device.capabilities).toContain('paired-read');
  });
});

describe('PairingTicket shape', () => {
  it('accepts a well-formed PairingTicket object', () => {
    const now = Date.now();
    const ticket: PairingTicket = {
      code: '042000',
      createdAt: now,
      expiresAt: now + 60_000,
      consumed: false,
    };
    expect(ticket.code).toMatch(/^\d{6}$/);
    expect(ticket.consumed).toBe(false);
    expect(ticket.expiresAt).toBeGreaterThan(ticket.createdAt);
  });
});

describe('QrPayload shape', () => {
  it('accepts a well-formed QrPayload with v=1', () => {
    const payload: QrPayload = {
      v: 1,
      host: '192.168.1.10',
      port: 7890,
      code: '042000',
      fingerprint: 'fp-sha256-value',
    };
    expect(payload.v).toBe(1);
    expect(payload.port).toBe(7890);
  });
});
