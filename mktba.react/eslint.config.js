import js from '@eslint/js'
import globals from 'globals'
import i18next from 'eslint-plugin-i18next'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // UI text comes from src/localization dictionaries; hard-coded JSX text and attribute strings are errors.
    files: ['src/**/*.tsx'],
    ignores: ['src/**/*.test.tsx'],
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': ['error', {
        mode: 'jsx-only',
        'jsx-attributes': {
          exclude: [
            'className', 'style', 'type', 'key', 'id', 'width', 'height', 'to', 'href', 'target', 'rel',
            'role', 'name', 'htmlFor', 'autoComplete', 'inputMode', 'method', 'accept', 'src', 'viewBox',
            'fill', 'stroke', 'd', 'variant', 'size', 'path', 'policy', 'aria-modal', 'data-.*', 'aria-(controls|describedby|labelledby|live|current|haspopup|hidden|expanded)',
          ],
        },
        // Strings without Latin or Cyrillic letters (punctuation, symbols, numbers) are allowed.
        words: { exclude: ['[^A-Za-zА-Яа-яЁё]+', '[A-Z_-]+'] },
        callees: { exclude: ['.*'] },
        'object-properties': { exclude: ['.*'] },
      }],
    },
  },
])
