# front-review: HTML Rules

Apply all shared rules from `front-review-rules.md`, then apply the rules below.
Applies to `.html` files.

---

## Category A: Document Structure

### HTML-1: Missing or incorrect document boilerplate (🟠 Important)

**Detect:** An HTML file missing any of: `<!DOCTYPE html>`, `<html lang="...">`, `<meta charset="...">`, `<meta name="viewport" content="...">`, or `<title>`.

**Fix:** Add the missing declarations. The `lang` attribute must be a valid BCP 47 language tag (e.g. `en`, `fr`, `en-US`).

```html
<!-- ✅ minimal correct boilerplate -->
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Page Title</title>
  </head>
```

### HTML-2: Inline style (🟡 Minor / 🟠 Important in strict)

**Detect:** A `style="..."` attribute on any element (except generated or programmatic content where inline styles are the only option).

**Fix:** Move the styles to an external stylesheet or a `<style>` block, and target the element with a class.

### HTML-3: Deprecated element or attribute (🟠 Important)

**Detect:** Use of elements or attributes marked as obsolete in HTML5: `<center>`, `<font>`, `<marquee>`, `<blink>`, `<frameset>`, `<frame>`, `bgcolor=`, `border=` on table, `align=`, `valign=`.

**Fix:** Replace with CSS equivalents.

---

## Category B: Semantics

### HTML-4: Div/span used instead of semantic element (🟠 Important)

**Detect:** A `<div>` or `<span>` used where a more specific semantic element exists:
- `<div>` wrapping navigation → `<nav>`
- `<div>` used as a page section header → `<header>` / `<main>` / `<footer>` / `<section>` / `<article>` / `<aside>`
- `<div>` containing a heading sequence → `<article>` or `<section>`
- `<span>` used to bold/emphasize → `<strong>` / `<em>`

**Fix:** Replace with the appropriate semantic element.

### HTML-5: Heading hierarchy broken (🟠 Important)

**Detect:** Heading levels that skip (e.g. `<h1>` followed directly by `<h3>`), or multiple `<h1>` elements on the same page (outside of `<article>` / `<section>` contexts).

**Fix:** Maintain a logical heading order. Use only one `<h1>` per page (or per sectioning root). Do not use headings for visual sizing, use CSS.

### HTML-6: Interactive content in a non-interactive element (🔴 Critical)

**Detect:** An `<a>` inside another `<a>`, a `<button>` inside a `<button>`, or block-level elements (`<div>`, `<p>`, `<ul>`) inside an `<a>` or `<button>`.

**Fix:** Restructure the markup. Nest only phrasing content inside `<a>` and `<button>`. Use `display: block` on `<a>` to make it cover a block area without nesting block elements.

---

## Category C: Performance & Loading

### HTML-7: Render-blocking resource without async/defer (🟠 Important)

**Detect:** A `<script src="...">` in the `<head>` without `async` or `defer` attribute, on a script that is not required before first paint.

**Fix:** Add `defer` (preserves execution order) or `async` (unordered, for independent scripts). Or move the `<script>` to before `</body>`.

### HTML-8: Image without explicit dimensions (🟡 Minor)

**Detect:** An `<img>` without both `width` and `height` attributes (or CSS equivalents that establish aspect ratio).

**Fix:** Add `width` and `height` attributes matching the image's intrinsic size, or set `aspect-ratio` in CSS. This prevents Cumulative Layout Shift (CLS).

### HTML-9: Missing resource hint for critical assets (💡 Suggestion)

**Detect:** A page that loads a large font, hero image, or critical CSS file without a `<link rel="preload">` or `<link rel="preconnect">` hint.

**Fix:** Add `<link rel="preload" as="font|image|style">` for the most critical above-the-fold resources.

---

## Category D: Security

### HTML-10: `target="_blank"` without `rel="noopener"` (🟠 Important)

**Detect:** An `<a target="_blank">` that does not include `rel="noopener noreferrer"`.

**Fix:** Add `rel="noopener noreferrer"` to prevent the opened page from accessing `window.opener` and to avoid Referer header leakage.

```html
<!-- ❌ -->
<a href="https://example.com" target="_blank">Link</a>

<!-- ✅ -->
<a href="https://example.com" target="_blank" rel="noopener noreferrer">Link</a>
```

### HTML-11: Form without CSRF protection hint (🟡 Minor)

**Detect:** A `<form method="post">` with no hidden CSRF token field and no `action` pointing to an API that handles CSRF via headers.

**Fix:** Ensure the backend uses CSRF tokens or SameSite cookies. Add a note in the template if CSRF is handled at the framework level (e.g. Django, Rails).

---

## Strict mode: HTML additional overrides

| Rule | Standard | Strict |
|---|---|---|
| HTML-2 Inline style | 🟡 Minor | 🟠 Important |
