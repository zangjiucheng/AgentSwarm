import {
  COMPUTER_USE_ENABLED,
  activeWindow,
  cursorState,
  listWindows,
  screenGeometry,
  takeScreenshot,
  waitForStableScreen,
} from "./lib/desktop-common.mjs";
import { startMcpServer } from "./lib/mcp-server.mjs";

const tools = [
  {
    name: "screenshot",
    description: "Capture a screenshot of the current desktop.",
    inputSchema: {
      type: "object",
      properties: {
        prefix: { type: "string" },
      },
    },
  },
  {
    name: "screen_geometry",
    description: "Read the current X display geometry.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "cursor_state",
    description: "Read the current cursor position and active X window id.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "active_window",
    description: "Inspect the active desktop window.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_windows",
    description: "List visible windows with geometry and titles.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "wait_for_stable",
    description: "Wait until repeated screenshots stop changing.",
    inputSchema: {
      type: "object",
      properties: {
        intervalMs: { type: "number" },
        stableCount: { type: "number" },
        timeoutMs: { type: "number" },
      },
    },
  },
];

startMcpServer({
  name: "desktop-vision",
  enabled: COMPUTER_USE_ENABLED,
  tools,
  handlers: {
    screenshot: async ({ prefix }) => takeScreenshot(prefix),
    screen_geometry: async () => screenGeometry(),
    cursor_state: async () => cursorState(),
    active_window: async () => activeWindow(),
    list_windows: async () => listWindows(),
    wait_for_stable: async (args) => waitForStableScreen(args),
  },
});
