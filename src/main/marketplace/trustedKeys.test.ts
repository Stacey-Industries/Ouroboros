/**
 * trustedKeys.test.ts — smoke tests for marketplace trusted key constants.
 */

import { describe, expect, it } from 'vitest';

import { MARKETPLACE_MANIFEST_URL, REVOKED_BUNDLES_URL, TRUSTED_PUBLIC_KEY_BASE64 } from './trustedKeys';

describe('trustedKeys', () => {
  it('exports TRUSTED_PUBLIC_KEY_BASE64 as the placeholder sentinel', () => {
    expect(TRUSTED_PUBLIC_KEY_BASE64).toBe('REPLACE_WITH_PRODUCTION_KEY');
  });

  it('exports MARKETPLACE_MANIFEST_URL pointing to the Ouroboros repo', () => {
    expect(MARKETPLACE_MANIFEST_URL).toMatch(/^https:\/\//);
    expect(MARKETPLACE_MANIFEST_URL).toContain('Stacey-Industries/Ouroboros');
    expect(MARKETPLACE_MANIFEST_URL).toMatch(/marketplace\/index\.json$/);
  });

  it('exports REVOKED_BUNDLES_URL in the same repo', () => {
    expect(REVOKED_BUNDLES_URL).toMatch(/^https:\/\//);
    expect(REVOKED_BUNDLES_URL).toContain('Stacey-Industries/Ouroboros');
    expect(REVOKED_BUNDLES_URL).toMatch(/revoked-bundles\.json$/);
  });
});
