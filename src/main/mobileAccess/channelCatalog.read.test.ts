import { describe, expect, it } from 'vitest';

import { READ_CATALOG } from './channelCatalog.read';

describe('READ_CATALOG', () => {
  it('contains expected paired-read channels', () => {
    expect(READ_CATALOG['files:readFile']).toBeDefined();
    expect(READ_CATALOG['git:status']).toBeDefined();
    expect(READ_CATALOG['sessionCrud:list']).toBeDefined();
  });

  it('all entries have class = paired-read', () => {
    for (const [channel, entry] of Object.entries(READ_CATALOG)) {
      expect(entry.class, `${channel} class`).toBe('paired-read');
    }
  });

  it('all entries have a valid timeoutClass', () => {
    const valid = new Set(['short', 'normal', 'long']);
    for (const [channel, entry] of Object.entries(READ_CATALOG)) {
      expect(valid.has(entry.timeoutClass), `${channel} timeoutClass`).toBe(true);
    }
  });

  it('has no duplicate keys', () => {
    const keys = Object.keys(READ_CATALOG);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('does not contain desktop-only channels', () => {
    expect(READ_CATALOG['pty:spawn']).toBeUndefined();
    expect(READ_CATALOG['files:delete']).toBeUndefined();
    expect(READ_CATALOG['files:writeFile']).toBeUndefined();
  });
});
