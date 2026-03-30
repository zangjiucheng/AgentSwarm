import {
  CHROMIUM_DEBUG_PORT,
  COMPUTER_USE_ENABLED,
  activeWindow,
  listWindows,
  sleep,
  WORKER_HOME_DIR,
} from "./lib/desktop-common.mjs";
import { startMcpServer } from "./lib/mcp-server.mjs";
import { run } from "./lib/desktop-common.mjs";

async function keyChord(chord) {
  await run("xdotool", ["key", "--clearmodifiers", chord]);
}

function chromiumWindow(window) {
  const wmClass = (window.wmClass || "").toLowerCase();
  const title = (window.title || "").toLowerCase();
  return wmClass.includes("chromium") || title.includes("chromium");
}

async function findChromiumWindow() {
  const windows = await listWindows();
  return windows.find(chromiumWindow) || null;
}

async function chromiumDebugReady() {
  try {
    const response = await fetch(
      `http://127.0.0.1:${CHROMIUM_DEBUG_PORT}/json/version`,
    );
    return response.ok;
  } catch {
    return false;
  }
}

async function launchChromium() {
  await run("bash", [
    "-lc",
    `
      mkdir -p '${WORKER_HOME_DIR}/.config/chromium-agentswarm'
      rm -f \
        '${WORKER_HOME_DIR}/.config/chromium-agentswarm/SingletonLock' \
        '${WORKER_HOME_DIR}/.config/chromium-agentswarm/SingletonSocket' \
        '${WORKER_HOME_DIR}/.config/chromium-agentswarm/SingletonCookie'
      nohup chromium \
        --no-sandbox \
        --disable-dev-shm-usage \
        --new-window \
        --remote-debugging-address=127.0.0.1 \
        --remote-debugging-port='${CHROMIUM_DEBUG_PORT}' \
        --user-data-dir='${WORKER_HOME_DIR}/.config/chromium-agentswarm' \
        about:blank >/tmp/chromium-mcp-launch.log 2>&1 &
    `,
  ]);
}

async function ensureBrowserFocused({ launchIfMissing = true } = {}) {
  let browserWindow = await findChromiumWindow();
  let debugReady = await chromiumDebugReady();

  if ((!browserWindow || !debugReady) && launchIfMissing) {
    await launchChromium();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await sleep(500);
      browserWindow = await findChromiumWindow();
      debugReady = await chromiumDebugReady();
      if (browserWindow && debugReady) break;
    }
  }

  if (!browserWindow) {
    throw new Error("Chromium window is not available");
  }

  await run("wmctrl", ["-ia", browserWindow.windowId]);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    await sleep(150);
    const window = await activeWindow();
    if (chromiumWindow(window)) {
      return {
        ok: true,
        window,
        debugReady: await chromiumDebugReady(),
      };
    }
  }

  throw new Error("Chromium window did not become active");
}

const tools = [
  {
    name: "ensure_browser_window",
    description: "Ensure a Chromium window exists and is focused.",
    inputSchema: {
      type: "object",
      properties: {
        launchIfMissing: { type: "boolean" },
      },
    },
  },
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
    ensure_browser_window: async ({ launchIfMissing = true }) =>
      ensureBrowserFocused({ launchIfMissing }),
    focus_address_bar: async () => {
      await ensureBrowserFocused();
      await keyChord("ctrl+l");
      return { ok: true };
    },
    open_tab: async () => {
      await ensureBrowserFocused();
      await keyChord("ctrl+t");
      return { ok: true };
    },
    close_tab: async () => {
      await ensureBrowserFocused();
      await keyChord("ctrl+w");
      return { ok: true };
    },
    switch_tab: async ({ direction = "next" }) => {
      await ensureBrowserFocused();
      await keyChord(direction === "previous" ? "ctrl+shift+Tab" : "ctrl+Tab");
      return { ok: true, direction };
    },
    open_url: async ({ url, waitMs = 1200 }) => {
      const browser = await ensureBrowserFocused();
      await keyChord("ctrl+l");
      await sleep(100);
      await run("xdotool", ["type", "--delay", "10", url]);
      await run("xdotool", ["key", "--clearmodifiers", "Return"]);
      await sleep(waitMs);
      return {
        ok: true,
        url,
        debugPort: CHROMIUM_DEBUG_PORT,
        browserWindow: browser.window,
      };
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
