/**
 * axe.ts — Shared axe-core helper for vitest-axe a11y smoke tests.
 *
 * Color-contrast is disabled because design-token CSS custom properties
 * are not resolvable in jsdom's computed-style environment — axe would
 * flag every token-colored element as a false positive.
 *
 * `toHaveNoViolations` is imported from the internal dist path to avoid the
 * `export type *` wrapper in `vitest-axe/matchers` which would cause TS1448
 * under isolatedModules when re-exported as a value.
 */

import { configureAxe } from 'vitest-axe';
// vitest-axe/matchers.d.ts uses `export type *` (isolatedModules compat issue),
// so we import the value from the dist entry directly, which uses regular exports.
import { toHaveNoViolations } from 'vitest-axe/dist/matchers';

export { toHaveNoViolations };

export const axe = configureAxe({
  rules: { 'color-contrast': { enabled: false } },
});
