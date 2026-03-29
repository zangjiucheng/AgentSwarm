---
name: computer-use-practice
description: Use when a worker is in computer-use mode and the task requires operating the desktop through a browser, VNC session, or GUI application rather than only editing code in the terminal.
---

# Computer Use Practice Skill

Use this skill when the task must be completed through the worker desktop rather than purely through files and shell commands.

## Always-On Rules

1. Prefer `code-server` or direct file edits for code changes. Use the desktop only when the task truly depends on GUI interaction.
2. Before clicking, verify the active window, pointer location, and whether the screen is still animating.
3. Keep actions incremental:
   - look
   - verify
   - act
   - confirm result
4. Use keyboard shortcuts when they are more reliable than pointer actions.
5. When a step is ambiguous, pause and re-check instead of chaining guesses.
6. Treat dialogs, permission prompts, and window switches as state changes that require a fresh read before the next action.

## MCP Routing

- `desktop-vision`:
  screenshots, geometry, cursor location, window inspection, and animation-settled checks
- `desktop-input`:
  mouse, drag, scroll, typing, hotkeys, and clipboard actions
- `desktop-browser-ui`:
  browser tab and address-bar actions when the browser should still be treated as a GUI
- `desktop-browser-dom`:
  Chromium DOM-aware actions for selector queries, web forms, page navigation, and higher-confidence browser automation
- `desktop-files`:
  downloads inspection, directory checks, and file dialog helpers

## Sections

- Vision:
  [`sections/vision/index.md`](./sections/vision/index.md)
- Cursor:
  [`sections/cursor/index.md`](./sections/cursor/index.md)
- Browser:
  [`sections/browser/index.md`](./sections/browser/index.md)
- Forms:
  [`sections/forms/index.md`](./sections/forms/index.md)
- Keyboard:
  [`sections/keyboard/index.md`](./sections/keyboard/index.md)
- Scroll:
  [`sections/scroll/index.md`](./sections/scroll/index.md)
- Files:
  [`sections/files/index.md`](./sections/files/index.md)
- Workspace:
  [`sections/workspace/index.md`](./sections/workspace/index.md)
- Recovery:
  [`sections/recovery/index.md`](./sections/recovery/index.md)

## When To Use

- browser-based workflows
- multi-step web app flows
- forms, dialogs, uploads, and downloads
- file manager interactions
- GUI installers or settings panels
- drag and drop tasks
- validating desktop-only behavior
- operating apps that are not exposed through the terminal

## When Not To Use

- reading or editing repo files that are easier in `code-server`
- shell-first tasks
- scripted automation that can be completed reliably in the terminal
