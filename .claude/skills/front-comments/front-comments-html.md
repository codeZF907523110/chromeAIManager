## Level 1: Structure & Section Comments

Apply every rule below. Do not skip any.

### 1. File-level header (above `<!doctype html>`)

A `<!-- -->` block with an emoji and the filename as title, followed by 4–8 lines describing:
- What the page does (landing page, component, layout template…)
- Key head features (SEO setup, social sharing, fonts, structured data…)
- Key body components (web components, major sections…)

```html
<!--
  🌐 index.html: BrowserUX.css Landing Page

  Main entry point for the BrowserUX.css project site.
  Serves as both homepage and feature overview, presenting the library's
  philosophy, install instructions, and full feature breakdown.

  Head:
  - Full SEO setup: title, description, canonical URL, hreflang (en / fr)
  - Social sharing: Open Graph and Twitter Card meta tags
  - Performance-optimized Google Fonts loading (print-swap + noscript fallback)
  - JSON-LD structured data (SoftwareSourceCode schema)

  Body components:
  - <nav-all-component>: global navigation (web component)
  - <browserux-theme-switcher>: light/dark toggle with slotted SVG icons (web component)
  - Hero section with npm install snippet and download CTA
-->
```

### 2. Major section dividers

Use a wide `<!-- ====== -->` divider before `<head>` and `<body>` (placed as the first comment inside the element). Include a `###` heading with an emoji and a short description (3–6 lines) of what the block contains.

```html
<head>

  <!-- ============================================================
   *
   * ### 📋 Head
   *
   * Document metadata, SEO, social sharing, icons, fonts,
   * and structured data. No render-blocking resources except
   * the Google Fonts stylesheet, which is loaded asynchronously
   * via the print-swap technique with a <noscript> fallback.
   *
   * ============================================================ -->
```

```html
<body>

  <!-- ============================================================
   *
   * ### 🏗️ Body
   *
   * Page layout composed of a navigation bar, hero section,
   * three content sections, and a footer. Relies on three
   * custom web components: <nav-all-component>,
   * <browserux-theme-switcher>, and <browserux-share-button>.
   *
   * ============================================================ -->
```

Choose the emoji to match the content (📋 head, 🏗️ body, etc.).

### 3. Sub-section dividers

Within `<head>` and `<body>`, insert a narrower `<!-- ------ -->` divider before each logical group of tags or each major structural block:

```html
<!-- ------------------------------------------------------------
 * ## 🔍 SEO & Canonical
 * ------------------------------------------------------------ -->

<!-- ------------------------------------------------------------
 * ## 📊 Open Graph
 * ------------------------------------------------------------ -->

<!-- ------------------------------------------------------------
 * ## 🧭 Navigation
 *
 * Top navigation bar with the global nav component on the left
 * and links + theme switcher on the right.
 * ------------------------------------------------------------ -->
```

A short description (1–2 lines) is optional for body sections when the purpose is not immediately obvious from the heading alone.

**Head sub-sections to create when present:**
- `## 🔍 SEO & Canonical`: description, canonical, hreflang
- `## 📱 Viewport`
- `## 📊 Open Graph`
- `## 🐦 Twitter Card`
- `## 🎨 Favicons & Theme Color`
- `## 🔤 Web Fonts`
- `## 📐 Structured Data`

**Body sub-sections**: one per major structural block (nav, hero, each content section, footer, scripts).

### 4. Tertiary labels

Within a sub-section that contains multiple distinct groups, add a short `<!-- # Label -->` comment to name each group:

```html
<!-- # Default Favicon (SVG + PNG fallback) -->

<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-48.png" sizes="48x48" type="image/png">

<!-- # Dark Mode Favicon -->

<link rel="icon" href="/favicon-dark.svg" type="image/svg+xml" media="(prefers-color-scheme: dark)">

<!-- # Apple Touch Icon -->

<link rel="apple-touch-icon" href="/icon/apple-touch-icon.png">
```

### 5. Closing tag labels

