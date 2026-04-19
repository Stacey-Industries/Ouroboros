/**
 * check-marketplace-key.ts — production build guard for the marketplace key.
 *
 * Runs in CI as a prebuild step.  Exits with code 1 if a production build is
 * attempted while the placeholder key is still present in trustedKeys.ts.
 *
 * Usage:
 *   NODE_ENV=production node scripts/check-marketplace-key.ts
 *   CI_RELEASE=true   node scripts/check-marketplace-key.ts
 */

import { TRUSTED_PUBLIC_KEY_BASE64 } from '../src/main/marketplace/trustedKeys';

const isProd =
  process.env['NODE_ENV'] === 'production' || process.env['CI_RELEASE'] === 'true';

if (isProd && TRUSTED_PUBLIC_KEY_BASE64 === 'REPLACE_WITH_PRODUCTION_KEY') {
  console.error(
    '[marketplace] production build refused: placeholder key still present in trustedKeys.ts',
  );
  console.error(
    '[marketplace] Generate a real Ed25519 key and replace TRUSTED_PUBLIC_KEY_BASE64.',
  );
  process.exit(1);
}

console.log('[marketplace] key check passed');
