# front-review: Astro Rules

Apply all shared rules from `front-review-rules.md`, then apply the rules below.
Applies to `.astro` files.

An Astro component has two sections: the frontmatter (`---` fences, server-side JS/TS) and the template (HTML + JSX-like expressions). An optional `<style>` block and `<script>` tags may also be present.

Apply JS/TS rules to the frontmatter and `<script>` blocks, CSS rules to `<style>` blocks, and the Astro-specific rules below to the component as a whole.

---

## Category A: Frontmatter & Data Fetching

### ASTRO-1: Data fetch without error handling (🔴 Critical)

**Detect:** A `fetch()` or async call in the frontmatter without a `try/catch`.

**Fix:** Wrap the call in `try/catch` and return a meaningful fallback or redirect on error. Unhandled errors in frontmatter crash the page render.

```astro
---
// ❌
const data = await fetch('/api/posts').then(r => r.json());

// ✅
let data = [];
try {
  const res = await fetch('/api/posts');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  data = await res.json();
} catch (err) {
  console.error('Failed to fetch posts:', err);
}
---
```

### ASTRO-2: Sensitive data exposed to the client (🔴 Critical)

**Detect:** A secret, API key, or environment variable accessed in frontmatter or a server-side function that is also assigned to a variable used in a `<script>` tag or passed as a prop to a client-side island component.

**Fix:** Keep secrets server-side only. Do not pass them as props to islands. Use Astro's `import.meta.env.SECRET_*` variables (prefixed for server-only use) and never expose them in the template.

### ASTRO-3: Missing `Astro.props` type definition (🟠 Important)

**Detect:** An Astro component that accepts props via `Astro.props` or `const { ... } = Astro.props` without a TypeScript interface defining the prop shape (`interface Props { ... }`).

**Fix:** Add an `interface Props` declaration in the frontmatter:
```astro
---
interface Props {
  title: string;
  description?: string;
}
const { title, description } = Astro.props;
---
```

---

## Category B: Template

### ASTRO-4: `set:html` with a non-static value (🔴 Critical)

**Detect:** `<element set:html={variable} />` where `variable` is not a static string literal.

**Fix:** Sanitize the value with DOMPurify or similar before passing it to `set:html`, or use text interpolation `{variable}` if HTML rendering is not needed.

### ASTRO-5: Client island directive missing for interactive component (🟠 Important)

**Detect:** A framework component (React, Vue, Svelte, Solid) that contains event handlers (`onClick`, `on:click`, etc.) or reactive state but is rendered without a `client:*` directive.

**Fix:** Add the appropriate client directive:
- `client:load`: hydrate immediately on page load
- `client:idle`: hydrate when the browser is idle
- `client:visible`: hydrate when the component enters the viewport

### ASTRO-6: Unnecessary `client:load` on a static component (🟡 Minor)

**Detect:** A `client:load` directive on a component that has no event handlers, no reactive state, and no interactivity, it renders the same output on every render.

**Fix:** Remove the `client:*` directive. Let Astro render it as static HTML, no JS is shipped to the client.

---

## Category C: Performance

### ASTRO-7: Image without `<Image />` component (🟠 Important)

**Detect:** A raw `<img>` tag used for local or remote images instead of Astro's built-in `<Image />` or `<Picture />` component.

**Fix:** Replace with `<Image src={...} alt="..." />` from `astro:assets`. Astro's component handles format conversion (WebP/AVIF), lazy loading, and prevents layout shift.

### ASTRO-8: Large data transform in frontmatter that could be cached (🟡 Minor)

**Detect:** An expensive synchronous computation (sorting, filtering, mapping large arrays) in frontmatter that is repeated on every request in SSR mode, without memoization.

**Fix:** In SSR mode, cache results where appropriate. In static mode (SSG), this is not an issue, it runs once at build time.
