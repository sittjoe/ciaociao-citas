import { defineConfig } from 'vitest/config'

// Keep vitest scoped to unit tests under src/. Playwright e2e specs live in
// tests/e2e and are run via `pnpm test:e2e`; if we don't exclude them here,
// vitest tries to evaluate them and crashes on Playwright's `test.describe`.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['node_modules', '.next', 'tests/e2e/**', 'playwright/**'],
  },
})
