/**
 * electron-marketplace.d.ts — Wave 37 Phase D marketplace IPC types.
 *
 * Channels:
 *   marketplace:listBundles  — paired-read,  short
 *   marketplace:install      — paired-write, normal
 *   marketplace:revokedIds   — paired-read,  short
 */

import type { IpcResult } from './electron-foundation';

export type BundleKind = 'theme' | 'prompt' | 'rules-and-skills';

export interface BundleManifestEntry {
  id: string;
  title: string;
  description: string;
  author: string;
  kind: BundleKind;
  version: string;
  signature: string;
  downloadUrl: string;
}

export interface ListBundlesResult extends IpcResult {
  bundles?: BundleManifestEntry[];
}

export interface InstallBundleResult extends IpcResult {
  /** Present only on failure. */
  error?: string;
}

export interface RevokedIdsResult {
  ids: string[];
}

export interface MarketplaceAPI {
  /** Fetch the curated marketplace manifest. */
  listBundles: () => Promise<ListBundlesResult>;
  /** Fetch, verify, and install a bundle by its stable id. */
  install: (args: { entryId: string }) => Promise<InstallBundleResult>;
  /** Fetch the revoked bundle id list (best-effort). */
  revokedIds: () => Promise<RevokedIdsResult>;
}
