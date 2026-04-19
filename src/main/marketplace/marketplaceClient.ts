/**
 * marketplaceClient.ts — public facade for the signed marketplace.
 *
 * Wave 37 Phase D. Composes marketplaceFetch + marketplaceInstall.
 * Split from fetch/install to stay under the 300-line ESLint limit.
 */

import { getConfigValue } from '../config';
import { fetchBundle, fetchManifest, fetchRevokedIds, httpsGet } from './marketplaceFetch';
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
 * Fetch manifest, find entry by id, check revocation list, fetch+verify bundle,
 * then install.  Returns `{ success, error? }`.
 *
 * Revocation is fail-closed by default: if the revocation list cannot be
 * fetched, install is rejected unless the
 * `marketplace.allowInstallOnRevocationFetchFailure` config flag is `true`.
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

  // ── Revocation check (fail-closed) ─────────────────────────────────────────
  const revokedResult = await fetchRevokedIdsWithFailure(REVOKED_BUNDLES_URL);
  if (revokedResult.fetchFailed) {
    const allowOnFailure =
      (getConfigValue('marketplace') as Record<string, unknown> | null)
        ?.allowInstallOnRevocationFetchFailure === true;
    if (!allowOnFailure) {
      return { success: false, error: 'revocation-check-failed' };
    }
  } else if (revokedResult.ids.includes(entryId)) {
    return { success: false, error: 'bundle-revoked' };
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

// ── Internal helpers ──────────────────────────────────────────────────────────

interface RevokedIdsResult {
  ids: string[];
  /** true when the network request itself failed (distinct from an empty list). */
  fetchFailed: boolean;
}

/**
 * Like `fetchRevokedIds` but surfaces fetch failures so the caller can
 * apply fail-closed logic.  Uses `httpsGet` directly to distinguish a
 * successful-but-empty list from a network or parse error.
 */
async function fetchRevokedIdsWithFailure(revokedUrl: string): Promise<RevokedIdsResult> {
  try {
    const body = await httpsGet(revokedUrl);
    const parsed = JSON.parse(body) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      Array.isArray((parsed as Record<string, unknown>).ids)
    ) {
      return { ids: (parsed as { ids: string[] }).ids, fetchFailed: false };
    }
    // Malformed response — treat as fetch failure (fail-closed).
    return { ids: [], fetchFailed: true };
  } catch {
    return { ids: [], fetchFailed: true };
  }
}
