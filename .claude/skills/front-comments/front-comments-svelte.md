## Level 1: Structure & Block Comments

Apply every rule below. Do not skip any.

A Svelte SFC has three distinct blocks. Each uses its own native comment syntax:
- `<script>` → `/** */` (JavaScript)
- Template (HTML between `<script>` and `<style>`) → `<!-- -->` (HTML)
- `<style>` → `/* */` (CSS)

---

### 1. File-level header (above `<script>`)

A `<!-- -->` block using `*` prefixes on each line, with an emoji and the component name as title, followed by:
- 3–6 lines describing what the component does, how it works, and its UX role
- Structured fields: `Props:`, `Emits:`, `Dependencies:`

```html
<!--
 * 🔢 Counter.svelte
 *
 * A configurable counter component with a progress bar, step history,
 * and persistence via localStorage.
 *
 * Increments a count up to a configurable maximum and tracks each step in a
 * history list. The current value is persisted across page loads.
 * The progress bar and maximum warning update reactively via `$:` declarations.
 *
 * Props: label, max
 * Emits: none
 * Dependencies: svelte (onMount)
-->
```

---

### 2. Script block header

At the very top of `<script>`, before imports, add a JSDoc block with:
- An emoji and "Script block" as the title
- 2–3 lines summarizing what the script does at a high level

```js
<script>
    /**
     * 🧩 Script block
     *
     * Manages counter state, reactive derived values, localStorage persistence,
     * and user interaction handlers (increment and reset).
     */

    import { onMount } from 'svelte';
```

---

### 3. JSDoc before each prop, reactive variable, reactive declaration, lifecycle hook, and function

For every `export let` (prop), `let` (reactive state), `$:` (reactive declaration), lifecycle hook (`onMount`, `onDestroy`…), and function, add a `/**` block with:
- A `##` heading with an emoji
- No description paragraph at Level 1, the heading alone is sufficient

```js
    /**
     * ## 🏷️ Props
     */
    export let label = 'Counter';
    export let max = 10;

    /**
     * ## 🔢 Counter State
     */
    let count = 0;

    /**
     * ## 📜 Step History
     */
    let history = [];

    /**
     * ## ⚡ Reactive Declarations
     */
    $: isMaxReached = count >= max;
    $: progressPercent = Math.round((count / max) * 100);

    /**
     * ## 🚀 onMount : Restore Persisted Value
     */
    onMount(() => {
        count = parseInt(localStorage.getItem('counter') ?? '0');
    });

    /**
     * ## ➕ increment
     */
    function increment() { … }

    /**
     * ## 🔄 reset
     */
    function reset() { … }
```

Group consecutive `export let` props under a single `## 🏷️ Props` heading.
Group consecutive `$:` declarations under a single `## ⚡ Reactive Declarations` heading.

---

### 4. Template: notable element comments

Add a `<!-- short comment -->` above elements that carry non-obvious logic (reactive bindings, directives, conditional blocks…). Keep it to one line when possible.

```html
<!-- Progress bar, width driven by the progressPercent reactive declaration -->
<div class="counter__progress">
    <div class="counter__bar" style="width: {progressPercent}%"></div>
</div>

<!-- Shown only when the counter reaches the max prop value -->
{#if isMaxReached}
    <p class="counter__max-msg">Maximum reached!</p>
{/if}

<!-- Disabled when isMaxReached to prevent exceeding the max -->
<button on:click={increment} disabled={isMaxReached}>+1</button>

<!-- Renders the history list only after at least one increment -->
{#if history.length > 0}
    <ul class="counter__history">
        {#each history as step, i}
            <li>Step {i + 1} → {step}</li>
        {/each}
    </ul>
{/if}
```

---

### 5. Style: section dividers

Within `<style>`, use CSS sub-section dividers to separate logical groups:

```css
<style>

    /* ------------------------------------------------------------
     * ## 🔢 Counter Layout
     * ------------------------------------------------------------ */

    .counter { … }

    /* ------------------------------------------------------------
     * ## 📊 Progress Bar
     * ------------------------------------------------------------ */

    .counter__progress { … }
    .counter__bar { … }

</style>
```

