import { spawn as spawnPty } from "bun-pty"
import {
  DEFAULT_TERMINAL_COLUMNS,
  DEFAULT_TERMINAL_ROWS,
} from "./constants"
import { getDefaultShell } from "./utils"

export interface TerminalCommand {
  cmd: string
  args: string[]
}

export type TerminalProcess = ReturnType<typeof spawnPty>

type TerminalClientMessage =
  | { type: "input"; data: string }
  | { type: "resize"; cols: number; rows: number }

const messageDecoder = new TextDecoder()

function decodeSocketMessage(message: string | ArrayBuffer | Uint8Array) {
  if (typeof message === "string") {
    return message
  }

  if (message instanceof ArrayBuffer) {
    return messageDecoder.decode(new Uint8Array(message))
  }

  return messageDecoder.decode(message)
}

export function getTerminalCommand(request: Request): TerminalCommand {
  const url = new URL(request.url)
  const fallbackCommand = getDefaultShell()
  const rawCommand = url.searchParams.get("cmd") ?? fallbackCommand
  const parts = rawCommand
    .trim()
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length === 0) {
    return { args: [], cmd: fallbackCommand }
  }

  const cmd = parts[0] ?? fallbackCommand
  const args = parts.slice(1)

  return { args, cmd }
}

export function createTerminalProcess(
  command: TerminalCommand,
  callbacks: {
    onExit: (exitCode: number) => void
    onOutput: (data: string) => void
  },
) {
  const terminal = spawnPty(command.cmd, command.args, {
    cols: DEFAULT_TERMINAL_COLUMNS,
    env: {
      ...(process.env as Record<string, string>),
      COLORTERM: "truecolor",
      TERM: "xterm-256color",
    },
    name: "xterm-256color",
    rows: DEFAULT_TERMINAL_ROWS,
  })

  terminal.onData((data) => {
    callbacks.onOutput(data)
  })

  terminal.onExit(({ exitCode }) => {
    callbacks.onExit(exitCode)
  })

  return terminal
}

export function closeTerminalProcess(terminal: TerminalProcess | null) {
  if (!terminal) {
    return
  }

  try {
    terminal.kill()
  } catch {
    // Ignore cleanup failures for already-exited terminals.
  }
}

export function handleTerminalClientMessage(
  terminal: TerminalProcess | null,
  message: string | ArrayBuffer | Uint8Array,
) {
  if (!terminal) {
    return
  }

  try {
    const parsedMessage = JSON.parse(
      decodeSocketMessage(message),
    ) as TerminalClientMessage

    if (parsedMessage.type === "input") {
      terminal.write(parsedMessage.data)
      return
    }

    if (
      parsedMessage.type === "resize" &&
      Number.isFinite(parsedMessage.cols) &&
      Number.isFinite(parsedMessage.rows)
    ) {
      terminal.resize(parsedMessage.cols, parsedMessage.rows)
    }
  } catch {
    // Ignore malformed websocket messages from the client.
  }
}
