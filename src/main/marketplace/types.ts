/**
 * types.ts — shared types for the signed marketplace.
 *
 * Wave 37 Phase D — marketplace bundle signing + install.
 */

export type BundleKind = 'theme' | 'prompt' | 'rules-and-skills';

export interface BundleManifestEntry {
  /** Stable unique identifier. */
  id: string;
  title: string;
  description: string;
  author: string;
  kind: BundleKind;
  /** semver string, e.g. "1.0.0". */
  version: string;
  /** base64 Ed25519 signature of the bundle content JSON (as a UTF-8 string). */
  signature: string;
  /** HTTPS URL to the bundle content JSON file. */
  downloadUrl: string;
}

export interface BundleContent {
  id: string;
  kind: BundleKind;
  /** Shape is kind-specific — validated by the install path, not here. */
  payload: unknown;
}

export interface MarketplaceManifest {
  bundles: BundleManifestEntry[];
}
