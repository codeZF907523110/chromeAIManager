## Level 1: Structure & Block Comments

Apply every rule below. Do not skip any.

A Vue SFC has three distinct blocks. Each uses its own native comment syntax:
- `<template>` → `<!-- -->` (HTML)
- `<script setup>` → `/** */` (JavaScript)
- `<style scoped>` → `/* */` (CSS)

---

### 1. File-level header (above `<template>`)

A `<!-- -->` block using `*` prefixes on each line, with an emoji and the component name as title, followed by:
- 3–6 lines describing what the component does, how it works, and its UX role
- A reference to external style dependencies if relevant
- Structured fields: `Props:`, `Emits:`, `Dependencies:`

```html
<!--
 * 🔄 NavigateLoader.vue
 *
 * A lightweight Vue 3 component that displays a top loading bar
 * during route transitions using Vue Router's navigation guards.
 *
 * This loader provides visual feedback for page-to-page navigation
 * and enhances perceived performance in single-page applications (SPAs).
 *
 * The bar appears only during navigation and animates horizontally.
 * CSS animation is handled inline with scoped styles.
 *
 * Styling uses CSS variables from:
 * `/src/styles/browserux.css`
 *
 * Props: none
 * Emits: none
 * Dependencies: vue-router
-->
```

---

### 2. Template: notable element comments

Add a `<!-- short comment -->` above elements that carry non-obvious logic (directives, roles, dynamic classes…). Keep it to one line when possible.

```html
<template>

    <!-- Renders only during active route transitions -->
    <div v-if="isNavigating" class="navigateLoader" />

</template>
```

---

### 3. Script block header

At the very top of `<script setup>`, before imports, add a JSDoc block with:
- An emoji and "Script block (Composition API)" as the title
- 2–3 lines summarizing what the script does at a high level

```js
<script setup>

    /**
     * 🧩 Script block (Composition API)
     *
     * Watches Vue Router navigation events to toggle a loading indicator.
     * The `beforeEach` hook activates the loader, while `afterEach`
     * deactivates it after a short delay to smooth transitions.
     */

    import { ref } from 'vue';
    import { useRouter } from 'vue-router';
```

---

### 4. JSDoc before each reactive state, composable, and hook

For every `ref`, `reactive`, `computed`, composable call, and navigation/lifecycle hook, add a `/**` block with:
- A `##` heading with an emoji
- No description paragraph at Level 1, the heading alone is sufficient

```js
    /**
     * ## 🔄 Navigation State
     */
    const isNavigating = ref(false);

    /**
     * ## 🧭 Router Instance
     */
    const router = useRouter();

    /**
     * ## ▶️ beforeEach : Show Loader
     */
    router.beforeEach(() => {
        isNavigating.value = true;
    });

    /**
     * ## ⏹️ afterEach : Hide Loader
     */
    router.afterEach(() => {
        setTimeout(() => {
            isNavigating.value = false;
        }, 300);
    });
```

---

### 5. Style, section dividers

Within `<style scoped>`, use CSS sub-section dividers (`/* ------ */`) to separate logical groups (component styles, keyframes, responsive overrides…):

```css
<style scoped>

    /* ------------------------------------------------------------
     * ## 🔄 Loader Bar
     * ------------------------------------------------------------ */

    .navigateLoader { … }

    /* ------------------------------------------------------------
     * ## 🎬 Keyframe Animation
     * ------------------------------------------------------------ */

    @keyframes loaderBar { … }

</style>
```

---

## Full: Level 1 + inline comments on every block

Apply everything from Level 1, then add the additions below for each block.

---

### Template: directive explanations

For each non-trivial Vue directive (`v-if`, `v-for`, `v-model`, `v-bind`, `@event`…), add a `<!-- -->` block above the element explaining what the directive does and why it was chosen:

```html
<template>

    <!--
      v-if: conditionally renders the bar, removes it from the DOM when false,
      so no invisible element takes space or intercepts pointer events.
    -->
    <div v-if="isNavigating" class="navigateLoader" />

</template>
```

---

### Script, JSDoc before each import

At Full level, add a JSDoc block before each import explaining what is imported and why it is used in this specific context:

```js
    /**
     * `ref`: creates a reactive reference wrapping a single primitive boolean.
     * Preferred over `reactive` for scalar values.
     */
    import { ref } from 'vue';

    /**
     * `useRouter`: composable providing access to the global Vue Router instance.
     * Used here to register navigation guards outside of a component lifecycle hook.
     */
    import { useRouter } from 'vue-router';
```

---

### Script, expanded JSDoc + inline comments on hooks

At Full level, the `##` heading for each reactive state, composable, and hook gets a description paragraph. Inline `/** */` comments are added inside callback bodies:

```js
    /**
     * ## 🔄 Navigation State
     *
     * Tracks whether a route transition is currently in progress.
     * Controls the visibility of the loader bar via `v-if`.
     */

    /** Initialized to false, loader is hidden until a navigation starts */
    const isNavigating = ref(false);

    /**
     * ## ▶️ beforeEach : Show Loader
     *
     * Triggered immediately when any navigation starts.
     * Sets `isNavigating` to true to display the loader bar.
     */
    router.beforeEach(() => {
        /** Show the loader bar as soon as navigation is triggered */
        isNavigating.value = true;
    });

    /**
     * ## ⏹️ afterEach : Hide Loader
     *
     * Triggered when navigation is complete.
     * Delays hiding the bar to let the CSS animation finish
     * before the element is removed from the DOM.
     */
    router.afterEach(() => {
        /**
         * 300ms delay: gives the loaderBar animation enough time to visually
         * complete its sweep before `v-if` removes the element from the DOM.
         */
        setTimeout(() => {
            /** Reset state, hides the bar and removes it from the DOM via v-if */
            isNavigating.value = false;
        }, 300);
    });
```

---

### Style, numbered reference blocks + inline comments

Follow the same CSS Full rules:

- **Numbered reference blocks** for rule blocks with multiple non-obvious properties
- **Inline `/* comment */`** on keyframe steps and individual non-obvious declarations

```css
    /**
     *  1. Runs the loaderBar sweep animation continuously until the bar is hidden.
     *  2. Fade-in/out shimmer: transitions from page background to the secondary
     *     accent color and back, creating a seamless loop with no visible seam.
     *  3. Thin bar, visually unobtrusive while still clearly signaling activity.
     *  4. Fixed positioning keeps the bar at the top regardless of scroll position.
     *  5. Ensures the bar renders above all other stacked content.
     */

    .navigateLoader {
        animation: loaderBar 1s infinite linear; /* 1 */
        background: linear-gradient( /* 2 */
            90deg,
            var(--bux-page-bg) 0%,
            var(--bux-color-secondary) 50%,
            var(--bux-page-bg) 100%
        );
        height: 4px; /* 3 */
        left: 0;
        position: fixed; /* 4 */
        top: 0;
        width: 100%;
        z-index: 9999; /* 5 */
    }

    /**
     * Slides the bar from fully off-screen left to fully off-screen right.
     * Combined with `width: 100%`, this creates a continuous sweeping motion
     * across the full viewport width.
     */

    @keyframes loaderBar {
        0% {
            transform: translateX(-100%); /* Starts hidden off-screen to the left */
        }
        100% {
            transform: translateX(100%); /* Ends hidden off-screen to the right */
        }
    }
```
