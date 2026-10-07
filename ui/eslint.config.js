import js from '@eslint/js'
import boundaries from 'eslint-plugin-boundaries'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import architecture from './eslint/architecture.js'

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'src/api/generated/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: { tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ['*.{js,mjs,ts}', 'scripts/**/*.{js,mjs,ts}', 'eslint/**/*.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
    ...reactHooks.configs.flat['recommended-latest'],
    plugins: {
      boundaries,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'simple-import-sort': simpleImportSort,
    },
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
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'simple-import-sort/exports': 'error',
      'simple-import-sort/imports': 'error',
      'boundaries/dependencies': [
        'error',
        {
          default: 'allow',
          policies: [
            {
              from: { element: { type: 'lib' } },
              disallow: {
                to: { element: { types: { anyOf: ['app', 'feature', 'component', 'api'] } } },
              },
            },
            {
              from: { element: { type: 'component' } },
              disallow: { to: { element: { types: { anyOf: ['app', 'feature'] } } } },
            },
            {
              from: { element: { type: 'api' } },
              disallow: { to: { element: { types: { anyOf: ['app', 'feature', 'component'] } } } },
            },
            {
              from: { element: { type: 'feature' } },
              disallow: {
                to: {
                  element: {
                    type: 'feature',
                    captured: { feature: '!{{ from.element.captured.feature }}' },
                  },
                },
              },
            },
          ],
        },
      ],
    },
    settings: {
      'boundaries/elements': [
        { type: 'app', pattern: 'src/app' },
        { type: 'api', pattern: 'src/api' },
        { type: 'component', pattern: 'src/components' },
        { type: 'feature', pattern: 'src/features/*', capture: ['feature'] },
        { type: 'lib', pattern: 'src/lib' },
      ],
      'boundaries/include': ['src/**/*'],
      'boundaries/legacy-templates': false,
    },
  },
  {
    files: ['src/**/*.{test,spec}.{ts,tsx}', 'src/test/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.vitest },
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['**/*.{test,spec}.{ts,tsx}', 'src/test/**'],
    plugins: { architecture },
    rules: { 'architecture/boundaries': 'error' },
  },
  {
    files: ['src/features/*/index.ts'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
)
