# Team Standards

> Conventions for professional teams working on Vue 3 applications.

## File Naming Conventions

### Components

| Type | Pattern | Example |
|------|---------|---------|
| Page | `PascalCase` + `Page` suffix | `UsersListPage.vue` |
| Layout | `PascalCase` + `Layout` suffix | `DefaultLayout.vue` |
| UI Primitive | `PascalCase` + `App` prefix | `AppButton.vue`, `AppModal.vue` |
| Feature Component | `PascalCase` | `UserCard.vue`, `OrderTable.vue` |
| Common Component | `PascalCase` | `DataTable.vue`, `Pagination.vue` |

### Non-Component Files

| Type | Pattern | Example |
|------|---------|---------|
| Composable | `camelCase` + `use` prefix | `useAuth.ts`, `useUsers.ts` |
| Store | `camelCase` (exports `use...Store`) | `auth.ts` → `useAuthStore` |
| API module | `camelCase` (exports `...Api`) | `users.ts` → `usersApi` |
| Utility | `camelCase` | `formatDate.ts`, `debounce.ts` |
| Type file | `camelCase` | `user.ts`, `api.ts` |
| Constants | `camelCase` | `roles.ts`, `httpStatus.ts` |
| Guard/middleware | `camelCase` | `authGuard.ts`, `permissionGuard.ts` |
| Directive | `camelCase` + `v` prefix | `vClickOutside.ts` |

### Folder Naming

- Always `kebab-case` or `camelCase` — consistent within project.
- Feature folders use the domain name: `users/`, `orders/`, `auth/`.
- Never use generic names: ~~`stuff/`~~, ~~`misc/`~~, ~~`other/`~~.

---

## Code Naming Conventions

### Variables & Functions

```ts
// Local state — camelCase
const userName = ref('')
const isLoading = ref(false)

// Computed — camelCase, descriptive
const activeUserCount = computed(() => users.value.filter(u => u.active).length)

// Functions — camelCase, verb-first
function fetchUsers() { /* ... */ }
function handleSubmit() { /* ... */ }
function formatCurrency(amount: number): string { /* ... */ }

// Boolean refs — prefix with is/has/can/should
const isVisible = ref(false)
const hasPermission = computed(() => /* ... */)
const canEdit = computed(() => /* ... */)
```

### Constants

```ts
// UPPER_SNAKE_CASE for true constants
export const MAX_RETRY_COUNT = 3
export const API_TIMEOUT = 15_000
export const DEFAULT_PAGE_SIZE = 20

// PascalCase for enum-like objects
export const UserRole = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  USER: 'user',
} as const

export type UserRole = (typeof UserRole)[keyof typeof UserRole]
```

### Types & Interfaces

```ts
// PascalCase — always
interface User { id: number; name: string }
interface CreateUserDto { name: string; email: string }
interface UpdateUserDto extends Partial<CreateUserDto> {}
type UserRole = 'admin' | 'manager' | 'user'

// Suffix conventions
// - Dto: Data Transfer Object (API shapes)
// - Props: Component prop types (usually inline with defineProps)
// - Emits: Component emit types (usually inline with defineEmits)
// - Options: Configuration objects
// - Config: App/module config
```

### Events

```ts
// camelCase — descriptive, domain-specific
defineEmits<{
  userSelect: [user: User]       // NOT 'select'
  pageChange: [page: number]     // NOT 'change'
  formSubmit: [data: FormData]   // NOT 'submit'
  itemDelete: [id: number]       // NOT 'delete'
}>()
```

---

## Branch Naming

```
<type>/<ticket>-<short-description>

feature/PROJ-123-user-profile-page
fix/PROJ-456-login-redirect-loop
chore/PROJ-789-update-dependencies
refactor/PROJ-101-extract-auth-composable
hotfix/PROJ-202-critical-auth-bypass
```

### Protected Branches

| Branch | Purpose | Merge via |
|--------|---------|-----------|
| `main` | Production | PR from `develop` or `release/*` |
| `develop` | Integration | PR from feature branches |
| `release/*` | Release candidate | PR from `develop` |

---

## Pull Request Standards

### PR Title

Follow Conventional Commits format:
```
feat(users): add user profile editing
fix(auth): resolve token refresh race condition
```

### PR Description Template

