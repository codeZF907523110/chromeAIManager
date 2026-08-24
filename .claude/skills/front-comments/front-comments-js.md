## Level 1: Structure & JSDoc

Apply every rule below. Do not skip any.

### 1. File-level header (very top, before imports)

A JSDoc block with a `#` heading, an emoji representing the file's purpose, and 4–8 lines describing:
- What the file/component does
- How the main logic works (init, persistence, events…)
- Key features (Shadow DOM, slots, i18n, events…)

```ts
/**
 * # 🌗 browserux-theme-switcher
 *
 * Web component (`<browserux-theme-switcher>`) that renders a toggle switch
 * for switching between `light` and `dark` themes.
 *
 * On load, the theme is resolved from `localStorage`, then from the OS preference
 * (`prefers-color-scheme`). The chosen theme is applied by setting a `data-theme`
 * attribute on `<html>` (or on a custom target via the `target` attribute), and
 * is persisted to `localStorage` on each manual toggle.
 *
 * The component supports Shadow DOM (default) or flat DOM (`no-shadow`),
 * customizable icons via named slots (`light-icon`, `dark-icon`),
 * built-in i18n for the accessible button label (en, fr, es, de, ja, ru, pt, it, nl),
 * and emits a `theme-change` event on every switch.
 */
```

### 2. JSDoc before each import

One short JSDoc block (1–3 lines) per import, placed directly above it. Explain what the import does in context, not just its name.

```ts
/**
 * Automatic image switching based on filename convention:
 * Replaces the `src` of <img class="has-dark"> with a "-dark" variant when the theme is dark.
 * Example: "/img/logo.webp" → "/img/logo-dark.webp"
 */
import { updateImagesByTheme } from "../utils/theme-utils";

/**
 * Manual image switching using explicit attributes:
 * Swaps the `src` of <img class="has-dark"> based on `data-src-light` and `data-src-dark`.
 * Useful when filenames don't follow a "-dark" naming convention.
 */
import { updateThemeImages } from "../utils/theme-image";

/**
 * Imports the strict type definition for valid theme values ('light' | 'dark').
 * Ensures consistent usage and safer theme-related logic across the component.
 */
import type { ThemeMode } from '../types/theme.types';
```

### 3. Section dividers

Before each major logical block (template, constants, class…), insert a section divider with an emoji and a short subtitle:

```ts
// ---------------------------------------------------------------------------- //
//
//  ### 🎨 Template & Styles
//  Shadow DOM template with CSS custom properties for the toggle switch
//
// ---------------------------------------------------------------------------- //
```

Choose the emoji to match the section content (🎨 styles, 🌍 i18n, ⚙️ class/logic, etc.).

### 4. JSDoc before constants and the class

For each top-level `const` and the class itself, add a `/**` block with:
- A `##` heading with an emoji
- A blank line, then a description paragraph
- Structured sections if relevant: `Key properties:`, `Slots:`, `Tip:`, `Usage:`, `Observed attributes:`, etc.
- Bullet list items using backtick formatting: `` - `propName`: description ``

```ts
/**
 * ## 🧩 Component Template
 *
 * Defines the internal HTML structure and scoped styles for the `<browserux-theme-switcher>` web component.
 *
 * CSS custom properties (overridable from outside the component):
 * - `--bux-switch-width`: Total width of the toggle button (default: `40px`)
 * - `--bux-switch-height`: Height of the toggle button (default: `24px`)
 *
 * Slots:
 * - `light-icon`: Custom icon to display on the light side (falls back to ☀️)
 * - `dark-icon`: Custom icon to display on the dark side (falls back to 🌙)
 */
```

### 5. JSDoc before each method

For every class method (public, private, static getter…), add a `/**` block with:
- A `##` heading with an emoji
- A blank line, then a short description of purpose
- A `Responsibilities:` or `Priority:` list when the method does multiple things
- `@param` and `@returns` tags when the signature warrants it

```ts
/**
 * ## 🔌 connectedCallback
 *
 * Lifecycle hook called when the element is inserted into the DOM.
 *
 * Responsibilities:
 * - Attaches a Shadow DOM (or skips it if `no-shadow` is present)
 * - Clones and appends the shared template
 * - Binds the click handler on the toggle button
 * - Initializes the theme from `localStorage` or OS preference
 * - Defers slot fallback rendering to the next animation frame
 */
```

### 6. JSDoc for class properties

Each private or public class property gets a single JSDoc line or short block:

```ts
/** Root node for DOM queries, either the ShadowRoot or the element itself (when `no-shadow` is set). */
private root!: ShadowRoot | HTMLElement;

/** Reference to the internal toggle `<button>` element. */
private button: HTMLButtonElement | null = null;
```

---

## Full: Level 1 + inline line-by-line comments

Apply everything from Level 1, then add inline comments inside every method body.

### Rules for inline comments

- Place a `/** short comment */` on the line directly above (or sometimes same line as) each significant statement.
- For logic that needs more explanation (try/catch, browser-specific workarounds, priority chains), use a multi-line `/** ... */` block above the statement.
- Cover: variable declarations, conditions, return statements, event listeners, attribute reads/writes, DOM queries, dispatch calls, try/catch blocks.
- Be concise: one line is usually enough. Only go multi-line when the *why* is non-obvious.

```ts
connectedCallback(): void {

    /** 
     * Checks whether the element has a 'no-shadow' attribute.
     * If not, the component will use Shadow DOM for encapsulation. 
     */
    const useShadow = !this.hasAttribute('no-shadow');

    /** 
     * If Shadow DOM is used, assign 'this.root' to the shadow root.
     * Otherwise, fall back to using the element itself as the root. 
     */
    this.root = useShadow ? this.attachShadow({ mode: 'open' }) : this;

    /** Clone the static template content (HTML + styles) for this component instance */
    const clone = template.content.cloneNode(true);

    /** Append the cloned content into the rendering root (shadow DOM or light DOM) */
    this.root.appendChild(clone);

    /** Selects the toggle button inside the component */
    this.button = this.root.querySelector('button');

    /** 
     * Attaches a click event listener to the button.
     * The theme toggle handler is bound to the current instance. 
     */
    this.button?.addEventListener('click', this.toggleTheme.bind(this));

    /** Initializes the theme based on user preference or system settings */
    this.initializeTheme();

    /** Injects default emoji icons if no custom slot content is provided */
    requestAnimationFrame(() => this.handleSlotFallbacks());
}
```

Also comment inside try/catch and event callbacks:

```ts
try {
    localStorage.setItem('theme', newTheme);
} catch {
    /** Silently fail, the component still works without persistence */
}

if (!saved) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        /** On change, determine the new system preference and apply it */
        const systemTheme = e.matches ? 'dark' : 'light';
        this.applyTheme(systemTheme);
    });
}
```
