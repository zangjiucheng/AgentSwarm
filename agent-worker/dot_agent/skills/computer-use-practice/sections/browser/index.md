# Browser

Use this section for page navigation, tab management, logins, web apps, and browser dialogs.

Preferred MCP:

- first choice for page-aware work: `desktop-browser-dom`
- fallback for generic GUI browser actions: `desktop-browser-ui`
- supporting visual checks: `desktop-vision`

## Routing Rules

- Use `desktop-browser-dom` when the task is selector-friendly:
  web forms, buttons, links, tab lists, or page text queries.
- Use `desktop-browser-ui` when the browser must be treated like a normal desktop app:
  address bar actions, tab shortcuts, unexpected popups, permission prompts, or fallback when the DOM route is uncertain.
- Use `desktop-vision` before destructive or ambiguous browser actions when overlays or loading states may hide the real page state.

## Browser Playbook

1. Verify the correct browser window and tab.
2. Decide whether the task is DOM-aware or GUI-first.
3. Use `desktop-browser-dom` for stable page actions.
4. Fall back to `desktop-browser-ui` plus `desktop-input` if the page is blocked by native browser chrome or a non-DOM prompt.
5. Re-check page state after navigation or login redirects.
