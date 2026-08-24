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
 * - Triggers `startViewTransition` so the browser captures the before/after snapshots
 * - Sets `window.location.href` inside the transition callback to start the actual navigation
 *
 * @param {MouseEvent} e - The click event fired on a navigation link.
 */
function navigateWithTransition(e) {
    if (!document.startViewTransition) return;
    e.preventDefault();
    const url = e.currentTarget.href;

    document.startViewTransition(() => {
        return new Promise(resolve => {
            window.location.href = url;
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
    link.addEventListener('click', navigateWithTransition);
});
