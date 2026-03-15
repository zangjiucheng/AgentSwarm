import { XTerm } from "@pablo-lion/xterm-react"
import { FitAddon } from "@xterm/addon-fit"
import { useCallback, useEffect, useMemo, useRef } from "react"
import { getWorkerTerminalUrl } from "../lib/worker-urls"

type TerminalSessionProps = {
  command: string
  isActive: boolean
  port: number
  title: string
}

type TerminalMessage =
  | { type: "output"; data: string }
  | { type: "exit"; exitCode: number }

const terminalTheme = {
  background: "#282828",
  foreground: "#f8f8f2",
  cursor: "#f8f8f2",
  cursorAccent: "#282a36",
  selectionBackground: "#44475a",
  black: "#21222c",
  red: "#ff5555",
  green: "#50fa7b",
  yellow: "#f1fa8c",
  blue: "#bd93f9",
  magenta: "#ff79c6",
  cyan: "#8be9fd",
  white: "#f8f8f2",
  brightBlack: "#6272a4",
  brightRed: "#ff6e6e",
  brightGreen: "#69ff94",
  brightYellow: "#ffffa5",
  brightBlue: "#d6acff",
  brightMagenta: "#ff92df",
  brightCyan: "#a4ffff",
  brightWhite: "#ffffff",
} as const

const terminalOptions = {
  allowProposedApi: false,
  convertEol: true,
  cursorBlink: true,
  fontFamily:
    '"JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, monospace',
  fontSize: 14,
  lineHeight: 1.1,
  theme: terminalTheme,
} as const

export function TerminalSession({
  command,
  isActive,
  port,
}: TerminalSessionProps) {
  const xtermRef = useRef<InstanceType<typeof XTerm> | null>(null)
  const fitAddon = useMemo(() => new FitAddon(), [])
  const socketRef = useRef<WebSocket | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const safeFit = useCallback(() => {
    try {
      fitAddon.fit()
    } catch {
      // fit() throws when the terminal element has zero dimensions (e.g. display:none)
    }
  }, [fitAddon])

  const terminalUrl = useMemo(
    () => getWorkerTerminalUrl(port, command),
    [command, port],
  )

  useEffect(() => {
    const socket = new WebSocket(terminalUrl)
    socketRef.current = socket

    const sendResize = () => {
      const xterm = xtermRef.current
      if (socket.readyState !== WebSocket.OPEN || !xterm?.terminal) return

      safeFit()
      const { cols, rows } = xterm.terminal
      socket.send(JSON.stringify({ cols, rows, type: "resize" }))
    }

    socket.addEventListener("open", () => {
      requestAnimationFrame(sendResize)
    })

    socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(String(event.data)) as TerminalMessage

        if (message.type === "output") {
          xtermRef.current?.write(message.data)
          return
        }

        if (message.type === "exit") {
          xtermRef.current?.writeln(
            `\r\n\u001b[31m[session exited with code ${message.exitCode}]\u001b[0m`,
          )
        }
      } catch {
        xtermRef.current?.writeln(
          "\r\n\u001b[31m[invalid terminal message]\u001b[0m",
        )
      }
    })

    const resizeObserver = new ResizeObserver(() => {
      sendResize()
    })

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    requestAnimationFrame(() => {
      safeFit()
      sendResize()
    })

    return () => {
      resizeObserver.disconnect()
      socket.close()
      socketRef.current = null
    }
  }, [terminalUrl, fitAddon, safeFit])

  useEffect(() => {
    requestAnimationFrame(() => {
      safeFit()
      xtermRef.current?.focus()

      const socket = socketRef.current
      const xterm = xtermRef.current

      if (!xterm?.terminal || socket?.readyState !== WebSocket.OPEN) return

      const { cols, rows } = xterm.terminal
      socket.send(JSON.stringify({ cols, rows, type: "resize" }))
    })
  }, [safeFit])

  const handleData = (data: string) => {
    const socket = socketRef.current
    if (socket?.readyState !== WebSocket.OPEN) return
    socket.send(JSON.stringify({ data, type: "input" }))
  }

  return (
    <div className={isActive ? "absolute inset-0" : "absolute inset-0 hidden"}>
      <div
        ref={containerRef}
        className="h-full w-full overflow-hidden bg-[#282828] pt-2"
      >
        <XTerm
          ref={xtermRef}
          className="h-full w-full"
          options={terminalOptions}
          addons={[fitAddon]}
          onData={handleData}
        />
      </div>
    </div>
  )
}
