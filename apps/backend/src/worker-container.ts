import Docker from "dockerode"
import { PassThrough } from "node:stream"
import { config } from "./config"

export const docker = new Docker()

export const WORKER_MONITOR_PORT = "51300/tcp"
export const WORKER_PRESET_LABEL = "claudeswarm.preset"
export const WORKER_TITLE_LABEL = "claudeswarm.title"
const RENDER_DEVICE_STAT_IMAGE = "busybox"

export let renderDeviceGroupId: number | undefined
let renderDeviceGroupIdInitialized = false

function followDockerProgress(stream: NodeJS.ReadableStream) {
  return new Promise<void>((resolve, reject) => {
    docker.modem.followProgress(stream, (error: Error | null) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}

function parseRenderDeviceGroupId(statOutput: string) {
  const gidMatch = statOutput.match(/Gid:\s+\(\s*(\d+)\s*\//)

  if (!gidMatch) {
    throw new Error(
      `Failed to parse render device group id from stat output:\n${statOutput}`,
    )
  }

  const gidText = gidMatch[1]

  if (!gidText) {
    throw new Error("Failed to read render device group id from stat output")
  }

  const gid = Number.parseInt(gidText, 10)

  if (Number.isNaN(gid)) {
    throw new Error(`Parsed invalid render device group id: ${gidText}`)
  }

  return gid
}

async function inspectRenderDeviceGroupId() {
  await followDockerProgress(await docker.pull(RENDER_DEVICE_STAT_IMAGE))

  const outputStream = new PassThrough()
  outputStream.setEncoding("utf8")

  let statOutput = ""
  outputStream.on("data", (chunk: string) => {
    statOutput += chunk
  })

  await new Promise<void>((resolve, reject) => {
    docker.run(
      RENDER_DEVICE_STAT_IMAGE,
      ["stat", config.drinode],
      outputStream,
      {
        Tty: true,
        HostConfig: {
          AutoRemove: true,
          Privileged: true,
        },
      },
      {},
      (error) => {
        if (error) {
          reject(error instanceof Error ? error : new Error(String(error)))
          return
        }

        resolve()
      },
    )
  })

  return parseRenderDeviceGroupId(statOutput)
}

export async function initializeWorkerContainerRuntime() {
  if (renderDeviceGroupIdInitialized) {
    return renderDeviceGroupId
  }

  renderDeviceGroupIdInitialized = true

  try {
    renderDeviceGroupId = await inspectRenderDeviceGroupId()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error while inspecting render device"

    console.warn(
      `[backend] failed to inspect ${config.drinode}; workers will start without supplemental group: ${message}`,
    )
    renderDeviceGroupId = undefined
  }

  return renderDeviceGroupId
}

export function getPreset(name: string) {
  const preset = config.presets.find((candidate) => candidate.name === name)

  if (!preset) {
    throw new Error(`Unknown worker preset: ${name}`)
  }

  return preset
}

export function getKnownPresetNames() {
  return new Set(config.presets.map((preset) => preset.name))
}

function isManagedContainer(container: Docker.ContainerInfo) {
  return getKnownPresetNames().has(container.Labels?.[WORKER_PRESET_LABEL] ?? "")
}

export function readPublishedPort(container: Docker.ContainerInspectInfo) {
  const hostPort =
    container.NetworkSettings.Ports?.[WORKER_MONITOR_PORT]?.[0]?.HostPort

  if (!hostPort) {
    return undefined
  }

  const port = Number.parseInt(hostPort, 10)
  return Number.isNaN(port) ? undefined : port
}

export async function findManagedContainerByPort(port: number) {
  const containers = await docker.listContainers({ all: true })

  for (const container of containers) {
    if (!isManagedContainer(container)) {
      continue
    }

    const dockerContainer = docker.getContainer(container.Id)
    const inspection = await dockerContainer.inspect()

    if (readPublishedPort(inspection) === port) {
      return dockerContainer
    }
  }

  return undefined
}
