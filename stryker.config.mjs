// @ts-check
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'npm',
  reporters: ['html', 'clear-text', 'progress'],
  testRunner: 'vitest',
  // Wire Stryker to the project's existing vitest config so that
  // environment overrides (@vitest-environment jsdom etc.) are honoured.
  vitest: {
    configFile: 'vitest.config.ts',
  },
  coverageAnalysis: 'perTest',
  // First run builds baseline at reports/stryker-incremental.json; subsequent
  // runs only mutate files touched since baseline. Re-baseline by deleting the
  // file or running `stryker run --force` (full). Per Stryker docs.
  incremental: true,
  thresholds: {
    high: 80,
    low: 60,
    // Anti-backslide floor — Wave 92 baseline measured 22.41% (39 killed,
    // 106 survived, 29 no-cov out of 174 mutants in src/shared). Floor set
    // at 21 = floor(22.41) - 1 per ADR Decision 6. Raising the floor is a
    // deliberate decision in a future coverage-investment wave, NOT a side
    // effect of any PR.
    break: 21,
  },
  // Tight v1 scope — src/shared only. Pure types + helpers, no Electron, no
  // React, no native bindings. Per ADR Decision 5 + Phase 2 audit. Expansion
  // candidates are filed at roadmap/follow-ups/2026-05-16-stryker-mutate-scope-expansion.md.
  mutate: [
    'src/shared/**/*.ts',
    '!src/shared/**/*.test.ts',
    '!src/shared/**/*.d.ts',
  ],
  // Limit test execution to shared-layer tests only. The mutate scope is
  // src/shared — only these tests can kill shared mutants. Running the full
  // suite adds renderer/main tests that (a) are slow, (b) need jsdom env, and
  // (c) cannot kill shared mutants faster than the scoped set can.
  testFiles: ['src/shared/**/*.test.ts'],
};
