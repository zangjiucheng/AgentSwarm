# Workspace

Use this section to reason about desktop layout and window state.

Preferred MCP:

- visual/window state: `desktop-vision`
- focus and input changes: `desktop-input`

- Keep one clear primary window whenever possible.
- Before acting, confirm which window has focus.
- Minimize layout churn when doing repetitive steps.

## Window Controls

- Verify the target window before using title-bar controls.
- Closing the wrong window is usually more expensive than switching focus.
- Prefer maximize when a task needs precision and spatial stability.
- Prefer minimize only when you expect to come back soon.

## One Window

Single-window mode is the most reliable layout.

- Use it for focused browser tasks, settings panels, and sequential forms.
- Maximize the active window when precision matters.
- Keep the task linear: read, act, confirm.

## Two Windows

Two-window mode is useful for compare-and-transfer tasks.

- Decide which window is source and which is destination.
- Switch with keyboard when possible.
- After each switch, verify focus before typing or pasting.
- Keep upload/download sources and browser destinations conceptually separate to avoid acting in the wrong app.

## Three Plus Windows

More than two windows increases focus mistakes.

- Reduce clutter before doing precise actions.
- Group related windows and close transient ones when possible.
- Reconfirm the active window every time you `Alt+Tab` through a stack.

## File Picker Windows

- Treat file picker dialogs as temporary modal workspaces.
- Before selecting a file, confirm whether the picker belongs to the browser or another desktop app.
- After the picker closes, verify you returned to the expected app and that the file action actually registered.
