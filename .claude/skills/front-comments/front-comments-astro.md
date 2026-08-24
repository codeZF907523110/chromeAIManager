## Level 1: Structure & Block Comments

Apply every rule below. Do not skip any.

An Astro component has three distinct blocks. Each uses its own native comment syntax:
- Frontmatter (`---`) → `/** */` (JavaScript/TypeScript)
- Template (HTML between the closing `---` and `<style>`) → `<!-- -->` (HTML)
- `<style>` → `/* */` (CSS)

---

### 1. File-level header (above the opening `---`)

A `<!-- -->` block using `*` prefixes on each line, with an emoji and the component name as title, followed by:
- 3–6 lines describing what the component does, how it works, and its UX role
- A note if the component uses build-time data fetching
- Structured fields: `Props:`, `Emits:`, `Dependencies:`

```html
<!--
 * 📝 PostCard.astro
 *
 * A blog post card component displaying title, date, excerpt, and tags.
 * Supports a featured state that adds a visual highlight border and badge.
 *
 * Date formatting and tag truncation are handled at build time in the frontmatter.
 * A named slot allows injecting custom footer content from the parent.
 *
 * Props: title, date, excerpt, tags, featured, href
 * Emits: none
 * Dependencies: none
-->
```

---

### 2. Frontmatter block header

At the very top of the frontmatter (before the Props interface or first import), add a JSDoc block with:
- An emoji and "Frontmatter (build-time script)" as the title
- 2–3 lines summarizing what the frontmatter does

```js
---
    /**
     * 🧩 Frontmatter (build-time script)
     *
     * Defines the component props interface, destructures incoming props,
     * and derives display-ready values before the template renders.
     */
```

---

### 3. JSDoc before each block in the frontmatter

For the Props interface, props destructuring, and each derived variable, add a `/**` block with:
- A `##` heading with an emoji
- No description paragraph at Level 1, the heading alone is sufficient

```js
    /**
     * ## 🏷️ Props Interface
     */
    export interface Props {
        title: string;
        date: string;
        tags: string[];
        featured?: boolean;
        href: string;
    }

    /**
     * ## 📥 Props Destructuring
     */
    const { title, date, tags, featured = false, href } = Astro.props;

    /**
     * ## 📅 Formatted Date
     */
    const formattedDate = new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    /**
     * ## 🏷️ Tag List
     */
    const tagList = tags.slice(0, 3);
```

---

### 4. Template: notable element comments

Add a `<!-- short comment -->` above elements that carry non-obvious logic (Astro directives, JSX-style expressions, conditional rendering, slots…). Keep it to one line when possible.

```html
<!-- class:list applies the featured modifier class conditionally -->
<article class:list={['post-card', { 'post-card--featured': featured }]}>

    <!-- Badge rendered only when the featured prop is true -->
    {featured && <span class="post-card__badge">Featured</span>}

    <!-- datetime keeps the machine-readable ISO date while displaying the formatted version -->
    <time class="post-card__date" datetime={date}>{formattedDate}</time>

    <!-- Tag list rendered only when at least one tag exists -->
    {tagList.length > 0 && (
        <ul class="post-card__tags">
            {tagList.map(tag => (
                <li class="post-card__tag">{tag}</li>
            ))}
        </ul>
    )}

    <!-- Named slot for optional footer content injected by the parent -->
    <slot name="footer" />
```

---

### 5. Style: section dividers

Within `<style>`, use CSS sub-section dividers to separate logical groups:

```css
<style>

    /* ------------------------------------------------------------
     * ## 🃏 Card Layout
     * ------------------------------------------------------------ */

    .post-card { … }

    /* ------------------------------------------------------------
     * ## ⭐ Featured Badge
     * ------------------------------------------------------------ */

    .post-card__badge { … }

</style>
```

---

## Full: Level 1 + inline comments on every block

Apply everything from Level 1, then add the additions below for each block.