```markdown
## What
Brief description of what this PR does.

## Why
Context and motivation for the change.

## How
Technical approach and key decisions.

## Testing
- [ ] Unit tests added/updated
- [ ] Manual testing completed
- [ ] Edge cases considered

## Screenshots
(if UI changes)

## Checklist
- [ ] Code follows project conventions
- [ ] TypeScript — no `any`, proper typing
- [ ] Components use `<script setup lang="ts">`
- [ ] No console.log in production code
- [ ] API calls go through API modules
- [ ] State management follows store patterns
- [ ] Self-review completed
```

### PR Size Guidelines

| Size | Lines Changed | Review Time |
|------|--------------|-------------|
| Small | < 200 | 15 min |
| Medium | 200–500 | 30–60 min |
| Large | 500+ | Split into smaller PRs |

**Rule:** PRs over 500 lines should be split. Exceptions: generated code, large refactors with clear scope.

---

## Code Review Standards

### What to Check

1. **Correctness** — Does it work? Edge cases covered?
2. **Architecture** — Does it follow project patterns? Smart/dumb split?
3. **TypeScript** — Proper types? No `any`? Typed emits/props?
4. **Reactivity** — Correct use of ref/computed/watch? No reactivity leaks?
5. **Performance** — Lazy loading? No unnecessary watchers? No memory leaks?
6. **Security** — No XSS (`v-html`)? No secrets in code? Input validation?
7. **DX** — Readable? Naming conventions? No dead code?

### Review Etiquette

- **Be specific** — "This `watch` should be a `computed` because X" not "Bad code."
- **Suggest, don't demand** — "Consider using..." not "You must..."
- **Explain why** — every suggestion should include reasoning.
- **Approve with comments** — minor issues shouldn't block.
- **Request changes** for — security issues, broken patterns, missing types, untested logic.

### Turnaround

- **First review:** within 4 business hours.
- **Follow-up reviews:** within 2 business hours.
- **Author response:** same day.

---

## Documentation Standards

### What to Document

| Artifact | Where | When |
|----------|-------|------|
| Component API (props, emits, slots) | JSDoc in component | Complex components |
| Composable API | JSDoc in composable | All public composables |
| Store API | JSDoc in store | All stores |
| Architectural decisions | `docs/adr/` (Architecture Decision Records) | When choosing between approaches |
| Setup / onboarding | `README.md` | Project root |
| API contracts | `docs/api/` or Swagger link | API integration |
| Environment variables | `.env.example` + `README.md` | All env vars |

### JSDoc for Composables

```ts
/**
 * Manages paginated data fetching with loading and error state.
 *
 * @param fetchFn - Async function that receives page/limit and returns paginated data.
 * @param options - Configuration options.
 * @returns Reactive pagination state and controls.
 *
 * @example
 * ```ts
 * const { items, page, totalPages, loading, goToPage } = usePagination(
 *   (params) => usersApi.getAll(params),
 *   { limit: 20 },
 * )
 * ```
 */
export function usePagination<T>(
  fetchFn: (params: { page: number; limit: number }) => Promise<PaginatedResponse<T>>,
  options?: { limit?: number },
) { /* ... */ }
```

### Architecture Decision Records (ADRs)

```markdown
<!-- docs/adr/001-state-management.md -->
# ADR-001: Use Pinia for State Management

## Status: Accepted

## Context
We need a state management solution for shared state across components.

## Decision
Use Pinia with Setup Stores for all shared state.

## Consequences
- All shared state goes through Pinia stores.
- Local component state stays in `ref`/`reactive`.
- Team must use `storeToRefs()` for destructuring.
```

---

## Onboarding Checklist

```markdown
# New Developer Onboarding

## Setup
- [ ] Clone repo
- [ ] Install Node.js (version in `.nvmrc`)
- [ ] Run `npm install`
- [ ] Copy `.env.example` → `.env.local`
- [ ] Run `npm run dev` — verify app starts

## Tools
- [ ] Install VSCode extensions (see `.vscode/extensions.json`)
- [ ] Install Vue DevTools browser extension
- [ ] Verify ESLint + Prettier working (save a file, check formatting)

## Read
- [ ] `README.md` — project overview
- [ ] `docs/architecture.md` — architecture decisions
- [ ] `CONTRIBUTING.md` — PR process and conventions

## First Task
- [ ] Pick a `good-first-issue` ticket
- [ ] Create feature branch
- [ ] Submit PR following the template
```
