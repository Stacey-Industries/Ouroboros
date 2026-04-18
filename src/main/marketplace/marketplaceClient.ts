/**
 * marketplaceClient.ts — public facade for the signed marketplace.
 *
 * Wave 37 Phase D. Composes marketplaceFetch + marketplaceInstall.
 * Split from fetch/install to stay under the 300-line ESLint limit.
 */

import { fetchBundle, fetchManifest, fetchRevokedIds } from './marketplaceFetch';
import { installBundle } from './marketplaceInstall';
import { MARKETPLACE_MANIFEST_URL, REVOKED_BUNDLES_URL } from './trustedKeys';
import type { BundleContent, BundleManifestEntry, MarketplaceManifest } from './types';

export type { BundleContent, BundleManifestEntry, MarketplaceManifest };

export interface InstallResult {
  success: boolean;
  error?: string;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch the curated marketplace manifest.
 * Returns `{ bundles }` on success, `{ error }` on failure.
 */
export async function getManifest(): Promise<MarketplaceManifest | { error: string }> {
  return fetchManifest(MARKETPLACE_MANIFEST_URL);
}

/**
 * Fetch and signature-verify a single bundle.
 * Returns `{ error: 'invalid-signature' }` if verification fails.
 */
export async function getBundle(
  entry: BundleManifestEntry,
): Promise<BundleContent | { error: string }> {
  return fetchBundle(entry);
}

/**
 * Fetch manifest, find entry by id, fetch+verify bundle, then install.
 * Returns `{ success, error? }`.
 */
export async function installById(entryId: string): Promise<InstallResult> {
  const manifestResult = await fetchManifest(MARKETPLACE_MANIFEST_URL);
  if ('error' in manifestResult) {
    return { success: false, error: `manifest-fetch-failed: ${manifestResult.error}` };
  }

  const entry = manifestResult.bundles.find((b) => b.id === entryId);
  if (!entry) {
    return { success: false, error: `bundle-not-found: ${entryId}` };
  }

  const bundleResult = await fetchBundle(entry);
  if ('error' in bundleResult) {
    return { success: false, error: bundleResult.error };
  }

  return installBundle(bundleResult);
}

/**
 * Fetch the revoked bundle ID list (best-effort — never throws).
 */
export async function getRevokedIds(): Promise<{ ids: string[] }> {
  return fetchRevokedIds(REVOKED_BUNDLES_URL);
}
