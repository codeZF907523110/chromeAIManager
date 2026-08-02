import js from '@eslint/js'
import ts from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import vueParser from 'vue-eslint-parser'
import prettierRecommended from 'eslint-plugin-prettier/recommended'
import prettierPlugin from 'eslint-plugin-prettier'

export default [
  js.configs.recommended,
  prettierRecommended,
  {
    ignores: ['dist/', 'node_modules/', '**/*.d.ts', '**/*.js', 'vite.config.ts'],
  },
  {
    files: ['**/*.vue', '**/*.ts'],
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      'prettier/prettier': 'error',
    },
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        extraFileExtensions: ['.vue'],
      },
      globals: {
        chrome: 'readonly',
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        sessionStorage: 'readonly',
        localStorage: 'readonly',
        AbortController: 'readonly',
        navigator: 'readonly',
        MediaRecorder: 'readonly',
        Blob: 'readonly',
        FileReader: 'readonly',
        trustedTypes: 'readonly',
        FormData: 'readonly',
        confirm: 'readonly',
        Event: 'readonly',
        KeyboardEvent: 'readonly',
        MouseEvent: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLElement: 'readonly',
        ClipboardItem: 'readonly',
        MutationObserver: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': ts,
    },
    rules: {
      'no-console': 'off',
      'no-debugger': 'off',
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      globals: {
        chrome: 'readonly',
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        sessionStorage: 'readonly',
        localStorage: 'readonly',
        AbortController: 'readonly',
        navigator: 'readonly',
        MediaRecorder: 'readonly',
        Blob: 'readonly',
        FileReader: 'readonly',
        trustedTypes: 'readonly',
        FormData: 'readonly',
        confirm: 'readonly',
        Event: 'readonly',
        KeyboardEvent: 'readonly',
        MouseEvent: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLElement: 'readonly',
        ClipboardItem: 'readonly',
        MutationObserver: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': ts,
    },
    rules: {
      'no-console': 'off',
      'no-debugger': 'off',
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
]
