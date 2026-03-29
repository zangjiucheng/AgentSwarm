import path from "node:path";
import {
  COMPUTER_USE_ENABLED,
  DOWNLOADS_DIR,
  WORKSPACE_DIR,
  listDirectory,
  pathExists,
  run,
} from "./lib/desktop-common.mjs";
import { startMcpServer } from "./lib/mcp-server.mjs";

function resolveUserPath(inputPath = "") {
  if (!inputPath) return DOWNLOADS_DIR;
  if (path.isAbsolute(inputPath)) return inputPath;
  return path.join(WORKSPACE_DIR, inputPath);
}

const tools = [
  {
    name: "list_downloads",
    description: "List files in the worker Downloads directory.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_directory",
    description: "List files in a target directory.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
    },
  },
  {
    name: "path_exists",
    description: "Check whether a path exists inside the worker.",
    inputSchema: {
      type: "object",
      required: ["path"],
      properties: { path: { type: "string" } },
    },
  },
  {
    name: "recent_downloads",
    description: "Return the newest files in Downloads.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "number" } },
    },
  },
  {
    name: "type_path_in_file_dialog",
    description: "Enter a path into a GTK-like file picker path box using Ctrl+L.",
    inputSchema: {
      type: "object",
      required: ["path"],
      properties: { path: { type: "string" } },
    },
  },
  {
    name: "confirm_file_dialog",
    description: "Confirm the active file picker dialog with Return.",
    inputSchema: { type: "object", properties: {} },
  },
];

startMcpServer({
  name: "desktop-files",
  enabled: COMPUTER_USE_ENABLED,
  tools,
  handlers: {
    list_downloads: async () => ({
      path: DOWNLOADS_DIR,
      entries: await listDirectory(DOWNLOADS_DIR),
    }),
    list_directory: async ({ path: dirPath }) => ({
      path: resolveUserPath(dirPath),
      entries: await listDirectory(resolveUserPath(dirPath)),
    }),
    path_exists: async ({ path: candidate }) => ({
      path: resolveUserPath(candidate),
      exists: await pathExists(resolveUserPath(candidate)),
    }),
    recent_downloads: async ({ limit = 10 }) => {
      const entries = await listDirectory(DOWNLOADS_DIR);
      return {
        path: DOWNLOADS_DIR,
        entries: entries.slice(0, limit),
      };
    },
    type_path_in_file_dialog: async ({ path: candidate }) => {
      const resolved = resolveUserPath(candidate);
      await run("xdotool", ["key", "--clearmodifiers", "ctrl+l"]);
      await run("xdotool", ["type", "--delay", "10", resolved]);
      return { ok: true, path: resolved };
    },
    confirm_file_dialog: async () => {
      await run("xdotool", ["key", "--clearmodifiers", "Return"]);
      return { ok: true };
    },
  },
});
