import type Docker from "dockerode"
import {
  docker,
  getKnownPresetNames,
  readPublishedPort,
  currentAgentSwarmVersion,
  WORKER_CREATED_WITH_VERSION_LABEL,
  WORKER_IMAGE_TAG_LABEL,
  WORKER_MONITOR_PORT,
  WORKER_PARENT_LABEL,
  WORKER_PRESET_LABEL,
  WORKER_SSH_PORT,
  WORKER_TITLE_LABEL,
  WORKER_VNC_PORT,
} from "./worker-container"
import { getEffectiveGithubAccountForWorker, getStoredWorkerTitle } from "./secrets"
import { readComputerUseState, type ComputerUseStatus } from "./computer-use"
import { pruneWorkerOutputs } from "./worker-output-store"

const WORKERS_CACHE_TTL_MS = 900

export type WorkerInfo = {
  id: string
  title: string
  preset: string
  status: "ready" | "error" | "stopped"
  port: number
  monitorPort: number
  sshEnabled: boolean
  sshPort: number
  computerUseEnabled: boolean
  computerUseStatus: ComputerUseStatus
  vncPort: number
  createdWithVersion: string
  currentAgentSwarmVersion: string
  workerImageTag: string
  githubAccountId?: string
  githubAccountName?: string
  githubConfigured: boolean
  githubUsername: string
  usesDefaultGithubAccount: boolean
  durationS: number
  createdAt: number
}

export type WorkersResult = {
  workers: WorkerInfo[]
  hierarchy: Record<string, string[]>
}

const workersCache: {
  data: WorkersResult
  fetchedAt: number
  promise: Promise<WorkersResult> | null
} = {
  data: { workers: [], hierarchy: {} },
  fetchedAt: 0,
  promise: null,
}

function isCacheFresh() {
  return Date.now() - workersCache.fetchedAt <= WORKERS_CACHE_TTL_MS
}

function parseStartedAtMs(isoTimestamp?: string) {
  if (!isoTimestamp || isoTimestamp.startsWith("0001-01-01")) {
    return undefined
  }

  const timestamp = Date.parse(isoTimestamp)
  return Number.isNaN(timestamp) ? undefined : timestamp
}

function getDurationS(
  container: Docker.ContainerInspectInfo,
  createdAtUnixSeconds: number,
) {
  const startedAtMs = parseStartedAtMs(container.State.StartedAt)
  const createdAtMs = createdAtUnixSeconds * 1_000
  const baseTimestamp = startedAtMs ?? createdAtMs

  return Math.max(0, Math.floor((Date.now() - baseTimestamp) / 1_000))
}

function getContainerMonitorStatus(
  container: Docker.ContainerInspectInfo,
): Pick<WorkerInfo, "status"> {
  if (!container.State.Running) {
    return {
      status: "stopped" as const,
    }
  }

  const healthStatus = container.State.Health?.Status

  if (healthStatus === "healthy") {
    return {
      status: "ready" as const,
    }
  }

  return {
    status: "error" as const,
  }
}

async function inspectWorkerContainer(containerId: string) {
  return docker.getContainer(containerId).inspect()
}

function readContainerEnv(entries: string[] | undefined) {
  const env: Record<string, string> = {}

  for (const entry of entries ?? []) {
    const eqIdx = entry.indexOf("=")

    if (eqIdx < 0) {
      continue
    }

    env[entry.slice(0, eqIdx)] = entry.slice(eqIdx + 1)
  }

  return env
}

