import { describe, expect, it } from 'vitest';

import { ALWAYS_CATALOG } from './channelCatalog.always';

describe('ALWAYS_CATALOG', () => {
  it('contains expected always-class channels', () => {
    expect(ALWAYS_CATALOG['perf:ping']).toBeDefined();
    expect(ALWAYS_CATALOG['app:getVersion']).toBeDefined();
    expect(ALWAYS_CATALOG['config:get']).toBeDefined();
  });

  it('all entries have class = always', () => {
    for (const [channel, entry] of Object.entries(ALWAYS_CATALOG)) {
      expect(entry.class, `${channel} class`).toBe('always');
    }
  });

  it('all entries have short timeoutClass', () => {
    for (const [channel, entry] of Object.entries(ALWAYS_CATALOG)) {
      expect(entry.timeoutClass, `${channel} timeoutClass`).toBe('short');
    }
  });

  it('has no duplicate keys (object literal guarantees this)', () => {
    const keys = Object.keys(ALWAYS_CATALOG);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });
});
