import { useEffect, useMemo, useRef, useState } from "react"
import { FitAddon } from "@xterm/addon-fit"
import { Terminal } from "@xterm/xterm"
import "@xterm/xterm/css/xterm.css"
import { getWorkerMonitorWebSocketUrl } from "../lib/worker-urls"

type TerminalTab = "terminal" | "codex"

type WorkerTerminalPanelProps = {
  isReady: boolean
  isStopped: boolean
  monitorPort: number
}

const TERMINAL_TAB_CONFIG: Record<TerminalTab, { command: string; label: string }> =
  {
    terminal: {
      command: "tmux attach-session -t terminal",
      label: "Terminal",
    },
    codex: {
      command: "tmux attach-session -t codex",
      label: "Codex",
    },
  }

function parseMonitorMessage(rawMessage: string) {
  try {
    return JSON.parse(rawMessage) as
      | { type: "exit"; exitCode: number }
      | { type: "output"; data: string }
  } catch {
    return null
  }
}

export function WorkerTerminalPanel({
  isReady,
  isStopped,
  monitorPort,
}: WorkerTerminalPanelProps) {
  const [activeTab, setActiveTab] = useState<TerminalTab>("terminal")
  const terminalHostRef = useRef<HTMLDivElement | null>(null)
  const panelCommand = useMemo(
    () => TERMINAL_TAB_CONFIG[activeTab].command,
    [activeTab],
  )

  useEffect(() => {
    const hostElement = terminalHostRef.current
    if (!hostElement || !isReady || monitorPort <= 0) {
      return
    }

    const term = new Terminal({
      allowProposedApi: false,
      convertEol: false,
      cursorBlink: true,
      fontFamily:
        '"SFMono-Regular", ui-monospace, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      fontSize: 12,
      scrollback: 10_000,
      theme: {
        background: "#161616",
        cursor: "#f3f4f6",
        foreground: "#f3f4f6",
        selectionBackground: "#374151",
      },
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(hostElement)

    const socket = new WebSocket(
      getWorkerMonitorWebSocketUrl(monitorPort, panelCommand),
    )

    const sendResize = () => {
      fitAddon.fit()

      if (socket.readyState !== WebSocket.OPEN) {
        return
      }

      socket.send(
        JSON.stringify({
          type: "resize",
          cols: term.cols,
          rows: term.rows,
        }),
      )
    }

    socket.addEventListener("open", sendResize)
    socket.addEventListener("message", (event) => {
      const payload =
        typeof event.data === "string" ? event.data : String(event.data)
      const parsed = parseMonitorMessage(payload)

      if (!parsed) {
        return
      }

      if (parsed.type === "output") {
        term.write(parsed.data)
        return
      }

      term.write(`\r\n[process exited with code ${parsed.exitCode}]\r\n`)
    })
    socket.addEventListener("close", () => {
      term.write("\r\n[connection closed]\r\n")
    })
    socket.addEventListener("error", () => {
      term.write("\r\n[connection error]\r\n")
    })

    const resizeObserver = new ResizeObserver(() => {
      sendResize()
    })
    resizeObserver.observe(hostElement)

    const dataDisposable = term.onData((data) => {
      if (socket.readyState !== WebSocket.OPEN) {
        return
      }

      socket.send(JSON.stringify({ type: "input", data }))
    })

    sendResize()

    return () => {
      resizeObserver.disconnect()
      dataDisposable.dispose()
      socket.close()
      term.dispose()
    }
  }, [isReady, monitorPort, panelCommand])

  return (
    <section className="flex h-72 shrink-0 flex-col border-t border-gray-700 bg-[#1b1b1b]">
      <div className="flex items-center gap-2 border-b border-gray-800 px-4 py-2">
        {(Object.entries(TERMINAL_TAB_CONFIG) as Array<
          [TerminalTab, { label: string }]
        >).map(([tabKey, tab]) => {
          const isActive = tabKey === activeTab

          return (
            <button
              className={`rounded-md px-3 py-1.5 text-sm transition ${
                isActive
                  ? "bg-[#2a2a2a] text-white"
                  : "text-gray-400 hover:bg-[#232323] hover:text-gray-200"
              }`}
              key={tabKey}
              onClick={() => setActiveTab(tabKey)}
              type="button"
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {isReady && monitorPort > 0 ? (
        <div className="min-h-0 flex-1 p-2">
          <div
            className="h-full w-full overflow-hidden rounded-md border border-gray-800 bg-[#161616]"
            ref={terminalHostRef}
          />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center px-6 text-center">
          <div className="max-w-md">
            <p className="text-sm font-medium text-gray-200">
              {isStopped ? "Terminal is unavailable while the worker is stopped" : "Terminal is not ready"}
            </p>
            <p className="mt-2 text-xs text-gray-500">
              {isStopped
                ? "Start the worker to reconnect the shared terminal and codex sessions."
                : "The monitor endpoint is not available yet. Wait for the worker to finish starting."}
            </p>
          </div>
        </div>
      )}
    </section>
  )
}
