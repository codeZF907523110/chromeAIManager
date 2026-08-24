# front-refactor: CSS / Sass / SCSS Rules

Apply all shared rules from `front-refactor-rules.md`, then apply the rules below.
Applies to `.css`, `.sass`, `.scss` files.

For `.scss` and `.sass` files, also apply the Sass-specific rules at the bottom of this file.

---

## Category DEAD

### CSS-DEAD-1: Duplicate rule block

**Detect:** The same selector declared more than once in the file. The second (or later) block either overrides or duplicates properties from the first.

**Fix:** Merge all declarations for that selector into a single block. When properties conflict, keep the last-declared value (which is what the browser applies) and discard the earlier one.

### CSS-DEAD-2: Property overridden in the same rule

**Detect:** The same property declared twice within a single rule block.

**Fix:** Remove the first (overridden) declaration.

```css
/* Before */
.card {
  color: red;
  padding: 16px;
  color: blue;
}

/* After */
.card {
  padding: 16px;
  color: blue;
}
```

### CSS-DEAD-3: Unitless zero with unit

**Detect:** `0px`, `0em`, `0rem`, `0%`, any zero value with a unit.

**Fix:** Replace with `0`.

### CSS-DEAD-4: Vendor prefix for fully supported property

**Detect:** `-webkit-`, `-moz-`, or `-ms-` prefixes on properties that have been universally supported without a prefix for 5+ years: `border-radius`, `box-shadow`, `transition`, `transform`, `animation`, `flex`, `gradient` syntax.

**Fix:** Remove the prefixed declarations. Keep only the standard property.

---

## Category NAMING

### CSS-NAMING-1: Hardcoded color → custom property

**Detect:** A color defined as a hex, rgb, hsl, or named value used more than once across the file, or used in a component rule (not a `:root` token block).

**Fix:** Extract to a CSS custom property in `:root` (or at the top of the file if no `:root` exists), then replace all occurrences with `var(--property-name)`.

```css
/* Before */
.btn { background: #3a7bd5; }
.link { color: #3a7bd5; }

/* After */
:root { --color-primary: #3a7bd5; }
.btn { background: var(--color-primary); }
.link { color: var(--color-primary); }
```

### CSS-NAMING-2: Magic spacing/size value → custom property

**Detect:** A numeric spacing, size, or radius value (e.g. `24px`, `8px`, `4px`) used more than once across the file.

**Fix:** Extract to a CSS custom property in `:root`.

---

## Category SIMPLIFY

### CSS-SIMPLIFY-1: Overly specific selector

**Detect:** A selector that chains more than 3 class/element/attribute segments, or uses an ID selector for styling purposes.

**Fix:** Flatten to a single class or BEM modifier. If an ID is used, replace with a class equivalent.

```css
/* Before */
#sidebar .nav ul li a.active { color: red; }

/* After */
.nav__link--active { color: red; }
```

> Note: Only apply this simplification when the shortened selector would still be unambiguous in context. Do not flatten selectors that rely on the cascade for intentional overrides.

### CSS-SIMPLIFY-2: Longhand properties replaceable with shorthand

**Detect:** Three or more longhand properties that together form a valid shorthand (`margin-top` + `margin-right` + `margin-bottom` + `margin-left`, `padding-*`, `border-*`, `background-*`, `font-*`, `transition-*`).

**Fix:** Combine into the shorthand form.

```css
/* Before */
.box {
  margin-top: 16px;
  margin-right: 8px;
  margin-bottom: 16px;
  margin-left: 8px;
}

/* After */
.box {
  margin: 16px 8px;
}
```

### CSS-SIMPLIFY-3: `!important` removable by restructuring

**Detect:** An `!important` declaration on a component class (not a utility class) where removing it and adjusting selector order or specificity would produce the same result.

**Fix:** Remove `!important` and reorder the rules or reduce the specificity of the conflicting rule. If the conflict cannot be resolved within this file alone, flag in Notes.

---

## Category MODERN

### CSS-MODERN-1: `@import` → note for `<link>` migration

**Detect:** CSS `@import` used inside a non-Sass stylesheet.

**Fix (Notes only):** `@import` is render-blocking. Recommend moving to `<link rel="stylesheet">` in HTML or using a build tool for bundling. Do not rewrite automatically, this requires HTML changes.

### CSS-MODERN-2: Transition on layout property → `transform`

**Detect:** `transition` targeting `width`, `height`, `top`, `left`, `margin`, or `padding`.

**Fix (Preview only):** Flag as a candidate for `transform`-based animation. Do not apply automatically, requires redesigning the animation logic.

---

## Sass-specific rules (`.scss` / `.sass` only)

### SASS-DEAD-1: Unused Sass variable

**Detect:** A `$variable` declared but never referenced in the file.

**Fix:** Remove the declaration.

### SASS-DEAD-2: `@import` → `@use`

**Detect:** Sass `@import` directive (deprecated).

**Fix:** Replace with `@use 'module' as name`. If the imported file uses global variables that are referenced without a namespace, add the namespace and update references within the file. Flag cross-file impacts in Notes.

### SASS-SIMPLIFY-1: Reduce nesting depth

**Detect:** Sass selector nesting deeper than 3 levels.

**Fix:** Flatten using BEM modifiers or dedicated classes. Extract the deeply nested rule to the file's top level.

```scss
// Before
.nav {
  .list {
    .item {
      .link { color: red; }
    }
  }
}

// After
.nav__link { color: red; }
```

### SASS-SIMPLIFY-2: `@extend` on a non-placeholder selector

**Detect:** `@extend .some-class` (extending a real class rather than a `%placeholder`).

**Fix:** Replace with a `@mixin` / `@include` pair, or with a shared placeholder `%name` if the pattern is used across multiple selectors in the same file.
