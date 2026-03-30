# Keyboard

Keyboard input is often more reliable than pointer input.

Preferred MCP:

- primary: `desktop-input`
- browser-specific shortcuts: `desktop-browser-ui`

- Use shortcuts for focus changes, tab switching, dialog dismissal, and text editing.
- Use `Tab` and `Shift+Tab` when forms are navigable and pointer precision is poor.
- Use `Esc` to dismiss menus or modals before trying a different action.

Common patterns:

- `Ctrl+L`: focus browser address bar
- `Ctrl+T`: new browser tab
- `Ctrl+W`: close current tab
- `Ctrl+C` / `Ctrl+V`: clipboard actions
- `Alt+Tab`: switch windows
- `Tab` / `Shift+Tab`: move focus
- `Enter` / `Space`: activate focused control

## Form Navigation

- Prefer `Tab` for predictable form traversal.
- Use `Shift+Tab` to back up one field instead of reclicking when possible.
- Use arrows inside radio groups, menus, and tab strips only after confirming that widget has focus.

## Browser Interaction

- Use `Ctrl+L` before typing a URL; do not assume the page body will ignore keystrokes.
- Use `Ctrl+F` for in-page search when scanning long content.
- Use `Esc` to dismiss find bars, menus, and transient overlays before changing tasks.
