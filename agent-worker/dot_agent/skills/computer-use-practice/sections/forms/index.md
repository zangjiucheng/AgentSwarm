# Forms

Use this section for web forms, native dialogs, validation errors, and multi-step submissions.

Preferred MCP:

- web forms: `desktop-browser-dom`
- native dialogs and non-DOM controls: `desktop-input`
- visual confirmation and disabled/loading checks: `desktop-vision`

## Routing Rules

- Use `desktop-browser-dom` for field lookup, text entry, button clicks, and validation reads on normal web pages.
- Switch to `desktop-input` when the form control is a native picker, modal, or browser-owned dialog that the DOM tools cannot see.
- Use `desktop-vision` before submission if the page may still be loading or if a dialog may be covering the submit button.

## Form Playbook

1. Identify whether the form is web DOM or native desktop UI.
2. For DOM forms:
   query fields, type values, and submit with `desktop-browser-dom`.
3. For native dialogs:
   use `desktop-input` and confirm focus before typing.
4. After submit:
   re-check for errors, success state, redirects, or confirmation dialogs.