After the closing tag of every significant container element, add a `<!-- / .selector -->` label. Use the element's class, id, or tag name, whichever is most descriptive:

```html
		</div>
		<!-- / .nav -->

		</section>
		<!-- / .hero -->

		</main>
		<!-- / main.demo -->

	</head>
	<!-- / head -->

	</body>
	<!-- / body -->
```

Apply closing labels to: `</head>`, `</body>`, `</main>`, `</footer>`, each `</section>`, and any `</div>` that acts as a named layout region.

---

## Full: Level 1 + inline attribute & pattern comments

Apply everything from Level 1, then add comments explaining non-obvious attributes, HTML patterns, and web component usage.

### Case 1: Non-obvious attributes

When an attribute's purpose or value is not self-evident, add a short `<!-- comment -->` on the line directly above the element (or the relevant attribute line for multi-line elements). Never place comments inside an opening tag, HTML comments are not valid within tags.

```html
<!-- rel="noopener noreferrer": prevents the new tab from accessing window.opener
     (security) and omits the referrer header (privacy) on external links. -->
<a href="https://github.com/..." rel="noopener noreferrer">Github</a>

<!-- og:type: declares this page as a generic website (vs article, product…) -->
<meta property="og:type" content="website">

<!-- type="module": loads the script as an ES module (deferred by default,
     supports import/export, scoped to the module). -->
<script type="module" src="/src/main.js"></script>
```

Attributes that typically warrant a comment:
- `prefix="og: ..."` on `<html>`
- `loading="eager"` or `loading="lazy"` on images
- `media="(prefers-color-scheme: dark)"` on `<link>`
- `rel="noopener noreferrer"` on external links
- `type="module"` on `<script>`
- `data-*` custom attributes whose purpose is not obvious from the name
- `aria-*` attributes when the role or label relationship is not clear

### Case 2: Complex patterns

When a block of HTML implements a non-obvious technique, add a multi-line `<!-- -->` block above it explaining the pattern, why it is used, and optionally a `@see` reference:

```html
<!--
  # Google Fonts: Async Load (print-swap technique)

  Loads the font stylesheet asynchronously to avoid render-blocking:
  1. media="print" makes the browser load the stylesheet without blocking rendering.
  2. onload="this.media='all'" switches it to apply to all media once loaded,
     activating the font without a page re-render.
  3. The <noscript> fallback provides a standard blocking load for users
     with JavaScript disabled, ensuring the font is still applied.

  @see https://www.filamentgroup.com/lab/load-css-simpler/
-->
<link rel="stylesheet" href="..." media="print" onload="this.media='all'">
<noscript>
  <link rel="stylesheet" href="...">
</noscript>
```

Patterns that typically warrant a block comment:
- Async font loading (print-swap technique + noscript fallback)
- JSON-LD structured data blocks
- Web component usage with named slots
- `<noscript>` fallbacks
- `@starting-style` or other progressive enhancement patterns

### Case 3: Web component documentation

Before each custom web component, add a short `<!-- -->` comment describing its purpose and any slots, CSS custom properties, or attributes it exposes:

```html
<!--
  <browserux-theme-switcher>: web component rendering a light/dark toggle button.
  Accepts two named slots for custom icons:
  - slot="light-icon": icon displayed in light mode
  - slot="dark-icon": icon displayed in dark mode
  SVGs use aria-hidden="true" since the button label is handled by the component.
-->
<browserux-theme-switcher>
  <span slot="light-icon"><svg aria-hidden="true">…</svg></span>
  <span slot="dark-icon"><svg aria-hidden="true">…</svg></span>
</browserux-theme-switcher>
```

### Case 4: JS-powered HTML hooks

When an element relies on JavaScript to be populated or activated at runtime, add a short inline comment explaining the hook:

```html
<!-- data-year: placeholder populated by JS with the current year at runtime -->
<span data-year></span>

<!-- id="npm-code": content read and copied to clipboard by the JS copy handler -->
<code id="npm-code">npm install browserux.css</code>
```
