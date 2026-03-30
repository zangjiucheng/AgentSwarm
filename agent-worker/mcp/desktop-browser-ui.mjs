import {
  CHROMIUM_DEBUG_PORT,
  COMPUTER_USE_ENABLED,
  activeWindow,
  sleep,
} from "./lib/desktop-common.mjs";
import { startMcpServer } from "./lib/mcp-server.mjs";
import { run } from "./lib/desktop-common.mjs";

async function keyChord(chord) {
  await run("xdotool", ["key", "--clearmodifiers", chord]);
}

const tools = [
  {
    name: "focus_address_bar",
    description: "Focus the browser address bar.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "open_tab",
    description: "Open a new browser tab.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "close_tab",
    description: "Close the current browser tab.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "switch_tab",
    description: "Switch browser tabs forward or backward.",
    inputSchema: {
      type: "object",
      properties: {
        direction: { type: "string", enum: ["next", "previous"] },
      },
    },
  },
  {
    name: "open_url",
    description: "Open a URL in the current browser tab.",
    inputSchema: {
      type: "object",
      required: ["url"],
      properties: { url: { type: "string" }, waitMs: { type: "number" } },
    },
  },
  {
    name: "wait_for_browser_settle",
    description: "Pause briefly and return current window context.",
    inputSchema: {
      type: "object",
      properties: { waitMs: { type: "number" } },
    },
  },
  {
    name: "detect_permission_prompt",
    description: "Inspect active window state to spot likely browser prompts.",
    inputSchema: { type: "object", properties: {} },
  },
];

await startMcpServer({
  name: "desktop-browser-ui",
  enabled: COMPUTER_USE_ENABLED,
  tools,
  handlers: {
    focus_address_bar: async () => {
      await keyChord("ctrl+l");
      return { ok: true };
    },
    open_tab: async () => {
      await keyChord("ctrl+t");
      return { ok: true };
    },
    close_tab: async () => {
      await keyChord("ctrl+w");
      return { ok: true };
    },
    switch_tab: async ({ direction = "next" }) => {
      await keyChord(direction === "previous" ? "ctrl+shift+Tab" : "ctrl+Tab");
      return { ok: true, direction };
    },
    open_url: async ({ url, waitMs = 1200 }) => {
      await keyChord("ctrl+l");
      await sleep(100);
      await run("xdotool", ["type", "--delay", "10", url]);
      await run("xdotool", ["key", "--clearmodifiers", "Return"]);
      await sleep(waitMs);
      return { ok: true, url, debugPort: CHROMIUM_DEBUG_PORT };
    },
    wait_for_browser_settle: async ({ waitMs = 1000 }) => {
      await sleep(waitMs);
      return activeWindow();
    },
    detect_permission_prompt: async () => {
      const window = await activeWindow();
      const title = (window.title || "").toLowerCase();
      return {
        activeWindow: window,
        likelyPermissionPrompt:
          title.includes("permission") ||
          title.includes("wants to") ||
          title.includes("allow"),
      };
    },
  },
});
