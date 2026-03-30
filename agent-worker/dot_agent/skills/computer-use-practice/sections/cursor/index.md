# Cursor

Use pointer actions only after verifying target, focus, and motion.

Preferred MCP:

- primary: `desktop-input`
- supporting context: `desktop-vision`

- Prefer single deliberate clicks over rapid retries.
- Confirm hover state before clicking small or destructive targets.
- For drags, define start point, path, and release point before moving.

## Click A Button

Reliable click workflow:

1. Identify the exact target and its label.
2. Verify the correct window is focused.
3. Move to the center mass of the target, not the edge.
4. Re-check hover or highlight state if available.
5. Click once.
6. Read the resulting screen change before the next action.

If nothing changes, do not spam clicks. Re-evaluate focus, animation, or whether the target was disabled.

For destructive or high-impact buttons:

1. Re-read the label.
2. Confirm surrounding dialog or form context.
3. Verify there is no safer secondary action that should be used first.
4. Click once and immediately watch for confirmation or undo state.

## Drag Resize

For resize handles and split panes:

- Start from a visible edge or grip, not guessed empty space.
- Move a short distance first to verify the handle is active.
- Release as soon as the target size is reached.
- If the pointer shape never changed to a resize cursor, abort and re-check the handle.

## Drag Across Regions

Cross-region drags fail when the route crosses auto-scrolling or focus boundaries.

- Break the move into a stable start, a controlled path, and a clear drop region.
- Avoid diagonal sweeps across crowded layouts when a shorter route exists.
- If the destination highlights on hover, wait for that signal before releasing.
- If the drag is rejected, re-acquire the item and try a cleaner path rather than a faster one.

## Double Click vs Single Click

- Assume single click selects and double click opens unless the UI clearly behaves otherwise.
- If opening a row or file is the goal, use deliberate double click only after confirming the item is stable and not already selected for another action.
- If a double click causes the wrong transition, stop and recover rather than layering more clicks.
