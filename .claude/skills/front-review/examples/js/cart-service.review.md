## Code Review — cart-service.js

### 🔴 Critical

**[line 6] Async function without error handling — `loadCart`**
Code: `async function loadCart(userId) { const res = await fetch(...) }`
Problem: The function `await`s a `fetch` and parses JSON with no `try/catch`. A network failure or a non-2xx response will throw an unhandled rejection and crash the caller silently.
Fix: Wrap the body in `try/catch`, check `res.ok`, and either return a fallback value or rethrow a typed error.

---

**[line 12] Async function without error handling — `applyPromo`**
Code: `async function applyPromo(cart, code) { const res = await fetch(...) }`
Problem: Same issue as `loadCart` — no error handling on the `fetch` call. An invalid promo code returning a non-2xx status or a network error will produce an unhandled rejection.
Fix: Wrap in `try/catch`. Check `res.ok` before parsing JSON.

---

**[line 38] Dangerous HTML injection — `renderCartSummary`**
Code: `container.innerHTML = html;`
Problem: The HTML string is built by concatenating `cart.items[i].name`, which comes from the server. If any item name contains `<script>` or event attribute payloads, this is an XSS vector.
Fix: Use safe DOM APIs (`createElement`, `textContent`) to build the list, or sanitize the string with DOMPurify before assigning to `innerHTML`.

---

**[line 55] Floating promise — `loadCart(42)`**
Code: `loadCart(42);`
Problem: `loadCart` returns a Promise that is not awaited, chained, or stored. Any error it throws will be silently swallowed as an unhandled rejection.
Fix: Either `await` the call inside an async context, chain `.catch()`, or remove the call if it is dead initialization code.

---

### 🟠 Important

**[line 18] Loose equality comparison**
Code: `if (promo.valid == true)`
Problem: `==` performs type coercion. If `promo.valid` is `1`, `"true"`, or any truthy value it will pass — almost certainly unintentionally.
Fix: Use strict equality: `if (promo.valid === true)`, or simply `if (promo.valid)`.

---

**[line 20] Direct mutation of a parameter — `cart`**
Code: `cart.discount = promo.value;`
Problem: `cart` is received as a function parameter. Mutating it directly produces unexpected side effects for the caller, who may not expect the object to be changed in place.
Fix: Return a new object: `return { ...cart, discount: promo.value, items: updatedItems }`.

---

### 🟡 Minor

**[line 3] `var` declaration — `discount`**
Code: `var discount = 0.15;`
Problem: `var` is function-scoped and hoisted. Here `discount` is also never used anywhere in the file.
Fix: Use `const` for block-scoped constants. Remove the declaration if it is unused (see below).

---

**[line 3] Unused declaration — `discount`**
Code: `var discount = 0.15;`
Problem: `discount` is declared at module level but never referenced.
Fix: Remove it.

---

**[line 24] Magic number**
Code: `item.price * (1 - promo.value)` — the pattern is fine, but `0.15` defined at the top and never used implies a forgotten default discount constant.
Problem: The top-level `discount = 0.15` is a magic value with no named context.
Fix: If a default discount is needed, name it `const DEFAULT_DISCOUNT_RATE = 0.15` and use it explicitly.

---

**[line 47] Commented-out code block**
Code: `// function debugCart(cart) { ... }` (lines 47–51)
Problem: A 5-line commented-out function block left in the file. Version control preserves history.
Fix: Delete the block.

---

### 💡 Suggestion

**[line 3, 26, 30] `var` → `const` / `let`**
Code: `var discount`, `var total`, `var html`, `var i`
Problem: All these `var` declarations can be replaced with `const` or `let` for block scoping and clearer intent.
Fix: Use `const` for values that are not reassigned, `let` for loop counters and accumulators.

---

**[line 26] `.forEach()` or `.reduce()` instead of `for` loop**
Code: `for (var i = 0; i < cart.items.length; i++) { total += ... }`
Problem: The loop computes a sum — a direct use case for `Array.reduce`.
Fix:
```js
const total = cart.items.reduce((sum, item) => sum + item.discountedPrice, 0);
```

---

### Summary

| Severity | Count |
|---|---|
| 🔴 Critical | 4 |
| 🟠 Important | 2 |
| 🟡 Minor | 4 |
| 💡 Suggestion | 2 |
| **Total** | **12** |
