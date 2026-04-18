import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  timeout: 30_000,
  retries: 1,
  // globalSetup is Electron-specific — see electron project below.
  // The mobileWeb project does not need it (no Electron process, no mock claude stub).
  use: {
    trace: 'on-first-retry',
  },

  // Serve the web build before mobileWeb tests run.
  // reuseExistingServer allows local dev to skip rebuild when out/web is already served.
  webServer: {
    command: 'vite preview --config vite.web.config.ts --port 4173',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    // Give vite preview time to start; 15 s is generous for a static serve.
    timeout: 15_000,
  },

  projects: [
    // ── Electron project ──────────────────────────────────────────────────────
    // Original behavior: launches the built Electron app.
    // testDir scoped to ./e2e, ignores ./e2e/mobile/** so the web specs don't run here.
    {
      name: 'electron',
      testDir: './e2e',
      testIgnore: './e2e/mobile/**',
      use: {},
      // Electron tests need the claude stub on PATH and known token values.
      // Per-project globalSetup is supported in Playwright ≥ 1.39 via the
      // `globalSetup` field at the project level.
      // See: https://playwright.dev/docs/test-global-setup-teardown#configure-globalsetup-and-globalteardown
    },

    // ── mobileWeb — iPhone 14 ─────────────────────────────────────────────────
    {
      name: 'mobileWeb-iphone',
      testDir: './e2e/mobile',
      use: {
        ...devices['iPhone 14'],
        baseURL: 'http://localhost:4173',
      },
    },

    // ── mobileWeb — Pixel 7 ───────────────────────────────────────────────────
    {
      name: 'mobileWeb-pixel',
      testDir: './e2e/mobile',
      use: {
        ...devices['Pixel 7'],
        baseURL: 'http://localhost:4173',
      },
    },
  ],

  // Root-level globalSetup covers the electron project.
  // The mobileWeb projects do not launch Electron, so the claude stub and token
  // setup inside globalSetup is irrelevant to them and causes no harm.
  globalSetup: './e2e/mocks/globalSetup.ts',
});
