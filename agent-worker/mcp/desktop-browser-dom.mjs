import {
  CHROMIUM_DEBUG_PORT,
  COMPUTER_USE_ENABLED,
} from "./lib/desktop-common.mjs";
import { startMcpServer } from "./lib/mcp-server.mjs";

async function chromeJson(pathname) {
  const response = await fetch(`http://127.0.0.1:${CHROMIUM_DEBUG_PORT}${pathname}`);
  if (!response.ok) {
    throw new Error(`Chromium debug endpoint failed: ${response.status}`);
  }
  return response.json();
}

async function chromeText(pathname) {
  const response = await fetch(`http://127.0.0.1:${CHROMIUM_DEBUG_PORT}${pathname}`);
  if (!response.ok) {
    throw new Error(`Chromium debug endpoint failed: ${response.status}`);
  }
  return response.text();
}

async function getTabs() {
  const targets = await chromeJson("/json/list");
  return targets.filter((target) => target.type === "page");
}

async function pickTab(targetId) {
  const tabs = await getTabs();
  const tab = targetId
    ? tabs.find((entry) => entry.id === targetId)
    : tabs.find((entry) => entry.url !== "about:blank") || tabs[0];
  if (!tab) throw new Error("No Chromium page target found");
  return tab;
}

async function withCdp(targetId, fn) {
  const tab = await pickTab(targetId);
  const socket = new WebSocket(tab.webSocketDebuggerUrl);
  let nextId = 0;
  const pending = new Map();

  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data.toString());
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    }
  });

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  await ready;
  try {
    return await fn({ send, tab });
  } finally {
    socket.close();
  }
}

function evaluation(expression) {
  return {
    expression,
    returnByValue: true,
    awaitPromise: true,
  };
}

const tools = [
  {
    name: "list_tabs",
    description: "List Chromium tabs from the local debug endpoint.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "select_tab",
    description: "Activate a specific Chromium tab.",
    inputSchema: {
      type: "object",
      required: ["targetId"],
      properties: { targetId: { type: "string" } },
    },
  },
  {
    name: "navigate",
    description: "Navigate a Chromium tab to a URL.",
    inputSchema: {
      type: "object",
      required: ["url"],
      properties: {
        targetId: { type: "string" },
        url: { type: "string" },
        waitMs: { type: "number" },
      },
    },
  },
  {
    name: "dom_snapshot",
    description: "Return DOM text or HTML from the active page.",
    inputSchema: {
      type: "object",
      properties: {
        targetId: { type: "string" },
        selector: { type: "string" },
        mode: { type: "string", enum: ["text", "html"] },
      },
    },
  },
  {
    name: "query_selector",
    description: "Inspect a DOM element by CSS selector.",
    inputSchema: {
      type: "object",
      required: ["selector"],
      properties: {
        targetId: { type: "string" },
        selector: { type: "string" },
      },
    },
  },
  {
    name: "click_selector",
    description: "Click a DOM element by CSS selector.",
    inputSchema: {
      type: "object",
      required: ["selector"],
      properties: {
        targetId: { type: "string" },
        selector: { type: "string" },
      },
    },
  },
  {
    name: "type_selector",
    description: "Set the value of a DOM element by CSS selector.",
    inputSchema: {
      type: "object",
      required: ["selector", "text"],
      properties: {
        targetId: { type: "string" },
        selector: { type: "string" },
        text: { type: "string" },
        clear: { type: "boolean" },
      },
    },
  },
  {
    name: "wait_for_navigation",
    description: "Wait until document.readyState is complete.",
    inputSchema: {
      type: "object",
      properties: {
        targetId: { type: "string" },
        timeoutMs: { type: "number" },
        intervalMs: { type: "number" },
      },
    },
  },
];

await startMcpServer({
  name: "desktop-browser-dom",
  enabled: COMPUTER_USE_ENABLED,
  tools,
  handlers: {
    list_tabs: async () => ({
      debugPort: CHROMIUM_DEBUG_PORT,
      tabs: await getTabs(),
    }),
    select_tab: async ({ targetId }) => ({
      targetId,
      result: await chromeText(`/json/activate/${targetId}`),
    }),
    navigate: async ({ targetId, url, waitMs = 1500 }) =>
      withCdp(targetId, async ({ send }) => {
        await send("Page.enable");
        const result = await send("Page.navigate", { url });
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        return result;
      }),
    dom_snapshot: async ({ targetId, selector, mode = "text" }) =>
      withCdp(targetId, async ({ send }) => {
        const expression = selector
          ? `(() => {
              const node = document.querySelector(${JSON.stringify(selector)});
              if (!node) return null;
              return ${mode === "html" ? "node.outerHTML" : "node.innerText"};
            })()`
          : mode === "html"
            ? "document.documentElement.outerHTML"
            : "document.body?.innerText ?? ''";
        const result = await send("Runtime.evaluate", evaluation(expression));
        return result.result.value;
      }),
    query_selector: async ({ targetId, selector }) =>
      withCdp(targetId, async ({ send }) => {
        const expression = `(() => {
          const node = document.querySelector(${JSON.stringify(selector)});
          if (!node) return { exists: false };
          const rect = node.getBoundingClientRect();
          return {
            exists: true,
            tagName: node.tagName,
            text: node.innerText ?? '',
            value: 'value' in node ? node.value : null,
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
          };
        })()`;
        const result = await send("Runtime.evaluate", evaluation(expression));
        return result.result.value;
      }),
    click_selector: async ({ targetId, selector }) =>
      withCdp(targetId, async ({ send }) => {
        const expression = `(() => {
          const node = document.querySelector(${JSON.stringify(selector)});
          if (!node) return { ok: false, reason: 'not-found' };
          node.scrollIntoView({ block: 'center', inline: 'center' });
          node.click();
          return { ok: true };
        })()`;
        const result = await send("Runtime.evaluate", evaluation(expression));
        return result.result.value;
      }),
    type_selector: async ({ targetId, selector, text, clear = true }) =>
      withCdp(targetId, async ({ send }) => {
        const expression = `(() => {
          const node = document.querySelector(${JSON.stringify(selector)});
          if (!node) return { ok: false, reason: 'not-found' };
          node.scrollIntoView({ block: 'center', inline: 'center' });
          node.focus();
          if (${clear ? "true" : "false"} && 'value' in node) node.value = '';
          if ('value' in node) {
            node.value = (${clear ? "''" : "node.value"}) + ${JSON.stringify(text)};
            node.dispatchEvent(new Event('input', { bubbles: true }));
            node.dispatchEvent(new Event('change', { bubbles: true }));
            return { ok: true, value: node.value };
          }
          if (node.isContentEditable) {
            node.textContent = ${JSON.stringify(text)};
            node.dispatchEvent(new Event('input', { bubbles: true }));
            return { ok: true, value: node.textContent };
          }
          return { ok: false, reason: 'unsupported-node' };
        })()`;
        const result = await send("Runtime.evaluate", evaluation(expression));
        return result.result.value;
      }),
    wait_for_navigation: async ({
      targetId,
      timeoutMs = 10_000,
      intervalMs = 250,
    }) =>
      withCdp(targetId, async ({ send }) => {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
          const result = await send(
            "Runtime.evaluate",
            evaluation("document.readyState"),
          );
          if (result.result.value === "complete") {
            return {
              readyState: "complete",
              elapsedMs: Date.now() - start,
            };
          }
          await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }
        return {
          readyState: "timeout",
          elapsedMs: Date.now() - start,
        };
      }),
  },
});
