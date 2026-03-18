import Docker from "dockerode"
import { hostname } from "node:os"
import { config } from "./config"

export const docker = new Docker()

export const WORKER_WEB_PORT = "51300/tcp"
export const WORKER_MONITOR_PORT = "51301/tcp"
export const WORKER_PRESET_LABEL = "agentswarm.preset"
export const WORKER_TITLE_LABEL = "agentswarm.title"
export const WORKER_PARENT_LABEL = "agentswarm.parent"

export let selfIp: string | undefined
let runtimeInitialized = false

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

export function readPublishedPort(
  container: Docker.ContainerInspectInfo,
  portDefinition = WORKER_WEB_PORT,
) {
  const hostPort =
    container.NetworkSettings.Ports?.[portDefinition]?.[0]?.HostPort

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
          preset: container.Labels?.[WORKER_PRESET_LABEL] || undefined,
        }
      }
    }
  }

  return undefined
}

export async function getContainerEnv(id: string) {
  const container = docker.getContainer(id)
  const inspection = await container.inspect()
  const env: Record<string, string> = {}

  for (const entry of inspection.Config.Env ?? []) {
    const eqIdx = entry.indexOf("=")

    if (eqIdx >= 0) {
      env[entry.slice(0, eqIdx)] = entry.slice(eqIdx + 1)
    }
  }

  return env
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
