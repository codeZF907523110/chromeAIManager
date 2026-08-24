## Code Review: dashboard.css

### 🔴 Critical

**[line 32] Missing focus style replacement**
Code: `.btn-primary:focus { outline: none; }`
Problem: The default browser focus ring is removed with no replacement indicator. Keyboard users and assistive technology users will have no visible cue when the button is focused. This is both an accessibility blocker and a functional regression.
Fix: Replace with a custom focus style using `:focus-visible`:
```css
.btn-primary:focus-visible {
  outline: 2px solid var(--color-focus, #3a7bd5);
  outline-offset: 2px;
}
```

---

### 🟠 Important

**[line 3] Overly specific selector**
Code: `#main-content .sidebar ul li a.active`
Problem: This selector chains an ID with 4 descendant segments, producing an extremely high specificity score `(1, 2, 2)`. It is nearly impossible to override without another `!important` or equally specific selector, and it tightly couples the style to the exact DOM structure.
Fix: Use a dedicated class: `.nav__link--active { color: var(--color-primary); }`

---

**[line 27] `!important` misuse**
Code: `.btn-primary { background-color: #3a7bd5 !important; color: #fff !important; }`
Problem: `.btn-primary` is a normal component class, there is no cascade conflict that would justify `!important`. Its use here will make theming and state overrides (`:hover`, `:disabled`) harder.
Fix: Remove `!important`. Adjust the selector specificity or rule order so the rule wins naturally.

---

**[line 29] Vendor prefix without standard equivalent**
Code: `-webkit-border-radius: 4px; -moz-border-radius: 4px;`
Problem: `border-radius` has been universally supported without prefixes since 2012. The prefixed variants are dead weight.
Fix: Remove `-webkit-border-radius` and `-moz-border-radius`. Keep only `border-radius: 4px;`.

---

**[line 37] Universal selector on a compound rule**
Code: `.stats-grid * { box-sizing: border-box; }`
Problem: The universal descendant selector forces the browser to evaluate every node inside `.stats-grid` against this rule. For large component trees this can slow down style recalculation.
Fix: If `box-sizing: border-box` is not already set globally (e.g. via a reset), apply it at the root: `*, *::before, *::after { box-sizing: border-box; }`. Do not scope it to a component.

---

**[line 42] Layout-triggering property in `transition`**
Code: `.chart-wrapper { transition: width 0.3s ease; }`
Problem: Transitioning `width` triggers layout recalculation on every frame of the animation, forcing the browser off the GPU-composited path. This causes jank, especially on lower-end devices.
Fix: If the visual goal is a reveal or resize effect, use `transform: scaleX()` instead, or `max-width` with `overflow: hidden` as a compromise.

---

**[line 46] `@import` inside stylesheet**
Code: `@import url('https://fonts.googleapis.com/...')`
Problem: CSS `@import` is render-blocking and sequential, the browser must finish downloading this file before it can parse the rest of the stylesheet. It also appears after other rules, which browsers may ignore or handle inconsistently.
Fix: Move font loading to a `<link rel="preconnect">` + `<link rel="stylesheet">` in the HTML `<head>`, ideally with `font-display: swap` in the `@font-face` declaration.

---

### 🟡 Minor

**[line 3] Hardcoded color: `#3a7bd5`**
Code: `color: #3a7bd5;` (also lines 27, 51)
Problem: The primary blue `#3a7bd5` appears 3 times across the file as a raw hex value. Any palette change requires a search-and-replace.
Fix: Extract to a CSS custom property: `--color-primary: #3a7bd5;` in `:root`, then use `var(--color-primary)`.

---

**[line 9] Magic values: `8px`, `24px`**
Code: `border-radius: 8px; padding: 24px; margin-bottom: 24px;`
Problem: These spacing and radius values are hardcoded. If the design system changes its spacing scale, each value must be hunted down individually.
Fix: Replace with design tokens: `var(--radius-card)`, `var(--spacing-6)`.

---

**[line 19] Unitless zero with unit: `0px`**
Code: `margin-bottom: 0px;`
Problem: The unit on `0` is unnecessary: `0` is always dimensionless.
Fix: `margin-bottom: 0;`

---

**[line 21] Duplicate rule: `.card .title`**
Code: `.card .title { font-size: 18px; ... }` then `.card .title { font-weight: 600; }` (lines 15 and 21)
Problem: The same selector is declared twice. The second block could be merged into the first.
Fix: Merge both declarations into a single `.card .title { ... }` rule.

---

### Summary

| Severity | Count |
|---|---|
| 🔴 Critical | 1 |
| 🟠 Important | 5 |
| 🟡 Minor | 4 |
| 💡 Suggestion | 0 |
| **Total** | **10** |
