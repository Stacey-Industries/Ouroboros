import { describe, expect, it } from 'vitest';

import { DESKTOP_ONLY_CATALOG } from './channelCatalog.desktopOnly';

describe('DESKTOP_ONLY_CATALOG', () => {
  it('contains the canonical desktop-only channels', () => {
    expect(DESKTOP_ONLY_CATALOG['pty:spawn']).toBeDefined();
    expect(DESKTOP_ONLY_CATALOG['files:delete']).toBeDefined();
    expect(DESKTOP_ONLY_CATALOG['files:rename']).toBeDefined();
    expect(DESKTOP_ONLY_CATALOG['window:new']).toBeDefined();
    expect(DESKTOP_ONLY_CATALOG['updater:install']).toBeDefined();
  });

  it('all entries have class = desktop-only', () => {
    for (const [channel, entry] of Object.entries(DESKTOP_ONLY_CATALOG)) {
      expect(entry.class, `${channel} class`).toBe('desktop-only');
    }
  });

  it('all entries have a valid timeoutClass', () => {
    const valid = new Set(['short', 'normal', 'long']);
    for (const [channel, entry] of Object.entries(DESKTOP_ONLY_CATALOG)) {
      expect(valid.has(entry.timeoutClass), `${channel} timeoutClass`).toBe(true);
    }
  });

  it('has no duplicate keys', () => {
    const keys = Object.keys(DESKTOP_ONLY_CATALOG);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('does not contain paired-read or paired-write channels', () => {
    expect(DESKTOP_ONLY_CATALOG['files:readFile']).toBeUndefined();
    expect(DESKTOP_ONLY_CATALOG['git:status']).toBeUndefined();
    expect(DESKTOP_ONLY_CATALOG['agentChat:sendMessage']).toBeUndefined();
  });
});
