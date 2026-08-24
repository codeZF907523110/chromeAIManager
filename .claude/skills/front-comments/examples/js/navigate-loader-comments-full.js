/**
 * # 🔄 navigate-loader
 *
 * Injects a full-page loading indicator and enables animated page transitions
 * using the native View Transition API (`document.startViewTransition`).
 *
 * On load, a `.navigate-loader` element is prepended to `<body>` so CSS animations
 * can be triggered during navigation. Click events on all `.nav a` links are
 * intercepted to initiate a view transition before the browser navigates.
 *
 * Falls back gracefully to standard navigation in browsers that do not support
 * the View Transition API.
 */

/**
 * Scoped styles for the loader element and the CSS view-transition animations
 * applied during page changes.
 */
import './navigate-loader.css';

// ---------------------------------------------------------------------------- //
//
//  ### 🌀 Loader Element
//  DOM node injected at startup to serve as the visible transition indicator
//
// ---------------------------------------------------------------------------- //

/**
 * ## 🌀 loader
 *
 * A `<div>` element prepended to `<body>` that acts as the visual loading overlay.
 *
 * Key properties:
 * - `className`: Set to `navigate-loader`, targeted by the companion CSS file
 *   to display the animation during active view transitions.
 */
const loader = document.createElement('div');
loader.className = 'navigate-loader';
document.body.prepend(loader);

// ---------------------------------------------------------------------------- //
//
//  ### 🔀 View Transition Handler
//  Intercepts navigation clicks and wraps them in a CSS view transition
//
// ---------------------------------------------------------------------------- //

/**
 * ## 🔀 navigateWithTransition
 *
 * Click handler that wraps same-page link navigation inside a View Transition.
 *
 * Responsibilities:
 * - Skips silently when `document.startViewTransition` is unsupported (progressive enhancement)
 * - Prevents the default browser navigation to take control of the timing
 * - Triggers `startViewTransition` so the browser captures before/after snapshots
 * - Sets `window.location.href` inside the transition callback to start the actual navigation
 *
 * @param {MouseEvent} e - The click event fired on a navigation link.
 */
function navigateWithTransition(e) {
    /** Bail out early if the browser does not support the View Transition API, native navigation proceeds normally */
    if (!document.startViewTransition) return;

    /** Prevent the browser from navigating immediately so the transition can run first */
    e.preventDefault();

    /** Capture the destination URL from the clicked link before the transition starts */
    const url = e.currentTarget.href;

    /**
     * Start the view transition, the browser freezes the current page as a snapshot,
     * runs the callback, then animates between the two states using CSS.
     */
    document.startViewTransition(() => {
        /**
         * Wrap the navigation in a Promise so `startViewTransition` can track completion.
         * `resolve()` is called immediately after setting the href, the actual page
         * load happens asynchronously, which is expected behavior for cross-page transitions.
         */
        return new Promise(resolve => {
            /** Trigger the browser navigation to the captured URL */
            window.location.href = url;

            /** Resolve right away; the transition animation will play out as the new page loads */
            resolve();
        });
    });
}

// ---------------------------------------------------------------------------- //
//
//  ### 🔗 Event Binding
//  Attaches the transition handler to every navigation link
//
// ---------------------------------------------------------------------------- //

/**
 * ## 🔗 Navigation Link Listeners
 *
 * Selects all anchor tags inside `.nav` and registers the view-transition click
 * handler on each so animated navigation is applied site-wide.
 */
document.querySelectorAll('.nav a').forEach(link => {
    /** Intercept clicks on each nav link to trigger the view transition instead of a hard jump */
    link.addEventListener('click', navigateWithTransition);
});
