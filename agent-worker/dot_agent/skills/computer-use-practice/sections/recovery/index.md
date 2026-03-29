# Recovery

Use this section when the desktop state goes off the happy path.

Preferred MCP:

- diagnose state with `desktop-vision`
- recover focus or retry input with `desktop-input`
- if the problem is page-specific, switch to `desktop-browser-dom` or `desktop-browser-ui` based on whether the blocker is DOM-visible

- Stop after a misclick and re-read the full state.
- Recover focus before retrying.
- Dismiss transient UI before attempting the original action again.
- If the app appears frozen, verify whether it is actually blocked, loading, or hidden behind another window.

Common recovery situations:

- wrong window focused
- unexpected dialog opened
- drag released in the wrong region
- page still loading
- keyboard input went to the wrong field

## Browser Recovery

- If the page appears blank or wrong, check whether you are on the expected tab and URL first.
- If a click seems ignored, verify whether the page is loading, disabled, or covered by an overlay.
- If navigation produced the wrong route, use browser history only after confirming the target tab.

## Form Recovery

- If input landed in the wrong field, stop typing and identify which field actually has focus.
- If a submit produced validation errors, do not reset the whole form unless necessary.
- If a dialog interrupted submission, resolve the dialog before retrying.

## File Recovery

- If an upload fails, verify file selection, path, and whether the app expected drag-and-drop instead of a picker.
- If a download is missing, check whether the browser opened the file inline or blocked it.
- If the wrong file was selected, clear the selection state before retrying.
