import { defineConfig } from 'orval'

export default defineConfig({
  api: {
    input: './openapi/openapi.yaml',
    output: {
      target: './src/api/generated/client.ts',
      client: 'fetch',
      mode: 'single',
    },
  },
})
