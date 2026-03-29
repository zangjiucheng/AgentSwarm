import {
  COMPUTER_USE_ENABLED,
  cursorState,
  readClipboard,
  run,
  sleep,
  writeClipboard,
} from "./lib/desktop-common.mjs";
import { startMcpServer } from "./lib/mcp-server.mjs";

async function moveMouse({ x, y }) {
  await run("xdotool", ["mousemove", String(x), String(y)]);
  return cursorState();
}

async function click({
  x,
  y,
  button = 1,
  repeat = 1,
  delayMs = 100,
} = {}) {
  if (typeof x === "number" && typeof y === "number") {
    await moveMouse({ x, y });
  }
  await run("xdotool", [
    "click",
    "--repeat",
    String(repeat),
    "--delay",
    String(delayMs),
    String(button),
  ]);
  return { ok: true };
}

async function pressKey({ key }) {
  await run("xdotool", ["key", "--clearmodifiers", key]);
  return { ok: true };
}

async function hotkey({ keys }) {
  const chord = Array.isArray(keys) ? keys.join("+") : String(keys);
  await run("xdotool", ["key", "--clearmodifiers", chord]);
  return { ok: true, chord };
}

async function typeText({ text, delayMs = 20 }) {
  await run("xdotool", ["type", "--delay", String(delayMs), text]);
  return { ok: true, length: text.length };
}

async function scroll({ direction = "down", clicks = 3 }) {
  const button = direction === "up" ? "4" : "5";
  await run("xdotool", [
    "click",
    "--repeat",
    String(clicks),
    "--delay",
    "80",
    button,
  ]);
  return { ok: true };
}

async function drag({
  startX,
  startY,
  endX,
  endY,
  button = 1,
  stepDelayMs = 150,
} = {}) {
  await run("xdotool", ["mousemove", String(startX), String(startY)]);
  await run("xdotool", ["mousedown", String(button)]);
  await sleep(stepDelayMs);
  await run("xdotool", ["mousemove", String(endX), String(endY)]);
  await sleep(stepDelayMs);
  await run("xdotool", ["mouseup", String(button)]);
  return { ok: true };
}

const tools = [
  {
    name: "move_mouse",
    description: "Move the cursor to absolute coordinates.",
    inputSchema: {
      type: "object",
      required: ["x", "y"],
      properties: { x: { type: "number" }, y: { type: "number" } },
    },
  },
  {
    name: "click",
    description: "Move optionally, then click a mouse button.",
    inputSchema: {
      type: "object",
      properties: {
        x: { type: "number" },
        y: { type: "number" },
        button: { type: "number" },
        repeat: { type: "number" },
        delayMs: { type: "number" },
      },
    },
  },
  {
    name: "double_click",
    description: "Perform a double click.",
    inputSchema: {
      type: "object",
      properties: { x: { type: "number" }, y: { type: "number" } },
    },
  },
  {
    name: "right_click",
    description: "Perform a right click.",
    inputSchema: {
      type: "object",
      properties: { x: { type: "number" }, y: { type: "number" } },
    },
  },
  {
    name: "drag",
    description: "Drag the mouse from one point to another.",
    inputSchema: {
      type: "object",
      required: ["startX", "startY", "endX", "endY"],
      properties: {
        startX: { type: "number" },
        startY: { type: "number" },
        endX: { type: "number" },
        endY: { type: "number" },
        button: { type: "number" },
        stepDelayMs: { type: "number" },
      },
    },
  },
  {
    name: "scroll",
    description: "Scroll the mouse wheel up or down.",
    inputSchema: {
      type: "object",
      properties: {
        direction: { type: "string", enum: ["up", "down"] },
        clicks: { type: "number" },
      },
    },
  },
  {
    name: "type_text",
    description: "Type text into the currently focused control.",
    inputSchema: {
      type: "object",
      required: ["text"],
      properties: { text: { type: "string" }, delayMs: { type: "number" } },
    },
  },
  {
    name: "press_key",
    description: "Press a single xdotool key expression.",
    inputSchema: {
      type: "object",
      required: ["key"],
      properties: { key: { type: "string" } },
    },
  },
  {
    name: "hotkey",
    description: "Press a multi-key chord such as ctrl+l or alt+Tab.",
    inputSchema: {
      type: "object",
      required: ["keys"],
      properties: {
        keys: {
          oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
        },
      },
    },
  },
  {
    name: "clipboard_get",
    description: "Read the clipboard contents.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "clipboard_set",
    description: "Write text into the clipboard.",
    inputSchema: {
      type: "object",
      required: ["text"],
      properties: { text: { type: "string" } },
    },
  },
];

startMcpServer({
  name: "desktop-input",
  enabled: COMPUTER_USE_ENABLED,
  tools,
  handlers: {
    move_mouse: moveMouse,
    click,
    double_click: async ({ x, y }) => click({ x, y, repeat: 2 }),
    right_click: async ({ x, y }) => click({ x, y, button: 3 }),
    drag,
    scroll,
    type_text: typeText,
    press_key: pressKey,
    hotkey,
    clipboard_get: async () => readClipboard(),
    clipboard_set: async ({ text }) => writeClipboard(text),
  },
});
