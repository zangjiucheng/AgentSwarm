import { docker } from "./worker-container"

const COMPUTER_USE_STATE_DIR = "/home/kasm-user/.agentswarm/computer-use"
const COMPUTER_USE_STATUS_FILE = `${COMPUTER_USE_STATE_DIR}/status`
const COMPUTER_USE_ERROR_FILE = `${COMPUTER_USE_STATE_DIR}/error`
const COMPUTER_USE_LOG_FILE = `${COMPUTER_USE_STATE_DIR}/provision.log`
const COMPUTER_USE_EXEC_TIMEOUT_MS = 5_000

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

function parseTarEntryContent(archiveBuffer: Buffer) {
  if (archiveBuffer.length < 512) {
    return null
  }

  const header = archiveBuffer.subarray(0, 512)
  const name = header
    .subarray(0, 100)
    .toString("utf8")
    .replace(/\0.*$/, "")

  if (!name) {
    return null
  }

  const sizeRaw = header
    .subarray(124, 136)
    .toString("utf8")
    .replace(/\0.*$/, "")
    .trim()
  const size = Number.parseInt(sizeRaw || "0", 8)

  if (!Number.isFinite(size) || size < 0) {
    return null
  }

  return archiveBuffer.subarray(512, 512 + size).toString("utf8")
}

async function readArchiveFile(
  containerId: string,
  path: string,
) {
  try {
    const archiveStream = await docker.getContainer(containerId).getArchive({
      path,
    })
    const archiveBuffer = Buffer.from(await collectStream(archiveStream))
    return parseTarEntryContent(archiveBuffer)
  } catch (error) {
    const statusCode =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
        ? error.statusCode
        : undefined

    if (statusCode === 404) {
      return null
    }

    throw error
  }
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
    const [rawStatus, rawError, rawLog] = await Promise.race([
      Promise.all([
        readArchiveFile(input.containerId, COMPUTER_USE_STATUS_FILE),
        readArchiveFile(input.containerId, COMPUTER_USE_ERROR_FILE),
        readArchiveFile(input.containerId, COMPUTER_USE_LOG_FILE),
      ]),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error("Timed out reading computer use state"))
        }, COMPUTER_USE_EXEC_TIMEOUT_MS)
      }),
    ])

    const parsedStatus =
      rawStatus?.trim() === "ready" ||
      rawStatus?.trim() === "error" ||
      rawStatus?.trim() === "preparing" ||
      rawStatus?.trim() === "disabled"
        ? rawStatus.trim()
        : "preparing"
    const error = rawError?.trim() || null
    const log = rawLog?.trim() || null

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
