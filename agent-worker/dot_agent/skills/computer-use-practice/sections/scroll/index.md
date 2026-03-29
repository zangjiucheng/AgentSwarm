# Scroll

Scrolling should be incremental and observable.

Preferred MCP:

- primary: `desktop-input`
- confirm region and stability with `desktop-vision`

- Use short deltas first; large jumps lose context.
- Re-anchor after each scroll using headings, cards, or sticky UI.
- If the wrong region scrolls, re-focus the intended pane before trying again.
- When hunting for a control, alternate small scrolls with visual re-checks instead of overshooting repeatedly.
