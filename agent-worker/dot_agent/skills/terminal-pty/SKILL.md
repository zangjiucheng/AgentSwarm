---
name: terminal-pty
description: Use when debugging terminal, PTY, tmux, websocket, xterm, shell init, cwd, input, or resize/render problems across frontend, backend, monitor, and worker runtime layers.
---

# Terminal PTY Skill

Use this skill for terminal behavior problems, especially when symptoms look similar but come from different layers.

## Layer Checklist

Trace the path in order:

1. Frontend terminal view
   - `xterm`
   - fit/resize logic
   - tab switching and hidden containers
2. Transport
   - websocket connection lifecycle
   - input/output message shape
   - resize payload timing
3. PTY process
   - spawn command
   - `cwd`
   - `TERM` and shell env
4. Session layer
   - `tmux` session creation
   - attach vs new-session behavior
   - pane current path
5. Worker runtime
   - shell rc files
   - startup scripts
   - workspace defaults

## Heuristics

- Separate rendering bugs from actual PTY-size bugs.
- If rows and cols are wrong, inspect resize generation and PTY resize handling.
- If the path is wrong, inspect tmux session creation and startup scripts before the frontend.
- If behavior differs after reconnect, compare initial session creation with attach flow.
- Favor the smallest fix in the layer that owns the default.
- If the task is really desktop/browser interaction rather than terminal behavior, switch to the computer-use MCP tools instead of debugging PTY layers.

## Verification

- Confirm the terminal opens in the expected directory.
- Confirm resize updates both the visual grid and the PTY size.
- Confirm reconnecting does not regress cwd, prompt, or shell state.
