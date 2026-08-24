# front-review: CSS / Sass / SCSS Rules

Apply all shared rules from `front-review-rules.md`, then apply the rules below.
Applies to `.css`, `.sass`, `.scss` files.

For `.scss` and `.sass` files, also apply the Sass-specific rules at the bottom of this file.

---

## Category A: Specificity & Cascade

### CSS-1: Overly specific selector (🟠 Important)

**Detect:** A selector whose specificity score exceeds `(0, 3, 0)`, i.e. more than 3 class/attribute/pseudo-class segments, or any use of an ID selector (`#id`) for styling.

**Fix:** Flatten the selector. Use a dedicated class, BEM modifier, or CSS custom property to target the element instead of chaining multiple ancestors.

```css
/* ❌ */
#sidebar .nav ul li a.active { color: red; }

/* ✅ */
.nav__link--active { color: red; }
```

### CSS-2: `!important` usage (🟠 Important / 🔴 Critical in strict)

**Detect:** Any use of `!important` outside of a utility class context or a browser-reset stylesheet.

**Fix:** Refactor the cascade so the rule wins naturally. If `!important` is inside a utility class (e.g. `.u-hidden { display: none !important; }`), it is acceptable, add a comment explaining why.

### CSS-3: Redundant or duplicate rule (🟡 Minor)

**Detect:** The same property declared more than once on the same selector, or a rule that has no visual effect because it is overridden immediately by a rule lower in the file.

**Fix:** Remove the redundant declaration.

---

## Category B: Values & Units

### CSS-4: Magic value (🟡 Minor / 🟠 Important in strict)

**Detect:** A hardcoded numeric value (other than `0`, `1`, `100%`, `50%`) or an arbitrary color hex/rgb used outside a design-token file, whose meaning is not immediately obvious from context.

**Fix:** Replace with a CSS custom property (design token) or add a comment explaining the value.

```css
/* ❌ */
margin-top: 24px;
color: #3a7bd5;

/* ✅ */
margin-top: var(--spacing-6);
color: var(--color-primary);
```

### CSS-5: Unitless zero or missing unit (🟡 Minor)

**Detect:** A value of `0` followed by a unit (`0px`, `0em`, `0rem`). Unitless `0` is always preferred.

**Fix:** Remove the unit: `0px` → `0`.

### CSS-6: Vendor prefix without unprefixed fallback (🟠 Important)

**Detect:** A vendor-prefixed property (`-webkit-`, `-moz-`, `-ms-`) without its unprefixed equivalent declared in the same rule.

**Fix:** Add the standard unprefixed property after the prefixed one (or remove the prefix if the property is now universally supported).

---

## Category C: Performance

### CSS-7: Universal selector in a compound rule (🟠 Important)

**Detect:** A `*` selector that is not at the root level, e.g. `.container *`, `section > *`. This forces the browser to match every descendant.

**Fix:** Replace with a more targeted selector, or restructure the component to not require blanket descent.

### CSS-8: Expensive property animated or transitioned (🟠 Important)

**Detect:** A `transition` or `animation` that targets `width`, `height`, `top`, `left`, `margin`, `padding`, or other layout-triggering properties.

**Fix:** Use `transform` and `opacity` instead, they are composited by the GPU and do not trigger layout.

```css
/* ❌ */
.box { transition: width 0.3s ease; }

/* ✅ */
.box { transition: transform 0.3s ease; }
```

### CSS-9: `@import` inside stylesheet (🟠 Important)

**Detect:** `@import` used inside a CSS file (other than a Sass partial entry point). CSS `@import` is render-blocking and sequential.

**Fix:** Use `<link>` tags in HTML, or bundle via a build tool. In Sass, `@use` / `@forward` replace `@import`.

---

## Category D: Maintainability

### CSS-10: Missing `:focus-visible` or `:focus` style (🔴 Critical)

**Detect:** A rule that sets `outline: none` or `outline: 0` on an interactive element (`:focus`, `:focus-visible`) without providing a replacement focus indicator.

**Fix:** Always provide a visible focus style. Removing the default outline without replacing it breaks keyboard accessibility.

```css
/* ❌ */
button:focus { outline: none; }

/* ✅ */
button:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
```

### CSS-11: Hardcoded color not using design token (🟡 Minor / 🟠 Important in strict)

**Detect:** A color defined as a hex, rgb, hsl, or named value (`red`, `blue`…) anywhere outside of a `:root` / `@layer base` token declaration block.

**Fix:** Extract to a CSS custom property and use `var(--token-name)`.

### CSS-12: Property incompatible with targeted context (🟡 Minor)

**Detect:** Applying block-layout properties (`width`, `height`, `margin-top`) to inline elements, or using `z-index` on a non-positioned element.

**Fix:** Add the appropriate `display` or `position` declaration, or use a layout-compatible property.

---

## Sass-specific rules (`.scss` / `.sass` only)

### SASS-1: Nesting depth exceeding 3 levels (🟠 Important / 🔴 Critical in strict)

**Detect:** Sass/SCSS selector nesting deeper than **3 levels** (standard) or **2 levels** (strict).

**Fix:** Flatten nesting using BEM modifiers or dedicated classes. Deep nesting generates high-specificity selectors and tightly couples structure to styles.

```scss
// ❌ (4 levels)
.nav {
  .list {
    .item {
      .link { color: red; }
    }
  }
}

// ✅
.nav__link { color: red; }
```

### SASS-2: `@extend` used across unrelated selectors (🟠 Important)

**Detect:** `@extend` used on a class that is not a placeholder (`%`) or that is defined in a different partial/module.

**Fix:** Use a mixin (`@mixin` / `@include`) instead. `@extend` can produce unexpected selector combinations and breaks across modules.

### SASS-3: `@import` instead of `@use` / `@forward` (🟠 Important)

**Detect:** Sass `@import` directive in a `.scss` / `.sass` file. Sass `@import` is deprecated.

**Fix:** Replace with `@use` (for consuming a module) or `@forward` (for re-exporting). Namespace the imported members to avoid global leaks.

```scss
// ❌
@import 'variables';

// ✅
@use 'variables' as vars;
```

### SASS-4: Hardcoded value instead of Sass variable or token (🟡 Minor)

**Detect:** A hardcoded color, spacing, or size value used inside a rule that could reference an existing `$variable` or CSS custom property already defined in the codebase.

**Fix:** Replace with the appropriate `$variable` or `var(--token)`.

---

## Strict mode: CSS/Sass additional overrides

| Rule | Standard | Strict |
|---|---|---|
| CSS-2 `!important` | 🟠 Important | 🔴 Critical |
| CSS-4 Magic value | 🟡 Minor | 🟠 Important |
| CSS-11 Hardcoded color | 🟡 Minor | 🟠 Important |
| SASS-1 Nesting depth | 3 levels / 🟠 Important | 2 levels / 🔴 Critical |
