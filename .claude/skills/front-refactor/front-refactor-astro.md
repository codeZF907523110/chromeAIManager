# front-refactor: Astro Rules

Apply all shared rules from `front-refactor-rules.md`, then apply the rules below.
Applies to `.astro` files.

Apply JS/TS rules to the frontmatter (`---` block) and `<script>` tags.
Apply CSS rules to `<style>` blocks.
Apply the Astro-specific rules below to the component as a whole.

---

## Category DEAD

### ASTRO-DEAD-1: Unused frontmatter variable

**Detect:** A variable declared in the frontmatter (`---` block) that is never used in the template.

**Fix:** Remove the declaration.

### ASTRO-DEAD-2: Unused import in frontmatter

**Detect:** An `import` in the frontmatter whose binding is never referenced in the template or the rest of the frontmatter.

**Fix:** Remove the import line.

### ASTRO-DEAD-3: Component imported but not used in template

**Detect:** A component imported in the frontmatter that does not appear anywhere in the template markup.

**Fix:** Remove the import. Flag in Notes if the import could be a layout dependency passed via a slot.

---

## Category NAMING

### ASTRO-NAMING-1: Prop not typed in `interface Props`

**Detect:** A component that uses `Astro.props` without a corresponding `interface Props { ... }` declaration.

**Fix:** Add a typed `interface Props` block in the frontmatter, inferring types from usage.

```astro
---
// Before
const { title, count } = Astro.props;

// After
interface Props {
  title: string;
  count?: number;
}
const { title, count } = Astro.props;
---
```

### ASTRO-NAMING-2: Frontmatter variable shadowing a prop

**Detect:** A `const` declared in the frontmatter with the same name as a destructured prop, effectively shadowing it.

**Fix:** Rename the local variable to avoid the collision and clarify intent.

---

## Category SIMPLIFY

### ASTRO-SIMPLIFY-1: Inline template logic → frontmatter variable

**Detect:** A complex expression inside `{...}` in the template, ternaries, array methods, string concatenation, that is not a simple variable reference.

**Fix:** Extract to a named `const` in the frontmatter.

```astro
<!-- Before -->
<p>{items.filter(i => i.published).map(i => i.title).join(', ')}</p>

<!-- After — in frontmatter -->
const publishedTitles = items.filter(i => i.published).map(i => i.title).join(', ');
<!-- In template -->
<p>{publishedTitles}</p>
```

### ASTRO-SIMPLIFY-2: Repeated conditional blocks with the same condition

**Detect:** Two or more `{condition && <element />}` or `{condition ? <a> : <b>}` expressions in the template that check the same condition.

**Fix:** Wrap the content in a single conditional block.

### ASTRO-SIMPLIFY-3: `<slot>` with a default that duplicates another slot

**Detect:** A named `<slot>` whose fallback content is identical to another slot's fallback.

**Fix:** Extract the shared fallback to a frontmatter variable or a sub-component.

---

## Category MODERN

### ASTRO-MODERN-1: Raw `<img>` → `<Image />` from `astro:assets`

**Detect:** A `<img>` tag for a local or known-remote image that does not use Astro's `<Image />` component.

**Fix:** Replace with `<Image src={...} alt="..." width={N} height={N} />` from `astro:assets`. Add the import to the frontmatter.

> Note: Only apply for local images or images from configured `domains`. For arbitrary external URLs, flag in Notes.

### ASTRO-MODERN-2: `define:vars` instead of inline `<script>` string interpolation

**Detect:** A `<script>` tag that uses template literals or string concatenation to inject frontmatter values into client-side JS.

**Fix:** Replace with the `define:vars={{ key: value }}` directive, which safely passes frontmatter values to client scripts.

```astro
<!-- Before -->
<script>const theme = "{theme}";</script>

<!-- After -->
<script define:vars={{ theme }}>
  console.log(theme);
</script>
```
