import { PassThrough } from "node:stream"
import { docker } from "./worker-container"

const COMPUTER_USE_STATE_DIR = "/home/kasm-user/.agentswarm/computer-use"
const COMPUTER_USE_STATUS_FILE = `${COMPUTER_USE_STATE_DIR}/status`
const COMPUTER_USE_ERROR_FILE = `${COMPUTER_USE_STATE_DIR}/error`
const COMPUTER_USE_LOG_FILE = `${COMPUTER_USE_STATE_DIR}/provision.log`
const COMPUTER_USE_EXEC_TIMEOUT_MS = 1_500

export type ComputerUseStatus = "disabled" | "preparing" | "ready" | "error"

export type ComputerUseState = {
  error: string | null
  log: string | null
  status: ComputerUseStatus
}

async function collectStream(stream: NodeJS.ReadableStream) {
  const chunks: Buffer[] = []

  await new Promise<void>((resolve, reject) => {
    stream.on("data", (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    stream.on("end", resolve)
    stream.on("error", reject)
  })

  return Buffer.concat(chunks).toString("utf8")
}

async function execCapture(
  containerId: string,
  cmd: string[],
) {
  const exec = await docker.getContainer(containerId).exec({
    AttachStderr: true,
    AttachStdout: true,
    Cmd: cmd,
    Tty: false,
  })

  const stream = await exec.start({ hijack: false, stdin: false })
  const stdout = new PassThrough()
  const stderr = new PassThrough()

  docker.modem.demuxStream(stream, stdout, stderr)

  const [stdoutText, stderrText] = await Promise.all([
    collectStream(stdout),
    collectStream(stderr),
  ])
  const result = await exec.inspect()

  return {
    exitCode: result.ExitCode ?? 1,
    stderr: stderrText.trim(),
    stdout: stdoutText,
  }
}

function parseSection(content: string, marker: string) {
  const start = content.indexOf(marker)

  if (start < 0) {
    return ""
  }

  const remainder = content.slice(start + marker.length)
  const nextMarker = remainder.indexOf("\n__")
  const section = nextMarker >= 0 ? remainder.slice(0, nextMarker) : remainder

  return section.trim()
}

export async function readComputerUseState(input: {
  computerUseEnabled: boolean
  containerId: string
  running: boolean
}) {
  if (!input.computerUseEnabled) {
    return {
      error: null,
      log: null,
      status: "disabled",
    } satisfies ComputerUseState
  }

  if (!input.running) {
    return {
      error: null,
      log: null,
      status: "disabled",
    } satisfies ComputerUseState
  }

  try {
    const output = await Promise.race([
      execCapture(input.containerId, [
        "sh",
        "-lc",
        `
          printf '__STATUS__\\n'
          cat "${COMPUTER_USE_STATUS_FILE}" 2>/dev/null || true
          printf '\\n__ERROR__\\n'
          cat "${COMPUTER_USE_ERROR_FILE}" 2>/dev/null || true
          printf '\\n__LOG__\\n'
          tail -n 80 "${COMPUTER_USE_LOG_FILE}" 2>/dev/null || true
        `,
      ]),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error("Timed out reading computer use state"))
        }, COMPUTER_USE_EXEC_TIMEOUT_MS)
      }),
    ])

    const rawStatus = parseSection(output.stdout, "__STATUS__")
    const parsedStatus =
      rawStatus === "ready" ||
      rawStatus === "error" ||
      rawStatus === "preparing" ||
      rawStatus === "disabled"
        ? rawStatus
        : "preparing"
    const error = parseSection(output.stdout, "__ERROR__") || null
    const log = parseSection(output.stdout, "__LOG__") || null

    return {
      error,
      log,
      status: parsedStatus,
    } satisfies ComputerUseState
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to read computer use state",
      log: null,
      status: "preparing",
    } satisfies ComputerUseState
  }
}
