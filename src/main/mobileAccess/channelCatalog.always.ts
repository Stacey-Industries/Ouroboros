/**
 * channelCatalog.always.ts — Channels that are always permitted for any client.
 *
 * Wave 33a Phase C — capability catalog (always class).
 */

import type { Capability, TimeoutClass } from './types';

export interface ChannelDescriptor {
  channel: string;
  class: Capability;
  timeoutClass: TimeoutClass;
}

export type CatalogEntry = Omit<ChannelDescriptor, 'channel'>;

/**
 * Channels that require no capability — health pings, non-sensitive metadata.
 * Permitted even for unauthenticated or legacy connections.
 */
export const ALWAYS_CATALOG: Record<string, CatalogEntry> = {
  // app:getSystemInfo is implemented entirely in the preload (preload.ts:162)
  // with no ipcMain.handle counterpart — it is a phantom catalog entry.
  // Removed per Wave 41 Phase A.
  'app:getVersion':                      { class: 'always', timeoutClass: 'short' },
  'app:getPlatform':                     { class: 'always', timeoutClass: 'short' },
  'config:get':                          { class: 'always', timeoutClass: 'short' },
  'config:getAll':                       { class: 'always', timeoutClass: 'short' },
  'mobileAccess:getTimeoutStats':        { class: 'always', timeoutClass: 'short' },
  /** Wave 34 Phase F — devices must register push tokens before or after pairing.
   *  Classified 'always'/'short': token registration is trivially small and devices
   *  need to re-register on token refresh without a separate auth round-trip. */
  'mobileAccess:registerPushToken':      { class: 'always', timeoutClass: 'short' },
  'perf:ping':                           { class: 'always', timeoutClass: 'short' },
  'providers:list':                      { class: 'always', timeoutClass: 'short' },
  'providers:getSlots':                  { class: 'always', timeoutClass: 'short' },
  'theme:get':                           { class: 'always', timeoutClass: 'short' },
};
