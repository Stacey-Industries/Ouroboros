import { describe, expect, it } from 'vitest';

import { CATALOG_LOOKUP, CHANNEL_CATALOG } from './channelCatalog';
import { ALWAYS_CATALOG } from './channelCatalog.always';
import { DESKTOP_ONLY_CATALOG } from './channelCatalog.desktopOnly';
import { READ_CATALOG } from './channelCatalog.read';
import { WRITE_CATALOG } from './channelCatalog.write';

describe('CHANNEL_CATALOG barrel', () => {
  it('exports a non-empty readonly array', () => {
    expect(CHANNEL_CATALOG.length).toBeGreaterThan(0);
  });

  it('every entry has channel, class, and timeoutClass', () => {
    const validClasses = new Set(['always', 'paired-read', 'paired-write', 'desktop-only']);
    const validTimeouts = new Set(['short', 'normal', 'long']);
    for (const entry of CHANNEL_CATALOG) {
      expect(typeof entry.channel).toBe('string');
      expect(validClasses.has(entry.class), `${entry.channel} class`).toBe(true);
      expect(validTimeouts.has(entry.timeoutClass), `${entry.channel} timeoutClass`).toBe(true);
    }
  });

  it('no duplicate channels across sub-catalogs', () => {
    const allKeys = [
      ...Object.keys(ALWAYS_CATALOG),
      ...Object.keys(READ_CATALOG),
      ...Object.keys(WRITE_CATALOG),
      ...Object.keys(DESKTOP_ONLY_CATALOG),
    ];
    const unique = new Set(allKeys);
    expect(unique.size).toBe(allKeys.length);
  });

  it('CATALOG_LOOKUP covers every entry in CHANNEL_CATALOG', () => {
    for (const entry of CHANNEL_CATALOG) {
      expect(CATALOG_LOOKUP.has(entry.channel), entry.channel).toBe(true);
    }
  });

  it('canonical channels resolve to expected classes', () => {
    expect(CATALOG_LOOKUP.get('perf:ping')?.class).toBe('always');
    expect(CATALOG_LOOKUP.get('files:readFile')?.class).toBe('paired-read');
    expect(CATALOG_LOOKUP.get('agentChat:sendMessage')?.class).toBe('paired-write');
    expect(CATALOG_LOOKUP.get('pty:spawn')?.class).toBe('desktop-only');
    expect(CATALOG_LOOKUP.get('files:delete')?.class).toBe('desktop-only');
  });

  it('CATALOG_LOOKUP size equals CHANNEL_CATALOG length', () => {
    expect(CATALOG_LOOKUP.size).toBe(CHANNEL_CATALOG.length);
  });
});
