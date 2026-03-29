# Files

Use this section for downloads, uploads, file pickers, and file-manager workflows.

Preferred MCP:

- directory and download inspection: `desktop-files`
- native picker interaction fallback: `desktop-input`
- visual confirmation for file chooser state: `desktop-vision`

## Routing Rules

- Use `desktop-files` first to verify file existence, inspect Downloads, and guide file chooser workflows.
- Use `desktop-input` when the file picker itself needs keystrokes, clicks, or confirmation.
- Use `desktop-vision` when the picker state or selected file is visually ambiguous.

## File Playbook

1. Confirm the expected file path or download location with `desktop-files`.
2. If a picker is open, decide whether path-entry is sufficient or whether pointer/keyboard interaction is needed.
3. Use `desktop-input` only after the target dialog and focused field are confirmed.
4. After upload or download, verify the filesystem result with `desktop-files`.
