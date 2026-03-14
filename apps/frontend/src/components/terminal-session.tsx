import { Button, Spinner } from "@heroui/react"
import { FitAddon } from "@xterm/addon-fit"
import { Terminal } from "xterm"
import { useEffect, useMemo, useRef, useState } from "react"
import { getWorkerTerminalUrl } from "../lib/worker-urls"

type TerminalSessionProps = {
  command: string
  isActive: boolean
  port: number
  title: string
}

type ConnectionState = "connecting" | "connected" | "closed" | "error"

type TerminalMessage =
  | { type: "output"; data: string }
  | { type: "exit"; exitCode: number }

const terminalTheme = {
  background: "#09090f",
  foreground: "#f5f3ff",
  cursor: "#c084fc",
  cursorAccent: "#09090f",
  selectionBackground: "rgba(192, 132, 252, 0.24)",
  black: "#0a0a12",
  red: "#f31260",
  green: "#17c964",
  yellow: "#f5a524",
  blue: "#7c3aed",
  magenta: "#9353d3",
  cyan: "#06b6d4",
  white: "#f5f3ff",
  brightBlack: "#71717a",
  brightRed: "#fb7185",
  brightGreen: "#4ade80",
  brightYellow: "#facc15",
  brightBlue: "#a78bfa",
  brightMagenta: "#c084fc",
  brightCyan: "#22d3ee",
  brightWhite: "#ffffff",
} as const

export function TerminalSession({
  command,
  isActive,
  port,
  title,
}: TerminalSessionProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const cleanupRef = useRef(false)
  const isActiveRef = useRef(isActive)
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("connecting")
  const [reconnectCount, setReconnectCount] = useState(0)
  const [exitCode, setExitCode] = useState<number | null>(null)

  const terminalUrl = useMemo(
    () => getWorkerTerminalUrl(port, command),
    [command, port],
  )

  useEffect(() => {
    isActiveRef.current = isActive
  }, [isActive])

  useEffect(() => {
    const container = containerRef.current

    if (!container) {
      return
    }

    cleanupRef.current = false

    const terminal = new Terminal({
      allowProposedApi: false,
      convertEol: true,
      cursorBlink: true,
      fontFamily:
        '"JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, monospace',
      fontSize: 13,
      lineHeight: 1.45,
      theme: terminalTheme,
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(container)
    terminal.focus()
    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    const sendResize = () => {
      const socket = socketRef.current

      if (socket?.readyState !== WebSocket.OPEN) {
        return
      }

      fitAddon.fit()
      socket.send(
        JSON.stringify({
          cols: terminal.cols,
          rows: terminal.rows,
          type: "resize",
        }),
      )
    }

    const socket = new WebSocket(terminalUrl)
    socketRef.current = socket

    socket.addEventListener("open", () => {
      setConnectionState("connected")
      terminal.writeln(`\u001b[90mconnected to ${title}\u001b[0m`)
      requestAnimationFrame(sendResize)
    })

    socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(String(event.data)) as TerminalMessage

        if (message.type === "output") {
          terminal.write(message.data)
          return
        }

        if (message.type === "exit") {
          setExitCode(message.exitCode)
          setConnectionState("closed")
          terminal.writeln(
            `\r\n\u001b[31m[session exited with code ${message.exitCode}]\u001b[0m`,
          )
        }
      } catch {
        terminal.writeln("\r\n\u001b[31m[invalid terminal message]\u001b[0m")
      }
    })

    socket.addEventListener("error", () => {
      setConnectionState("error")
    })

    socket.addEventListener("close", () => {
      if (cleanupRef.current) {
        return
      }

        setConnectionState((currentState) =>
          currentState === "connected" ? "closed" : currentState,
        )
    })

    const dataDisposable = terminal.onData((data) => {
      if (socket.readyState !== WebSocket.OPEN) {
        return
      }

      socket.send(JSON.stringify({ data, type: "input" }))
    })

    const resizeObserver = new ResizeObserver(() => {
      if (isActiveRef.current) {
        sendResize()
      }
    })

    resizeObserver.observe(container)

    requestAnimationFrame(() => {
      fitAddon.fit()

      if (isActiveRef.current) {
        sendResize()
      }
    })

    return () => {
      cleanupRef.current = true
      dataDisposable.dispose()
      resizeObserver.disconnect()
      socket.close()
      socketRef.current = null
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [reconnectCount, terminalUrl, title])

  useEffect(() => {
    if (!isActive) {
      return
    }

    requestAnimationFrame(() => {
      fitAddonRef.current?.fit()
      terminalRef.current?.focus()

      const socket = socketRef.current
      const terminal = terminalRef.current

      if (!terminal || socket?.readyState !== WebSocket.OPEN) {
        return
      }

      socket.send(
        JSON.stringify({
          cols: terminal.cols,
          rows: terminal.rows,
          type: "resize",
        }),
      )
    })
  }, [isActive])

  const showOverlay = connectionState !== "connected"

  return (
    <div className={isActive ? "absolute inset-0" : "absolute inset-0 hidden"}>
      <div className="relative h-full w-full">
        <div className="terminal-host" ref={containerRef} />
        {showOverlay ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="flex max-w-sm flex-col items-center gap-3 px-6 text-center">
              {connectionState === "connecting" ? (
                <>
                  <Spinner color="secondary" size="sm" />
                  <p className="text-sm text-default-500">
                    Connecting to the {title} session.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm text-default-400">
                    {exitCode === null
                      ? `The ${title} session is unavailable.`
                      : `The ${title} session exited with code ${exitCode}.`}
                  </p>
                  <Button
                    color="secondary"
                    onPress={() => {
                      setConnectionState("connecting")
                      setExitCode(null)
                      setReconnectCount((count) => count + 1)
                    }}
                    size="sm"
                    variant="flat"
                  >
                    Reconnect
                  </Button>
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
