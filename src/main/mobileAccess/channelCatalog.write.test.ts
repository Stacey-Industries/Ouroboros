import { describe, expect, it } from 'vitest';

import { WRITE_CATALOG } from './channelCatalog.write';

describe('WRITE_CATALOG', () => {
  it('contains expected paired-write channels', () => {
    expect(WRITE_CATALOG['agentChat:sendMessage']).toBeDefined();
    expect(WRITE_CATALOG['checkpoint:create']).toBeDefined();
    expect(WRITE_CATALOG['files:saveFile']).toBeDefined();
    expect(WRITE_CATALOG['spec:scaffold']).toBeDefined();
  });

  it('all entries have class = paired-write', () => {
    for (const [channel, entry] of Object.entries(WRITE_CATALOG)) {
      expect(entry.class, `${channel} class`).toBe('paired-write');
    }
  });

  it('all entries have a valid timeoutClass', () => {
    const valid = new Set(['short', 'normal', 'long']);
    for (const [channel, entry] of Object.entries(WRITE_CATALOG)) {
      expect(valid.has(entry.timeoutClass), `${channel} timeoutClass`).toBe(true);
    }
  });

  it('has no duplicate keys', () => {
    const keys = Object.keys(WRITE_CATALOG);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('long-class channels include streaming/scaffold operations', () => {
    expect(WRITE_CATALOG['agentChat:sendMessage']?.timeoutClass).toBe('long');
    expect(WRITE_CATALOG['spec:scaffold']?.timeoutClass).toBe('long');
    expect(WRITE_CATALOG['checkpoint:create']?.timeoutClass).toBe('long');
  });

  it('does not contain desktop-only channels', () => {
    expect(WRITE_CATALOG['pty:spawn']).toBeUndefined();
    expect(WRITE_CATALOG['files:delete']).toBeUndefined();
    expect(WRITE_CATALOG['files:rename']).toBeUndefined();
    expect(WRITE_CATALOG['window:new']).toBeUndefined();
  });
});
