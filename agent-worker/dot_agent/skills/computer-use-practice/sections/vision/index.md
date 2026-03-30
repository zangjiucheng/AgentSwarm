# Vision

Use this section to stabilize visual reads before acting.

Preferred MCP:

- start with `desktop-vision`
- pair with `desktop-input` only after the screen is stable

## Glance Strategy

- Start with a quick glance:
  identify active app, modal dialogs, focused input, and any loading indicator.
- Re-read after transitions:
  window switches, tab opens, page navigations, and popovers often change focus.
- Prefer landmarks:
  title bars, sidebars, primary buttons, and form labels are more reliable than isolated text fragments.

## Detect Animation

- Watch for spinners, progress bars, skeletons, blinking cursors, and hover fades.
- If a panel just opened, wait for layout to settle before targeting small controls.
- If the same area changes between glances, treat it as unstable and re-read after a short pause.

Use this when:

- a page just loaded
- menus are expanding
- dialogs are entering or closing
- the pointer target is small

## Extreme Zoom

- Zoom in mentally on the immediate target region before acting.
- Use nearby labels, icon groups, and edges to anchor the click point.
- Favor keyboard navigation when a control is too small or too dense.
- If a click misses once, do not repeat immediately; re-evaluate the exact target first.

## Cursor State

Cursor shape is a useful state signal.

- Arrow:
  neutral surface or basic clickable target.
- I-beam:
  text field or editable content.
- Hand:
  link or explicit click target.
- Resize handles:
  border or split-pane adjustment.
- Busy/spinner overlay:
  defer precise interactions until it clears.

If the cursor shape does not match the intended action, stop and re-check the target.
