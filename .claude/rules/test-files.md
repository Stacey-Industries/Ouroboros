# Test File Rules (src/**/*.test.ts)

- Test framework: vitest (not jest, not mocha)
- Use `describe`/`it`/`expect` from vitest
- Relaxed lint rules: `max-lines-per-function` and `max-lines` are OFF for test files
- Test behavior, not implementation — avoid testing internal state
- Prefer integration tests over mocks where practical
- Colocate test files with source (e.g., `foo.ts` + `foo.test.ts`)
