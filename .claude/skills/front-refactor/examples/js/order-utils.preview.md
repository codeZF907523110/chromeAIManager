## Refactoring Preview: order-utils.js

### DEAD: Dead Code Removal

**[line 1] Unused import: `formatDate`**
Before: `import { formatDate } from './date-helpers';`
After:  *(line removed)*
Reason: `formatDate` is never referenced anywhere in the file.

---

**[line 2] Unused import: `logEvent`**
Before: `import { logEvent } from './analytics';`
After:  *(line removed)*
Reason: `logEvent` is never referenced anywhere in the file.

---

**[line 48] Commented-out code block**
Before:
```js
// function debugOrder(order) {
//   console.log('order:', order);
//   console.log('total:', computeTotal(order.items, true));
// }
```
After: *(block removed)*
Reason: Commented-out code adds noise, version control preserves the history.

---

### NAMING: Naming Improvements

**[line 5] Magic number → named constant, `10`**
Before: `var maxItems = 10;`
After:  `const MAX_ITEMS = 10;`
Reason: `10` is a meaningful business limit; naming it `MAX_ITEMS` makes the constraint self-documenting.

---

### SIMPLIFY: Logic Simplification

**[line 12] Redundant comparison to `true`**
Before: `if (applyTax == true)`
After:  `if (applyTax)`
Reason: Comparing a boolean to `true` with loose equality is redundant and potentially coercive.

---

**[line 18] `if/else` assignment → ternary, `getLabel`**
Before:
```js
var label;
if (count > 0) {
  label = 'items in cart';
} else {
  label = 'cart is empty';
}
return label;
```
After:
```js
return count > 0 ? 'items in cart' : 'cart is empty';
```
Reason: The sole purpose of the `if/else` is to assign one of two string values, a ternary with a direct `return` is cleaner and removes the `var` declaration.

---

**[line 27] Deeply nested conditions → guard clauses, `buildSummary`**
Before:
```js
if (order) {
  if (order.items) {
    if (order.items.length > 0) {
      ...
    }
  }
}
return '';
```
After:
```js
if (!order?.items?.length) return '';
...
```
Reason: Three nested guards checking the same happy-path condition can be collapsed into a single early return using optional chaining.

---

**[line 42] `if/else` returning boolean → direct expression, `isValid`**
Before:
```js
if (order.items.length > maxItems) {
  return false;
} else {
  return true;
}
```
After:
```js
return order.items.length <= MAX_ITEMS;
```
Reason: Returning `true`/`false` from an `if/else` is equivalent to returning the boolean expression directly.

---

### MODERN: Syntax Modernisation

**[line 5, 7, 9, 20, 32] `var` → `const` / `let`**
Before: `var maxItems`, `var total`, `var i`, `var label`, `var lines`
After:  `const MAX_ITEMS`, `let total`, `let i`, `const label`, `const lines`
Reason: `var` is function-scoped and hoisted; `const`/`let` provide block scoping and clearer intent.

---

**[line 8] Manual `for` loop → `Array.reduce`**
Before:
```js
for (var i = 0; i < items.length; i++) {
  total = total + items[i].price * items[i].quantity;
}
```
After:
```js
const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
```
Reason: The loop accumulates a sum, the idiomatic modern equivalent is `reduce`.

---

**[line 33] Traditional `function` expression → arrow function**
Before: `order.items.map(function(item) { return ... })`
After:  `order.items.map(item => \`${item.name} x${item.quantity} = ${item.price * item.quantity}${currency}\`)`
Reason: Arrow functions are the standard for callbacks; template literals replace string concatenation.

---

### Summary

| Category | Changes |
|---|---|
| DEAD | 3 |
| NAMING | 1 |
| SIMPLIFY | 4 |
| MODERN | 3 |
| **Total** | **11** |

> Run `/front-refactor apply` to apply all changes.
