# Developer Experience & Tooling

> Tooling, linting, formatting, git hooks, and CI/CD setup for Vue 3 projects.

## ESLint Configuration

### Flat Config (ESLint 9+)

```js
// eslint.config.js
import js from '@eslint/js'
import vue from 'eslint-plugin-vue'
import ts from 'typescript-eslint'

export default [
  js.configs.recommended,
  ...ts.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
      },
    },
  },
  {
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/no-unused-vars': 'error',
      'vue/component-api-style': ['error', ['script-setup']],
      'vue/define-macros-order': ['error', { order: ['defineProps', 'defineEmits', 'defineModel'] }],
      'vue/block-order': ['error', { order: ['script', 'template', 'style'] }],
      'vue/no-v-html': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    ignores: ['dist/', 'node_modules/', '*.config.js'],
  },
]
```

---

## Prettier Configuration

```json
// .prettierrc
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always",
  "endOfLine": "lf",
  "vueIndentScriptAndStyle": false,
  "singleAttributePerLine": true
}
```

```
// .prettierignore
dist
node_modules
*.min.js
coverage
```

---

## Husky + lint-staged

### Setup

```bash
npm install -D husky lint-staged
npx husky init
```

### Pre-commit Hook

```bash
# .husky/pre-commit
npx lint-staged
```

### lint-staged Config

```json
// .lintstagedrc
{
  "*.{ts,vue}": ["eslint --fix", "prettier --write"],
  "*.{json,md,scss,css}": ["prettier --write"]
}
```

---

## Commit Conventions

### Conventional Commits

```
<type>(<scope>): <subject>

feat(auth): add login with OAuth
fix(users): resolve pagination offset bug
refactor(api): extract interceptor setup
chore(deps): update vite to 6.x
docs(readme): add deployment instructions
test(users): add unit tests for useUserForm
style(components): fix linting errors
perf(dashboard): lazy-load chart widgets
```

### Types

| Type | When to use |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Code change that neither fixes nor adds |
| `chore` | Build, deps, config changes |
| `docs` | Documentation |
| `test` | Adding or fixing tests |
| `style` | Formatting, linting (no logic change) |
| `perf` | Performance improvement |
| `ci` | CI/CD config changes |

### Commit Message Hook (optional)

```bash
# .husky/commit-msg
npx commitlint --edit "$1"
```

```js
// commitlint.config.js
export default {
  extends: ['@commitlint/config-conventional'],
}
```

---

## TypeScript Configuration

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "preserve",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "noEmit": true,
    "paths": {
      "@/*": ["./src/*"]
    },
    "types": ["vite/client"]
  },
  "include": ["src/**/*.ts", "src/**/*.d.ts", "src/**/*.vue"],
  "exclude": ["node_modules", "dist"]
}
```

---

## Vite Path Aliases

```ts
// vite.config.ts
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
```

---

## Environment Configuration

### Files

```
.env                 # Shared defaults (committed)
.env.local           # Local overrides (gitignored)
.env.development     # Dev-specific (committed)
.env.production      # Prod-specific (committed)
.env.staging         # Staging-specific (committed)
```

### Naming Rule

All client-exposed env vars **must** be prefixed with `VITE_`:

```bash
# .env
VITE_APP_TITLE=My App
VITE_API_URL=http://localhost:8080/api

# NOT exposed to client (server-only):
DATABASE_URL=postgres://...
```

### Typed Env

```ts
// src/env.d.ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string
  readonly VITE_API_URL: string
  readonly VITE_WS_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

---

## VSCode Settings

```json
// .vscode/settings.json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "[vue]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "vue.server.hybridMode": true
}
```

```json
// .vscode/extensions.json
{
  "recommendations": [
    "vue.volar",
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "bradlc.vscode-tailwindcss"
  ]
}
```

---

## CI/CD Integration

### GitHub Actions Example

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check
      - run: npm run test:unit
      - run: npm run build
```

### package.json Scripts

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc --noEmit && vite build",
    "preview": "vite preview",
    "lint": "eslint . --fix",
    "format": "prettier --write src/",
    "type-check": "vue-tsc --noEmit",
    "test:unit": "vitest run",
    "test:e2e": "playwright test",
    "prepare": "husky"
  }
}
```

---

## Debugging Conventions

### Vue DevTools

- Install [Vue DevTools](https://devtools.vuejs.org/) browser extension.
- Use component inspector for props/state debugging.
- Use Pinia tab for store state inspection.
- Use router tab for navigation debugging.

### Console Conventions

```ts
// Use structured logging in development
if (import.meta.env.DEV) {
  console.groupCollapsed('[Auth] Login attempt')
  console.log('credentials:', { email: credentials.email })
  console.groupEnd()
}
```

### Source Maps

```ts
// vite.config.ts
export default defineConfig({
  build: {
    sourcemap: true,  // or 'hidden' for production (upload to error tracker)
  },
})
```
