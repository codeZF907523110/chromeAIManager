import js from '@eslint/js';
import ts from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import vueParser from 'vue-eslint-parser';

export default [
  js.configs.recommended,
  {
    ignores: ['dist/', 'node_modules/', 'src/shared/*.js', 'src/content/*.js', 'src/service-worker/*.js', 'src/offscreen/*.js', 'src/lib/*', 'src/sidepanel/**/*.js', 'vite.config.ts'],
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
        HTMLDivElement: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': ts,
      vue: {
        rules: {},
      },
    },
    rules: {
      'no-console': 'warn',
      'no-debugger': 'off',
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
        HTMLDivElement: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': ts,
    },
    rules: {
      'no-console': 'warn',
      'no-debugger': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
];
