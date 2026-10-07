import js from '@eslint/js'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import globals from 'globals'
import tseslint from 'typescript-eslint'

import architecture from './eslint/architecture.js'

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'db/migrations/**', 'src/contracts/generated/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/modules/**/*.{ts,js,mjs}'],
    ignores: ['src/modules/audit/writer.ts'], // Internal audit-event validation, not HTTP contracts.
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['zod', 'zod/*'],
              message:
                'HTTP schemas/types must be generated from api/openapi; import contracts/generated instead. Internal validation belongs in shared infrastructure.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,js,mjs}'],
    ignores: ['**/__tests__/**', '**/*.{test,spec}.ts'],
    plugins: { architecture },
    rules: { 'architecture/boundaries': 'error' },
  },
  {
    languageOptions: {
      parserOptions: { tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ['**/*.{ts,js,mjs}'],
    languageOptions: { globals: globals.node },
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'inline-type-imports', prefer: 'type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'no-console': 'warn',
      'simple-import-sort/exports': 'error',
      'simple-import-sort/imports': 'error',
    },
  },
  {
    files: ['**/*.{test,spec}.ts', 'tests/**/*.ts'],
    languageOptions: { globals: globals.vitest },
  },
)
