---
name: frontend-regression
description: Use when a React, Vite, Tailwind, or browser UI behavior regressed and the user wants a concrete fix with minimal churn, especially for state, layout, resize, iframe, or effect timing issues.
---

# Frontend Regression Skill

Use this skill for targeted UI bug fixes, not large redesigns.

## Workflow

1. Reconstruct the failing path:
   - component entry point
   - state source
   - effects and event listeners
   - layout constraints
2. Search for the narrowest owner of the bug before editing shared primitives.
3. Treat these as common regression sources:
   - stale effect dependencies
   - hidden containers and measurement timing
   - resize observers and debounced updates
   - iframe or websocket lifecycle mismatches
   - optimistic UI state diverging from backend state
4. Patch the smallest surface that restores the expected behavior.
5. In computer-use workers, verify regressions with MCP at the right layer:
   - `desktop-browser-dom` for selector/state checks in Chromium
   - `desktop-vision` for screenshot and layout confirmation when the browser chrome or desktop state matters

## Rules

- Preserve the existing UI language unless the user asks for redesign.
- Do not add memoization by reflex.
- Avoid broad refactors when a lifecycle or layout fix is enough.
- After the fix, verify both the visible behavior and the underlying state transition.