---

### Frontmatter: expanded JSDoc + inline comments

At Full level, the `##` heading for each block gets a description paragraph. Inline `/** */` comments are added on individual declarations where the value or type is non-obvious:

```js
    /**
     * ## 🏷️ Props Interface
     *
     * TypeScript interface declaring the expected props for this component.
     * `featured` is optional and defaults to false when not provided.
     */
    export interface Props {
        title: string;
        date: string;      /** ISO 8601 date string (e.g. "2024-03-15") */
        excerpt: string;
        tags: string[];
        featured?: boolean;
        href: string;      /** URL to the full post page */
    }

    /**
     * ## 📅 Formatted Date
     *
     * Converts the raw ISO date string into a human-readable format at build time.
     * The original `date` string is preserved separately for the `datetime` attribute.
     */
    const formattedDate = new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',  /** Full month name (e.g. "March") */
        day: 'numeric',
    });

    /**
     * ## 🏷️ Tag List
     *
     * Caps the displayed tags at 3 to avoid visual overflow on small cards.
     * The original `tags` array is not mutated.
     */
    const tagList = tags.slice(0, 3);
```

---

### Template: directive & expression explanations

For each non-trivial Astro directive or JSX-style expression (`class:list`, `{condition && ...}`, `.map()`, `<slot>`, dynamic attribute bindings…), replace the short Level 1 comment with a multi-line `<!-- -->` block:

```html
<!--
  class:list: Astro directive that accepts an array of class names and conditional objects.
  The 'post-card--featured' modifier class is applied only when the featured prop is true.
-->
<article class:list={['post-card', { 'post-card--featured': featured }]}>

<!--
  {featured && ...}: JSX-style short-circuit rendering.
  The badge element is only created in the DOM when featured is true.
-->
{featured && <span class="post-card__badge">Featured</span>}

<!--
  datetime={date}: binds the machine-readable ISO date to the semantic attribute
  while displaying the human-formatted version as visible text.
  This is important for accessibility tools and search engine indexing.
-->
<time class="post-card__date" datetime={date}>{formattedDate}</time>

<!--
  {tagList.length > 0 && ...}: guards against rendering an empty <ul>.
  Without this check, an empty list would still appear in the DOM.
-->
{tagList.length > 0 && (
    <ul class="post-card__tags">
        <!--
          .map(): JSX-style iteration, Astro compiles this to static HTML at build time.
          No key prop is needed (unlike React) since there is no virtual DOM to reconcile.
        -->
        {tagList.map(tag => (
            <li class="post-card__tag">{tag}</li>
        ))}
    </ul>
)}

<!--
  slot name="footer": named slot, allows the parent to inject arbitrary content
  at the bottom of the card. Renders nothing if no content is passed.
-->
<slot name="footer" />
```

---

### Style: numbered reference blocks + inline comments

Follow the same CSS Full rules:

- **Numbered reference blocks** for rule blocks with multiple non-obvious properties
- **Inline `/* comment */`** on individual non-obvious declarations

```css
    /**
     *  1. Stacks all child elements vertically with consistent spacing.
     *  2. Subtle border using a CSS custom property with a light grey fallback.
     *  3. Rounded corners for a modern card aesthetic.
     */

    .post-card {
        border: 1px solid var(--color-border, #e0e0e0); /* 2 */
        border-radius: 8px;                              /* 3 */
        display: flex;                                   /* 1 */
        flex-direction: column;                          /* 1 */
        gap: 1rem;                                       /* 1 */
        padding: 1.5rem;
    }

    /**
     * Featured variant: replaces the default border with the primary color
     * and adds a soft glow ring to make the card stand out visually.
     */

    .post-card--featured {
        border-color: var(--color-primary, #3b82f6);
        box-shadow: 0 0 0 2px var(--color-primary, #3b82f6); /* Glow ring matching the border */
    }
```
