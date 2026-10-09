import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.integration.test.{ts,mjs}'],
    // Database/PDF fixtures are resource-heavy; bound file parallelism, not the
    // concurrency assertions inside each test, to avoid machine-load timeouts.
    maxWorkers: 2,
    minWorkers: 1,
    testTimeout: 15000,
    hookTimeout: 15000,
  },
})
