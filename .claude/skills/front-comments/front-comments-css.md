## Level 1: Structure & Section Comments

Apply every rule below. Do not skip any.

### 1. File-level header (very top, after the `/*!` banner if present)

A `/** */` block with an emoji and the filename as title, followed by 4–8 lines describing:
- What the file does (reset, component, theme, utilities…)
- The main mechanism (custom properties, media queries, cascade…)
- Key features listed as bullet points

```css
/**
 * 🌐 browserux.css
 *
 * A modern, opinionated CSS foundation that normalizes browser inconsistencies
 * and applies sensible defaults across all elements.
 *
 * Built around CSS custom properties (design tokens) for easy theming,
 * with automatic dark mode support via `prefers-color-scheme`.
 *
 * Key features:
 * - Design tokens via `:root` custom properties for colors, typography, and scrollbar
 * - Automatic dark mode token overrides
 * - Cross-browser scrollbar styling (WebKit + Firefox)
 * - Form UX enhancements: accent color, caret, validation states, placeholder
 * - Print-safe overrides
 */
```

### 2. Major section dividers

Before each top-level logical group (design tokens, browser preferences, resets, print…), insert a wide divider with a `###` heading, an emoji, and a multi-line description (4–10 lines) explaining purpose, structure, and what the section covers.

```css
/* ============================================================================
 *
 * ### 🎨 Design Tokens
 *
 * This section defines the core design tokens used across the application.
 * These tokens act as the single source of truth for visual properties such
 * as colors, typography, spacing, and UI behavior.
 *
 * Tokens are organized by functional categories, including:
 *
 * - 🎨 Colors (base, semantic, and UI accents)
 * - ✅ Form validation states (valid / invalid)
 * - 📊 Progress indicators
 *
 * ============================================================================ */
```

Choose the emoji to match the section content (🎨 tokens, ⚙️ preferences, 🧱 resets, 🖨️ print, etc.).

### 3. Sub-section dividers

Within a major section, before each logical group of rules (e.g. dark mode, focus management, scrollbar styling…), insert a narrower divider with a `##` heading and an emoji:

```css
/* ----------------------------------------------------------------------------
 * ## 🌑 Dark Mode
 * ---------------------------------------------------------------------------- */
```

### 4. Tertiary labels (rule group title)

Before an individual rule block or a small cluster of closely related selectors, add a short `/** */` comment with a `#` heading acting as a label:

```css
/**
 * # Firefox Scrollbar (scrollbar-color)
 */

@supports (-moz-appearance: none) { … }

/**
 * # WebKit Scrollbar (::-webkit-scrollbar)
 */

::-webkit-scrollbar { … }
```

Use this level when a sub-section contains multiple distinct rule groups that benefit from individual naming.

### 5. Inline property group labels inside rule blocks

When a rule block (e.g. `:root`) contains properties organized by category, add a multi-line `/** \n * Category \n */` label above each group. Never use a single-line `/** ... */` for these labels.

**Emoji rule:** property group labels carry an emoji **only** when their containing major section has no sub-section dividers, meaning the labels themselves are the sole structural level inside the section. When sub-section dividers (`## …`) are already present in the section, property group labels have no emoji.

```css
/* Design Tokens section has no sub-section dividers → labels get emojis */
:root {
  /** 
   * 🎨 Color tokens 
   */
  --bux-page-bg: #eaeaea;
  --bux-page-color: #121212;

  /** 
   * ✅ Form validation tokens 
   */
  --bux-valid-border-color: #29b94c;
  --bux-valid-bg-color: #f0fff5;

  /** 
   * 🔤 Typography tokens 
   */
  --bux-typo-font-size: 1.6rem;
  --bux-typo-line-height: 1.6;
}

/* A section that already has sub-section dividers → labels have no emoji */
:root {
  /** 
   * Color tokens 
   */
  --bux-page-bg: #eaeaea;
}
```

---

## Full: Level 1 + explanatory comments on every rule block

Apply everything from Level 1, then add the three types of comments below.

---

### Case 1: CSS custom properties (variables)

For each custom property declaration, add a short `/* description */` inline explaining what it represents or where it is used.

Non-obvious standalone properties inside `:root` (e.g. `color-scheme`, `interpolate-size`) get a multi-line `/** ... */` block placed **above** the declaration instead.

```css
:root {
  /** 
   * 🎨 Color tokens 
   */
  --bux-page-bg: #eaeaea; /* Page background color */
  --bux-page-color: #121212; /* Page text color */
  --bux-color-primary: #f05e0e; /* Primary accent color (buttons, focus rings, range thumbs…) */

  /**
   * Color scheme: tells the browser which themes are supported.
   * Native UI elements will automatically adapt to the active color scheme.
   */
  color-scheme: light dark;
}
```

---

### Case 2: Numbered reference blocks

When a rule block contains multiple properties that each require a non-obvious explanation (browser quirk, spec rationale, vendor prefix, magic number…), use a numbered block comment above the rule, then add a `/* N */` numeric reference inline on each corresponding property.

The block uses `/**` and numbers each item as ` *  1.`, ` *  2.`, etc. (right-aligned numbers for readability). Multiple properties sharing the same rationale share the same number.

```css
/**
 *  1. Improve consistency of default fonts in all browsers.
 *  2. Sets 1rem = 10px: 10/16 × 100 = 62.5%.
 *  3. Ensure the root element covers the full viewport height.
 */

html {
  font-family: var(--bux-typo-font-family); /* 1 */
  font-size: 62.5%; /* 2 */
  min-height: 100%; /* 3 */
}
```

---

### Case 3: Explanatory block before each rule block (dominant pattern)

Before **every** selector or group of closely related selectors, add a `/** */` block explaining:
- What the rule does and why
- Which browser quirk or spec behavior it addresses
- Any `@see` links for references
- Any `@for` notes for browser/OS targets

This applies to all rule blocks throughout the file: standalone selectors, pseudo-elements, `@media` sub-blocks, `@supports` blocks, `@starting-style`, etc.

For **tertiary labels** (`# Title`), the description goes inside the label block itself, below the title:

```css
/**
 * # :focus, Remove Default Outline
 *
 * Removes the browser's default focus outline globally.
 * This is intentional: the outline is replaced by a more controlled
 * `:focus-visible` style below, which only shows for keyboard navigation.
 */

:focus {
  outline: none;
}
```

For rule blocks **inside** `@media` queries, add a `/** */` before each sub-selector group:

```css
@media (prefers-contrast: more) {
  /**
   * Improves visibility of placeholder text and disabled elements.
   * These elements are often too faint in default browser styles.
   */

  ::placeholder {
    color: rgba(16, 16, 16, 0.8);
    opacity: 1;
  }

  /**
   * Reinforces visibility of typographically de-emphasized elements.
   */

  em,
  i,
  small {
    font-weight: bold;
  }
}
```

For **standalone rule blocks** (not inside a tertiary label), add a short description directly above the selector:

```css
/**
 * Ensures SVG fills match the text color for easier theming.
 */

svg {
  fill: currentColor;
}

/**
 * Removes 300ms tap delay on clickable form elements on mobile.
 * @see https://www.sitepoint.com/5-ways-prevent-300ms-click-delay-mobile-devices/
 */

button,
input,
label,
select,
textarea {
  touch-action: manipulation;
}
```

Be concise. 1–3 lines is usually enough. Only go longer when the browser quirk or spec behavior genuinely warrants it.
