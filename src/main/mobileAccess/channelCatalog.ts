/**
 * channelCatalog.ts — barrel that assembles CHANNEL_CATALOG from sub-modules.
 *
 * Wave 33a Phase C.
 *
 * The catalog is split into four files to stay within the 300-line ESLint
 * limit per file. This barrel merges them into the single exported constant
 * that capabilityGate.ts and the coverage test consume.
 *
 * IMPORTANT: every IPC channel in the codebase MUST have an entry here.
 * The default for unlisted channels is 'desktop-only' (fail-closed).
 * channelCatalogCoverage.test.ts enforces this invariant.
 */

import { ALWAYS_CATALOG } from './channelCatalog.always';
import { DESKTOP_ONLY_CATALOG } from './channelCatalog.desktopOnly';
import { READ_CATALOG } from './channelCatalog.read';
import { WRITE_CATALOG } from './channelCatalog.write';

export type { CatalogEntry, ChannelDescriptor } from './channelCatalog.always';

/** Merged lookup map: channel string → { class, timeoutClass }. */
const CATALOG_MAP: Record<string, import('./channelCatalog.always').CatalogEntry> = {
  ...ALWAYS_CATALOG,
  ...READ_CATALOG,
  ...WRITE_CATALOG,
  ...DESKTOP_ONLY_CATALOG,
};

/** Full catalog as a readonly array, one entry per channel. */
export const CHANNEL_CATALOG: readonly import('./channelCatalog.always').ChannelDescriptor[] =
  Object.entries(CATALOG_MAP).map(([channel, entry]) => ({ channel, ...entry }));

/**
 * Fast O(1) lookup map. Preferred over iterating CHANNEL_CATALOG.
 * @internal — used by capabilityGate.ts and coverage test.
 */
export const CATALOG_LOOKUP: ReadonlyMap<
  string,
  import('./channelCatalog.always').CatalogEntry
> = new Map(Object.entries(CATALOG_MAP));
