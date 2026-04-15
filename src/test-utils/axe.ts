/**
 * axe.ts — Shared axe-core helper for vitest-axe a11y smoke tests.
 *
 * Color-contrast is disabled because design-token CSS custom properties
 * are not resolvable in jsdom's computed-style environment — axe would
 * flag every token-colored element as a false positive.
 */

import { configureAxe } from 'vitest-axe';

export const axe = configureAxe({
  rules: { 'color-contrast': { enabled: false } },
});

export { toHaveNoViolations } from 'vitest-axe/matchers';