async function loadWorkers(): Promise<WorkersResult> {
  const knownPresets = getKnownPresetNames()
  const containers = await docker.listContainers({ all: true })

  const workerContainers = containers.filter((container) =>
    knownPresets.has(container.Labels?.[WORKER_PRESET_LABEL] ?? ""),
  )

  const allWorkers = await Promise.all(
    workerContainers.map(async (container) => {
      const inspection = await inspectWorkerContainer(container.Id)
      const env = readContainerEnv(inspection.Config.Env)
      const port = readPublishedPort(inspection)
      const monitorPort = readPublishedPort(inspection, WORKER_MONITOR_PORT)
      const sshPort = readPublishedPort(inspection, WORKER_SSH_PORT)
      const vncPort = readPublishedPort(inspection, WORKER_VNC_PORT)
      const sshEnabled = env.WORKER_SSH_ENABLED === "1"
      const computerUseEnabled = env.WORKER_COMPUTER_USE_ENABLED === "1"
      const computerUseState = await readComputerUseState({
        computerUseEnabled,
        containerId: container.Id,
        running: inspection.State.Running,
      })
      const monitorStatus = getContainerMonitorStatus(inspection)
      const githubAccount = getEffectiveGithubAccountForWorker(container.Id)
      const storedTitle = getStoredWorkerTitle(container.Id)

      const parentId =
        inspection.Config.Labels?.[WORKER_PARENT_LABEL] ??
        container.Labels?.[WORKER_PARENT_LABEL] ??
        undefined

      return {
        parentId,
        info: {
          id: container.Id,
          title:
            storedTitle ||
            (inspection.Config.Labels?.[WORKER_TITLE_LABEL] ??
              container.Labels?.[WORKER_TITLE_LABEL] ??
              inspection.Name.replace(/^\//, "")),
          preset:
            inspection.Config.Labels?.[WORKER_PRESET_LABEL] ??
            container.Labels?.[WORKER_PRESET_LABEL] ??
            "unknown",
          status: monitorStatus.status,
          port: port ?? 0,
          monitorPort: monitorPort ?? 0,
          sshEnabled,
          sshPort: sshPort ?? 0,
          computerUseEnabled,
          computerUseStatus: computerUseState.status,
          vncPort: vncPort ?? 0,
          createdWithVersion:
            inspection.Config.Labels?.[WORKER_CREATED_WITH_VERSION_LABEL] ??
            container.Labels?.[WORKER_CREATED_WITH_VERSION_LABEL] ??
            "unknown",
          currentAgentSwarmVersion,
          workerImageTag:
            inspection.Config.Labels?.[WORKER_IMAGE_TAG_LABEL] ??
            container.Labels?.[WORKER_IMAGE_TAG_LABEL] ??
            inspection.Config.Image,
          githubAccountId: githubAccount.accountId,
          githubAccountName: githubAccount.account?.name,
          githubConfigured: githubAccount.githubConfigured,
          githubUsername: githubAccount.githubUsername,
          usesDefaultGithubAccount: githubAccount.usesDefaultGithubAccount,
          durationS: getDurationS(inspection, container.Created),
          createdAt: container.Created,
        } satisfies WorkerInfo,
      }
    }),
  )

  // Sort by creation time, newest first
  allWorkers.sort((a, b) => b.info.createdAt - a.info.createdAt)

  const workers: WorkerInfo[] = allWorkers.map((w) => w.info)
  pruneWorkerOutputs(workers.map((worker) => worker.id))

  // Build hierarchy: parentId -> [childId, ...]
  const hierarchy: Record<string, string[]> = {}
  for (const w of allWorkers) {
    if (w.parentId) {
      const children = hierarchy[w.parentId] ?? []
      children.push(w.info.id)
      hierarchy[w.parentId] = children
    }
  }

  return { workers, hierarchy }
}

export function clearWorkersCache() {
  workersCache.fetchedAt = 0
}

export async function listWorkers(): Promise<WorkersResult> {
  if (isCacheFresh()) {
    return workersCache.data
  }

  if (workersCache.promise) {
    return workersCache.promise
  }

  workersCache.promise = loadWorkers()

  try {
    const result = await workersCache.promise
    workersCache.data = result
    workersCache.fetchedAt = Date.now()

    return result
  } finally {
    workersCache.promise = null
  }
}
