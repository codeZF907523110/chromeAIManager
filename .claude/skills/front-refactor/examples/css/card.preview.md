## Refactoring Preview: card.css

### DEAD: Dead Code Removal

**[line 8–9] Vendor prefixes for fully supported property: `border-radius`**
Before:
```css
-webkit-border-radius: 8px;
-moz-border-radius: 8px;
```
After: *(lines removed)*
Reason: `border-radius` has been universally supported without prefixes since 2012, the prefixed declarations are dead weight.

---

**[line 10] Unitless zero with unit**
Before: `box-shadow: 0px 4px 12px rgba(0,0,0,0.08);`
After:  `box-shadow: 0 4px 12px rgba(0,0,0,0.08);`
Reason: `0` is always dimensionless, the `px` unit is unnecessary and non-idiomatic.

---

**[line 13–20] Duplicate selector: `.card .title`**
Before: Two separate `.card .title { ... }` blocks (lines 13 and 17).
After:
```css
.card .title {
  font-size: 18px;
  color: #1a1a2e;
  font-weight: 600;
  margin-bottom: 0;
}
```
Reason: The same selector is declared twice. Merging eliminates redundancy and makes the full rule visible at a glance. Also fixes `margin-bottom: 0px` → `margin-bottom: 0`.

---

**[line 22] Unitless zero with unit: `margin-bottom: 0px`**
Before: `margin-bottom: 0px;`
After:  `margin-bottom: 0;`
Reason: Unitless zero is always correct and preferred.

---

### NAMING: Naming Improvements

**[line 1, 32, 37] Repeated hardcoded color `#1a1a2e` → custom property**
Before: `color: #1a1a2e;` (lines 15, 32)
After:
```css
:root {
  --color-text: #1a1a2e;
  --color-primary: #3a7bd5;
  --color-white: #ffffff;
  --color-border: #e0e0e0;
  --radius-card: 8px;
  --spacing-6: 24px;
}
```
Then: `color: var(--color-text);`, `background: var(--color-primary);`, etc.
Reason: `#1a1a2e` appears twice, `#3a7bd5` appears twice, and `24px` appears three times. Extracting to custom properties makes the design system explicit and centralises future changes.

---

### SIMPLIFY: Logic Simplification

**[line 23–26] Padding longhands → shorthand**
Before:
```css
padding-top: 4px;
padding-right: 8px;
padding-bottom: 4px;
padding-left: 8px;
```
After: `padding: 4px 8px;`
Reason: Four longhand padding declarations with two unique values can be expressed as a single shorthand.

---

### Summary

| Category | Changes |
|---|---|
| DEAD | 4 |
| NAMING | 1 |
| SIMPLIFY | 1 |
| MODERN | 0 |
| **Total** | **6** |

> Run `/front-refactor apply` to apply all changes.
