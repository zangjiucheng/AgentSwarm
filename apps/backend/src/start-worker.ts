import type Docker from "dockerode"
import { posix as pathPosix } from "node:path"
import {
  docker,
  getPreset,
  readPublishedPort,
  selfIp,
  WORKER_WEB_PORT,
  WORKER_PRESET_LABEL,
  WORKER_TITLE_LABEL,
} from "./worker-container"
import { config, port } from "./config"

const SHARED_MEMORY_BYTES = 1024 * 1024 * 1024
const MEMORY_LIMIT_BYTES = 8 * 1024 * 1024 * 1024
const HEALTH_POLL_INTERVAL_MS = 1_000
const HEALTH_TIMEOUT_MS = 60_000
const WORKSPACE_ROOT = "/home/kasm-user/workers"
const REPO_DIRECTORY_SANITIZER = /[^A-Za-z0-9._-]+/g

type StartWorkerParams = {
  title: string
  preset: string
  env: Record<string, string>
  cloneRepositoryUrl?: string
  labels?: Record<string, string>
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function assertRequiredEnv(
  requiredEnv: string[],
  env: Record<string, string>,
) {
  const missingEnv = requiredEnv.filter((name) => !Object.hasOwn(env, name))

  if (missingEnv.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingEnv.join(", ")}`,
    )
  }
}

function toContainerEnv(env: Record<string, string>) {
  return Object.entries(env).map(([key, value]) => `${key}=${value}`)
}

function normalizeCloneRepositoryUrl(cloneRepositoryUrl?: string) {
  const trimmed = cloneRepositoryUrl?.trim()
  return trimmed ? trimmed : undefined
}

function inferRepositoryDirectoryName(cloneRepositoryUrl: string) {
  const withoutFragmentOrQuery = cloneRepositoryUrl
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
  const lastSegment = withoutFragmentOrQuery.split(/[/:]/).pop() ?? ""
  const directoryName = lastSegment
    .replace(/\.git$/i, "")
    .replace(REPO_DIRECTORY_SANITIZER, "-")
    .replace(/^-+|-+$/g, "")

  if (!directoryName) {
    throw new Error("Could not derive a workspace directory from repository URL")
  }

  return directoryName
}

async function ensureImageAvailable(imageTag: string) {
  try {
    await docker.getImage(imageTag).inspect()
    return
  } catch (error) {
    const statusCode =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
        ? error.statusCode
        : undefined

    if (statusCode !== 404) {
      throw error
    }
  }

  const pullStream = await docker.pull(imageTag)
  await new Promise<void>((resolve, reject) => {
    docker.modem.followProgress(pullStream, (err: Error | null) => {
      if (err) return reject(err)
      resolve()
    })
  })
}

async function waitForHealth(container: Docker.Container) {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS

  while (Date.now() < deadline) {
    const inspection = await container.inspect()
    const healthStatus = inspection.State.Health?.Status

    if (healthStatus === "healthy") {
      return
    }

    if (healthStatus === "unhealthy") {
      throw new Error("Worker container became unhealthy")
    }

    if (!inspection.State.Running) {
      throw new Error("Worker container stopped before becoming healthy")
    }

    await sleep(HEALTH_POLL_INTERVAL_MS)
  }

  throw new Error("Timed out waiting for worker container health check")
}

export async function startWorkerContainer({
  title,
  preset,
  env,
  cloneRepositoryUrl,
  labels,
}: StartWorkerParams) {
  const selectedPreset = getPreset(preset)
  const normalizedCloneRepositoryUrl =
    normalizeCloneRepositoryUrl(cloneRepositoryUrl)
  const startupEnv: Record<string, string> = normalizedCloneRepositoryUrl
    ? {
        STARTUP_REPO_URL: normalizedCloneRepositoryUrl,
        WORKSPACE_DIR: pathPosix.join(
          WORKSPACE_ROOT,
          inferRepositoryDirectoryName(normalizedCloneRepositoryUrl),
        ),
      }
    : {}
  const orchestratorEnv: Record<string, string> =
    selfIp !== undefined
      ? { ORCHESTRATOR_ADDRESS: selfIp, ORCHESTRATOR_PORT: String(port) }
      : {}
  const mergedEnv = {
    ...orchestratorEnv,
    ...selectedPreset.presetEnv,
    ...config.globalEnv,
    ...env,
    ...startupEnv,
  }

  assertRequiredEnv(selectedPreset.requiredEnv, mergedEnv)

  await ensureImageAvailable(selectedPreset.imageTag)

  const container = await docker.createContainer({
    Image: selectedPreset.imageTag,
    Env: toContainerEnv(mergedEnv),
    ExposedPorts: {
      [WORKER_WEB_PORT]: {},
    },
    HostConfig: {
      PortBindings: {
        [WORKER_WEB_PORT]: [{ HostPort: "" }],
      },
      ShmSize: SHARED_MEMORY_BYTES,
      Memory: MEMORY_LIMIT_BYTES,
      CpuShares: 128,
      Privileged: true,
    },
    Labels: {
      [WORKER_PRESET_LABEL]: selectedPreset.name,
      [WORKER_TITLE_LABEL]: title,
      ...labels,
    },
  })

  try {
    await container.start()

    const inspection = await container.inspect()
    const port = readPublishedPort(inspection)

    if (port === undefined) {
      throw new Error("Docker did not publish a host port for worker container")
    }

    let healthy = false
    try {
      await waitForHealth(container)
      healthy = true
    } catch (error) {
      console.error("[startWorker] worker is reachable but not healthy yet", error)
    }

    return { id: container.id, port, healthy }
  } catch (error) {
    try {
      await container.remove({ force: true })
    } catch (removeError) {
      console.error("[startWorker] failed to clean up container", removeError)
    }

    throw error
  }
}
