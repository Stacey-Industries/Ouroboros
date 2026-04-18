/**
 * marketplaceFetch.ts — HTTPS fetch helpers for the signed marketplace.
 *
 * Wave 37 Phase D. Uses Node's built-in `https` module — no new deps.
 */

import https from 'node:https';

import { verifyBundleSignature } from './signatureVerify';
import type { BundleContent, BundleManifestEntry, MarketplaceManifest } from './types';

// ── Low-level fetch ───────────────────────────────────────────────────────────

/** Fetch a URL over HTTPS, returning the full response body as a string. */
export function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(10_000, () => {
      req.destroy(new Error('marketplace fetch timed out'));
    });
  });
}

// ── Manifest ──────────────────────────────────────────────────────────────────

/**
 * Fetch and parse the marketplace manifest.
 * Returns `{ bundles }` on success, `{ error }` on any failure.
 */
export async function fetchManifest(
  manifestUrl: string,
): Promise<MarketplaceManifest | { error: string }> {
  try {
    const body = await httpsGet(manifestUrl);
    const parsed = JSON.parse(body) as unknown;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !Array.isArray((parsed as Record<string, unknown>).bundles)
    ) {
      return { error: 'invalid-manifest-shape' };
    }
    return parsed as MarketplaceManifest;
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Bundle ────────────────────────────────────────────────────────────────────

/**
 * Fetch a single bundle, verify its Ed25519 signature, and return the parsed
 * content.  Returns `{ error }` if the fetch fails or the signature is invalid.
 */
export async function fetchBundle(
  entry: BundleManifestEntry,
): Promise<BundleContent | { error: string }> {
  try {
    const body = await httpsGet(entry.downloadUrl);
    if (!verifyBundleSignature(body, entry.signature)) {
      return { error: 'invalid-signature' };
    }
    const parsed = JSON.parse(body) as unknown;
    if (typeof parsed !== 'object' || parsed === null) {
      return { error: 'invalid-bundle-shape' };
    }
    return parsed as BundleContent;
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Revocation list ───────────────────────────────────────────────────────────

/**
 * Fetch the revoked bundle ID list.  Best-effort — returns `{ ids: [] }` on
 * any failure so a network outage never hard-blocks the install flow.
 */
export async function fetchRevokedIds(revokedUrl: string): Promise<{ ids: string[] }> {
  try {
    const body = await httpsGet(revokedUrl);
    const parsed = JSON.parse(body) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      Array.isArray((parsed as Record<string, unknown>).ids)
    ) {
      return { ids: (parsed as { ids: string[] }).ids };
    }
    return { ids: [] };
  } catch {
    return { ids: [] };
  }
}
