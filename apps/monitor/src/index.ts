import { createBunHttpHandler } from "trpc-bun-adapter"
import { appRouter } from "./router"
import { MONITOR_UPLOAD_PATH } from "./monitor/constants"
import {
  closeTerminalProcess,
  createTerminalProcess,
  getTerminalCommand,
  handleTerminalClientMessage,
  initializeMonitor,
  MONITOR_TRPC_PATH,
  MONITOR_WS_PATH,
  type TerminalCommand,
  type TerminalProcess,
} from "./monitor"
import { handleUploadRequest } from "./monitor/upload"

const PORT = Number.parseInt(process.env.MONITOR_PORT ?? "51301", 10)
const HOST = process.env.MONITOR_HOST ?? "0.0.0.0"

type MonitorSocketData = {
  command: TerminalCommand
  terminal: TerminalProcess | null
}

await initializeMonitor()

const trpcHandler = createBunHttpHandler({
  endpoint: MONITOR_TRPC_PATH,
  router: appRouter,
})

Bun.serve({
  port: PORT,
  hostname: HOST,
  fetch(request, server) {
    const url = new URL(request.url)

    if (url.pathname === MONITOR_UPLOAD_PATH) {
      return handleUploadRequest(request)
    }

    if (url.pathname === MONITOR_WS_PATH) {
      const upgraded = server.upgrade(request, {
        data: {
          command: getTerminalCommand(request),
          terminal: null,
        } satisfies MonitorSocketData,
      })

      return upgraded
        ? undefined
        : new Response("Expected a websocket upgrade request", { status: 426 })
    }

    return trpcHandler(request, server) ?? new Response("Not found", { status: 404 })
  },
  websocket: {
    data: {} as MonitorSocketData,
    open(ws) {
      try {
        ws.data.terminal = createTerminalProcess(ws.data.command, {
          onOutput(data) {
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: "output", data }))
            }
          },
          onExit(exitCode) {
            ws.data.terminal = null

            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: "exit", exitCode }))
              ws.close()
            }
          },
        })
      } catch (error) {
        console.error("[monitor] failed to start websocket terminal", error)
        ws.close(1011, "Failed to start terminal")
      }
    },
    message(ws, message) {
      handleTerminalClientMessage(ws.data.terminal, message)
    },
    close(ws) {
      closeTerminalProcess(ws.data.terminal)
      ws.data.terminal = null
    },
  },
})

console.log(`[monitor] listening on http://${HOST}:${PORT}`)
