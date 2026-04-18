/**
 * types.test.ts — structural smoke tests for marketplace types.
 *
 * These tests verify that the type shapes are sane at runtime by constructing
 * valid objects and asserting on their shape. TypeScript compilation is the
 * primary type-safety gate; these tests guard against accidental runtime shape
 * changes if the module ever acquires runtime validation.
 */

import { describe, expect, it } from 'vitest';

import type { BundleContent, BundleManifestEntry, MarketplaceManifest } from './types';

describe('marketplace types', () => {
  it('BundleManifestEntry accepts all three bundle kinds', () => {
    const kinds = ['theme', 'prompt', 'rules-and-skills'] as const;
    for (const kind of kinds) {
      const entry: BundleManifestEntry = {
        id: `test-${kind}`,
        title: 'Test',
        description: 'A test bundle',
        author: 'test-author',
        kind,
        version: '1.0.0',
        signature: 'base64sig==',
        downloadUrl: 'https://example.com/bundle.json',
      };
      expect(entry.kind).toBe(kind);
    }
  });

  it('BundleContent wraps a payload of any shape', () => {
    const content: BundleContent = {
      id: 'test-bundle',
      kind: 'theme',
      payload: { tokens: { '--surface-base': '#000' } },
    };
    expect(content.id).toBe('test-bundle');
    expect(content.kind).toBe('theme');
    expect(content.payload).toBeTruthy();
  });

  it('MarketplaceManifest holds a bundles array', () => {
    const manifest: MarketplaceManifest = { bundles: [] };
    expect(Array.isArray(manifest.bundles)).toBe(true);
  });
});
