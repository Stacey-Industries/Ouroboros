import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
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
