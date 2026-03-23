import path from 'path'

import { defineConfig } from 'vitest/config'

// better-sqlite3 is compiled for Electron's Node ABI in the project, but vitest
// runs under system Node which may have a different ABI. If a Node-24-compatible
// build exists in a temp directory (built by `npm install better-sqlite3` outside
// the project), alias to it so integration tests can load the native addon.
const sqliteFreshDir = path.join(
  process.env.LOCALAPPDATA ?? '/tmp',
  'Temp/sqlite-fresh/node_modules/better-sqlite3',
)

export default defineConfig({
  resolve: {
    alias: {
      'better-sqlite3': sqliteFreshDir,
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.d.ts',
        'src/renderer/types/**',
        'node_modules/**',
      ],
      thresholds: {
        // Start low — ratchet up as coverage improves
        lines: 5,
        functions: 5,
        branches: 5,
        statements: 5,
      },
    },
  },
})
