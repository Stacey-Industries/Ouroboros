/**
 * ouroborosMcpSchema.test.ts — coverage for schema-version handshake.
 */

import { describe, expect, it, vi } from 'vitest';

import { checkSchemaVersion, EXPECTED_SCHEMA_VERSION } from './ouroborosMcpSchema';

interface MockDb {
  pragma: ReturnType<typeof vi.fn>;
}

function makeDb(userVersion: number): MockDb {
  return {
    pragma: vi.fn((name: string) => {
      if (name === 'user_version') return userVersion;
      return undefined;
    }),
  };
}

describe('checkSchemaVersion', () => {
  it('returns ok when version matches expected', () => {
    const db = makeDb(EXPECTED_SCHEMA_VERSION);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural mock
    const result = checkSchemaVersion(db as any);
    expect(result.ok).toBe(true);
    expect(result.actualVersion).toBe(EXPECTED_SCHEMA_VERSION);
    expect(result.message).toBeUndefined();
  });

  it('returns ok=false with "not yet indexed" when version is 0', () => {
    const db = makeDb(0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural mock
    const result = checkSchemaVersion(db as any);
    expect(result.ok).toBe(false);
    expect(result.actualVersion).toBe(0);
    expect(result.message).toMatch(/not yet indexed/i);
  });

  it('returns ok=false with "older" message when DB is behind binary', () => {
    if (EXPECTED_SCHEMA_VERSION < 2) return; // can't simulate older without a v2+
    const db = makeDb(EXPECTED_SCHEMA_VERSION - 1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural mock
    const result = checkSchemaVersion(db as any);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/older/i);
  });

  it('returns ok=false with "newer" message when DB is ahead of binary', () => {
    const db = makeDb(EXPECTED_SCHEMA_VERSION + 1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural mock
    const result = checkSchemaVersion(db as any);
    expect(result.ok).toBe(false);
    expect(result.actualVersion).toBe(EXPECTED_SCHEMA_VERSION + 1);
    expect(result.message).toMatch(/newer/i);
  });
});