---

## Full: Level 1 + inline comments on every block

Apply everything from Level 1, then add the additions below for each block.

---

### Script, JSDoc before each import

At Full level, add a JSDoc block before each import explaining what is imported and why it is used in this specific context:

```js
    /**
     * `onMount`: lifecycle hook that runs once after the component is first rendered.
     * Used here to restore the persisted counter value from localStorage.
     */
    import { onMount } from 'svelte';
```

---

### Script, expanded JSDoc + inline comments

At Full level, the `##` heading for each prop, reactive variable, reactive declaration, lifecycle hook, and function gets a description paragraph. Inline `/** */` comments are added inside function and hook bodies:

```js
    /**
     * ## 🏷️ Props
     *
     * Configurable inputs passed by the parent component.
     * Both have defaults so the component works standalone without any props.
     */
    export let label = 'Counter';  /** Display label rendered in the heading */
    export let max = 10;           /** Upper bound, increments are blocked once reached */

    /**
     * ## ⚡ Reactive Declarations
     *
     * `$:` statements re-evaluate automatically whenever their dependencies change.
     * Both derived values update in sync with `count` and `max`.
     */
    $: isMaxReached = count >= max;                          /** True when count hits the max prop */
    $: progressPercent = Math.round((count / max) * 100);   /** Percentage for the progress bar width */

    /**
     * ## ➕ increment
     *
     * Increases the counter by one, appends the new value to the history,
     * and persists the updated count to localStorage.
     * Exits early if the maximum has already been reached.
     */
    function increment() {
        /** Guard: prevent incrementing beyond the max prop */
        if (isMaxReached) return;

        count++;

        /** Reassign with spread to trigger Svelte's array reactivity */
        history = [...history, count];

        /** Persist the new count so it survives page reloads */
        localStorage.setItem('counter', count);
    }
```

---

### Template: directive explanations

For each non-trivial Svelte directive or block (`{#if}`, `{#each}`, `on:event`, reactive bindings…), replace the short Level 1 comment with a multi-line `<!-- -->` block explaining what it does and why:

```html
<!--
  style="width: {progressPercent}%": Svelte reactive inline style binding,
  re-evaluates and updates the DOM attribute whenever progressPercent changes.
-->
<div class="counter__progress">
    <div class="counter__bar" style="width: {progressPercent}%"></div>
</div>

<!--
  {#if isMaxReached}: conditionally renders the warning message.
  The block is removed from the DOM entirely when false, no hidden element.
-->
{#if isMaxReached}
    <p class="counter__max-msg">Maximum reached!</p>
{/if}

<!--
  on:click={increment}: Svelte event directive, calls increment on every click.
  disabled={isMaxReached}: native HTML attribute bound to the reactive declaration,
  preventing interaction once the maximum is reached.
-->
<button on:click={increment} disabled={isMaxReached}>+1</button>

<!--
  {#each history as step, i}: iterates over the history array.
  `i` provides a 0-based index used to display a human-readable step number.
-->
{#each history as step, i}
    <li>Step {i + 1} → {step}</li>
{/each}
```

---

### Style: numbered reference blocks + inline comments

Follow the same CSS Full rules:

- **Numbered reference blocks** for rule blocks with multiple non-obvious properties
- **Inline `/* comment */`** on individual non-obvious declarations

```css
    /**
     *  1. Uses a CSS custom property with a blue fallback, overridable from outside.
     *  2. Smooth width animation as the count increases.
     */

    .counter__bar {
        background: var(--color-primary, #3b82f6); /* 1 */
        height: 100%;
        transition: width 0.3s ease;               /* 2 */
    }

    /**
     * Visual and interaction feedback when the button is disabled,
     * prevents any confusion about why clicks have no effect.
     */

    .counter__actions button:disabled {
        cursor: not-allowed; /* Signals to the user that the action is unavailable */
        opacity: 0.5;        /* Dims the button to reinforce the disabled state */
    }
```
