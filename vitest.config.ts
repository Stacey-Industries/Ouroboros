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
      '@shared': path.resolve('src/shared'),
      '@main': path.resolve('src/main'),
      '@renderer': path.resolve('src/renderer'),
      'mica-electron': path.resolve('src/_test_mocks/mica-electron.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'tools/**/*.test.{ts,js}'],
    setupFiles: ['./vitest.setup.ts'],
    globals: false,
    // Fork-per-file isolation: forcibly kills each file's process after tests
    // complete, eliminating hangs from leaked handles (Worker threads, file
    // watchers, SQLite connections, setInterval in imported modules).
    // Threads pool would keep workers alive waiting for open handles to close.
    pool: 'forks',
    // Windows: orphan node processes from killed/rate-limited runs accumulate
    // under the default num-cpus fork count and starve subsequent runs
    // (observed: 121 orphans → vitest hangs with no output). Capping at 2
    // preserves parallelism while keeping the process graph manageable.
    // Vitest 4 deprecated test.poolOptions — top-level `forks` options now.
    maxWorkers: 2,
    minWorkers: 1,
    // Hang safety: cap per-test and per-teardown time so a stuck test fails
    // fast instead of consuming CI minutes.
    testTimeout: 20000,
    hookTimeout: 20000,
    teardownTimeout: 3000,
    server: {
      deps: {
        // Force mica-electron through Vite's transform pipeline so the
        // resolve.alias above redirects it to our stub before it can call
        // electron.app.commandLine.appendSwitch() at module load time.
        inline: ['mica-electron'],
      },
    },
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
