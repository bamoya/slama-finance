import { defineConfig } from 'orval'

export default defineConfig({
  api: {
    input: './src/api/generated/schemas/openapi.json',
    output: {
      target: './src/api/generated/endpoints.ts',
      schemas: './src/api/generated/models',
      client: 'react-query',
      mode: 'tags-split',
      override: {
        mutator: { path: './src/api/http.ts', name: 'apiRequest' },
        query: { useQuery: true, useMutation: true, version: 5, signal: true },
      },
    },
  },
})
