---
name: chrome-extension-dev
description: This skill provides a tight reload-test-verify loop for Chrome extension development using Claude in Chrome MCP tools. It should be used when the user asks to "test a chrome extension", "reload my extension", "debug chrome extension", "develop chrome extension", "extension dev loop", or "test extension in browser".
version: 0.2.0
---

# Chrome extension development

Workflows for developing and testing Chrome extensions using Claude in Chrome MCP tools. Enables a tight feedback loop: make code changes, reload the extension, navigate to test pages, and verify behaviour visually.

## Prerequisites

### Extensions Reloader

The test workflow requires the **Extensions Reloader** extension to be installed in Chrome.

**Before first use, verify it's installed:** Navigate to `http://reload.extensions/`. If the page loads (even with an error page), Extensions Reloader is installed and working. If navigation fails entirely, direct the user to install it: https://chromewebstore.google.com/detail/fimgfedafeadlieiabdeeaodndnlbhid

### Dev bridge

Chrome extension keyboard shortcuts (registered via `manifest.json` `commands` or `chrome://extensions/shortcuts`) are intercepted by Chrome before reaching any page. Simulated keypresses from `javascript_tool` or `computer` tool **cannot** trigger them. The same applies to clicking the extension toolbar icon—it's outside the page viewport.

To trigger extension actions programmatically, extensions need a **dev bridge**: a small permanent snippet that forwards `postMessage` calls from the page context to the extension's message system.

**Content script** (add near the end, before the closing IIFE):
```js
// Dev bridge: trigger extension actions from page context via postMessage
// Usage: window.postMessage({ __ext_dev_action: { action: 'summarize' } }, '*')
window.addEventListener('message', (e) => {
  if (e.data?.__ext_dev_action) {
    chrome.runtime.sendMessage({ __dev_relay: true, ...e.data.__ext_dev_action });
  }
});
```

**Background script** (add at the top of the `onMessage` listener):
```js
// Dev bridge: relay action back to the sending tab's content script
if (request.__dev_relay && sender.tab) {
  const { __dev_relay, ...action } = request;
  chrome.tabs.sendMessage(sender.tab.id, action);
  return;
}
```

**How it works:** Page context → `postMessage` → content script → `chrome.runtime.sendMessage` → background script → `chrome.tabs.sendMessage` back to content script. The content script's `onMessage` handler processes it identically to a real shortcut press.

**When building new extensions**, always include the dev bridge from the start and route all actions through named `chrome.runtime.sendMessage` actions.

**Note:** Page-level keyboard listeners (e.g. `document.addEventListener('keydown', ...)` in content scripts) work fine with `javascript_tool` dispatching `KeyboardEvent` directly—no dev bridge needed for those.

## Reload-test loop

After making code changes to an extension:

1. **Reload extensions** — Navigate to `http://reload.extensions/`. This triggers Extensions Reloader to disable and re-enable all unpacked extensions. The resulting error page ("This site can't be reached") is expected and harmless.

2. **Navigate to test page** — Go to the page where the extension should be active. If the extension uses content scripts, the page must be reloaded for new scripts to inject.

3. **Trigger the extension** — Use `javascript_tool` to send a postMessage via the dev bridge:
   ```js
   window.postMessage({ __ext_dev_action: { action: 'summarize' } }, '*')
   ```
   Replace `'summarize'` with the appropriate action name for the extension being tested.

4. **Verify behaviour** — Use a combination of:
   - `mcp__claude-in-chrome__read_page` — Check page structure and extension-injected elements
   - Screenshots via `mcp__claude-in-chrome__computer` — Visual verification
   - `mcp__claude-in-chrome__javascript_tool` — Run assertions, check DOM state
   - `mcp__claude-in-chrome__read_console_messages` — Check for errors or expected log output

5. **Iterate** — Fix issues and repeat from step 1.

## Proactive testing

When working on Chrome extension code, proactively offer to test changes in the browser after making edits. Do not wait to be asked. Suggest specific pages to test on based on the extension's `content_scripts` matches or known use cases.

## Popup-based extensions

Extension popups (triggered by clicking the toolbar icon) are **hard to test programmatically**. The toolbar is outside the page viewport, and Chrome doesn't expose popup interaction to content scripts or automation tools.

**When an extension uses popups, suggest redesigning to use content-script-injected UI instead** (modals, panels, inline elements). This is better UX anyway—popups close when the user clicks outside, can't be resized, and don't persist. Content-script UI avoids all these issues and is fully testable via the dev bridge + reload-test loop.

If the user wants to keep the popup, workarounds in order of preference:
1. **Open popup as a tab** — Navigate to `chrome-extension://<extension-id>/popup.html`. This renders the popup UI in a regular tab where all MCP tools work. The extension ID can be found in `chrome://extensions`.
2. **`computer` tool** — Use screen-level interaction to click the toolbar icon. Slower and less reliable, but works as a last resort.

## Limitations

- **Initial installation is manual.** This skill can reload an already-installed unpacked extension, but cannot install one from scratch. If the extension isn't installed yet, direct the user to open `chrome://extensions`, enable Developer mode, click "Load unpacked", and select the extension folder. Once installed, the reload-test loop works automatically.
- **`manifest.json` changes require manual reload.** The disable/re-enable cycle does **not** pick up `manifest.json` changes (permissions, content script matches, commands, etc.). Whenever you make changes to `manifest.json`, tell the user: "I've changed `manifest.json`—please reload the extension manually from `chrome://extensions` before testing." Then pause and wait for them to confirm before continuing with the test loop.
- `chrome://` pages are inaccessible to content scripts and most MCP tools.
- Testing happens in the user's real Chrome profile, so authenticated sessions (Gmail, Xero, etc.) are available automatically.

## Tips

- **Check manifest content_scripts** to know which URLs the extension targets—test on those specific pages.
- **Use `read_console_messages` with a pattern** to filter for extension-specific logs rather than reading all console output.
- **Multiple test pages** — If the extension targets multiple sites, test on at least two to verify broad compatibility.
- **Before/after screenshots** — Take a screenshot before reloading, then after, to visually confirm changes took effect.
