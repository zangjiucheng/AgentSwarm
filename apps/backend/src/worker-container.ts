import Docker from "dockerode"
import { hostname } from "node:os"
import { PassThrough } from "node:stream"
import { config } from "./config"

export const docker = new Docker()

export const WORKER_MONITOR_PORT = "51300/tcp"
export const WORKER_PRESET_LABEL = "claudeswarm.preset"
export const WORKER_TITLE_LABEL = "claudeswarm.title"
export const WORKER_PARENT_LABEL = "claudeswarm.parent"
const RENDER_DEVICE_STAT_IMAGE = "busybox"

export let renderDeviceGroupId: number | undefined
export let selfIp: string | undefined
let runtimeInitialized = false

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

async function inspectSelfIp() {
  const containerId = hostname()
  const container = docker.getContainer(containerId)
  const inspection = await container.inspect()
  const network = Object.values(inspection.NetworkSettings.Networks)[0]

  if (!network?.IPAddress) {
    throw new Error("No IP address found in container network settings")
  }

  return network.IPAddress
}

export async function initializeWorkerContainerRuntime() {
  if (runtimeInitialized) {
    return
  }

  runtimeInitialized = true

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

  try {
    selfIp = await inspectSelfIp()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error"

    console.warn(
      `[backend] failed to detect own container IP; ORCHESTRATOR_ADDRESS will not be set: ${message}`,
    )
    selfIp = undefined
  }
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

export async function resolveWorkerByIp(ip: string) {
  const containers = await docker.listContainers({ all: true })

  for (const container of containers) {
    if (!isManagedContainer(container)) {
      continue
    }

    const networks = container.NetworkSettings?.Networks
    if (!networks) continue

    for (const network of Object.values(networks)) {
      if (network.IPAddress === ip) {
        return {
          id: container.Id,
          parentId: container.Labels?.[WORKER_PARENT_LABEL] || undefined,
        }
      }
    }
  }

  return undefined
}

export async function findManagedContainerById(id: string) {
  const containers = await docker.listContainers({ all: true })

  for (const container of containers) {
    if (!isManagedContainer(container)) {
      continue
    }

    if (container.Id === id) {
      return docker.getContainer(container.Id)
    }
  }

  return undefined
}
