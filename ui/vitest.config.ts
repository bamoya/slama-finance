import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // jsdom serves http://localhost:3000, which is then the public site.
    env: { VITE_PLATFORM_DOMAIN: 'localhost:3000' },
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    // Bound jsdom workers so full checks remain usable alongside local services.
    maxWorkers: 2,
    minWorkers: 1,
  },
})
