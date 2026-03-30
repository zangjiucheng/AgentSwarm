import type Docker from "dockerode"
import { randomBytes, randomUUID } from "node:crypto"
import { posix as pathPosix } from "node:path"
import {
  docker,
  getPreset,
  readPublishedPort,
  WORKER_MONITOR_PORT,
  WORKER_SSH_PORT,
  WORKER_VNC_PORT,
  WORKER_WORKSPACE_VOLUME_LABEL,
  selfIp,
  currentAgentSwarmVersion,
  WORKER_WEB_PORT,
  WORKER_CREATED_WITH_VERSION_LABEL,
  WORKER_IMAGE_TAG_LABEL,
  WORKER_PRESET_LABEL,
  WORKER_TITLE_LABEL,
} from "./worker-container"
import { port } from "./config"
import { getWorkerSecretEnv } from "./secrets"
import { applyGithubAccountToWorker } from "./worker-github"

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
  enableSsh?: boolean
  enableComputerUse?: boolean
  computerUseExtraSetupScript?: string
  githubAccountId?: string
  cloneRepositoryUrl?: string
  labels?: Record<string, string>
  workspaceVolumeName?: string
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

function createWorkspaceVolumeName() {
  return `agentswarm-worker-${randomUUID()}`
}

function createWorkerSshPassword() {
  return randomBytes(18).toString("base64url")
}

function createWorkerVncPassword() {
  return randomBytes(12).toString("base64url")
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
  enableSsh,
  enableComputerUse,
  computerUseExtraSetupScript,
  githubAccountId,
  cloneRepositoryUrl,
  labels,
  workspaceVolumeName,
}: StartWorkerParams) {
  const selectedPreset = getPreset(preset)
  const normalizedCloneRepositoryUrl =
    normalizeCloneRepositoryUrl(cloneRepositoryUrl)
  const resolvedWorkspaceVolumeName =
    workspaceVolumeName ?? createWorkspaceVolumeName()
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
  const secretEnv = getWorkerSecretEnv({ accountId: githubAccountId })
  const sshEnabled = enableSsh ?? env.WORKER_SSH_ENABLED === "1"
  const computerUseEnabled =
    enableComputerUse ?? env.WORKER_COMPUTER_USE_ENABLED === "1"
  const resolvedComputerUseExtraSetupScript =
    computerUseExtraSetupScript?.trim() ||
    env.WORKER_COMPUTER_USE_EXTRA_SETUP_SCRIPT?.trim() ||
    ""
  const sshAuthorizedKeys =
    env.WORKER_SSH_AUTHORIZED_KEYS?.trim() ||
    secretEnv.WORKER_SSH_AUTHORIZED_KEYS?.trim() ||
    ""
  const sshEnv = sshEnabled
    ? {
        SSH_PORT: "2222",
        ...(sshAuthorizedKeys
          ? {
              WORKER_SSH_AUTHORIZED_KEYS: sshAuthorizedKeys,
            }
          : {
              WORKER_SSH_PASSWORD:
                env.WORKER_SSH_PASSWORD?.trim() || createWorkerSshPassword(),
            }),
        WORKER_SSH_ENABLED: "1",
      }
    : {
        WORKER_SSH_ENABLED: "0",
      }
  const computerUseEnv = computerUseEnabled
    ? {
        DISPLAY: ":1",
        WORKER_COMPUTER_USE_ENABLED: "1",
        WORKER_CHROMIUM_DEBUG_PORT: "9222",
        ...(resolvedComputerUseExtraSetupScript
          ? {
              WORKER_COMPUTER_USE_EXTRA_SETUP_SCRIPT:
                resolvedComputerUseExtraSetupScript,
            }
          : {}),
        WORKER_VNC_PASSWORD:
          env.WORKER_VNC_PASSWORD?.trim() || createWorkerVncPassword(),
        WORKER_VNC_PORT: "6901",
      }
    : {
        WORKER_COMPUTER_USE_ENABLED: "0",
      }
  const mergedEnv = {
    ...orchestratorEnv,
    ...selectedPreset.presetEnv,
    ...secretEnv,
    ...env,
    ...sshEnv,
    ...computerUseEnv,
    ...startupEnv,
  }

  assertRequiredEnv(selectedPreset.requiredEnv, mergedEnv)

  await ensureImageAvailable(selectedPreset.imageTag)
  await docker.createVolume({
    Labels: {
      [WORKER_WORKSPACE_VOLUME_LABEL]: "true",
    },
    Name: resolvedWorkspaceVolumeName,
  })

  const container = await docker.createContainer({
    Image: selectedPreset.imageTag,
    Env: toContainerEnv(mergedEnv),
    ExposedPorts: {
      [WORKER_WEB_PORT]: {},
      [WORKER_MONITOR_PORT]: {},
      ...(sshEnabled ? { [WORKER_SSH_PORT]: {} } : {}),
      ...(computerUseEnabled ? { [WORKER_VNC_PORT]: {} } : {}),
    },
    HostConfig: {
      PortBindings: {
        [WORKER_WEB_PORT]: [{ HostPort: "" }],
        [WORKER_MONITOR_PORT]: [{ HostPort: "" }],
        ...(sshEnabled ? { [WORKER_SSH_PORT]: [{ HostPort: "" }] } : {}),
        ...(computerUseEnabled ? { [WORKER_VNC_PORT]: [{ HostPort: "" }] } : {}),
      },
      Binds: [`${resolvedWorkspaceVolumeName}:${WORKSPACE_ROOT}`],
      ShmSize: SHARED_MEMORY_BYTES,
      Memory: MEMORY_LIMIT_BYTES,
      CpuShares: 128,
      Privileged: true,
    },
    Labels: {
      [WORKER_CREATED_WITH_VERSION_LABEL]: currentAgentSwarmVersion,
      [WORKER_IMAGE_TAG_LABEL]: selectedPreset.imageTag,
      [WORKER_PRESET_LABEL]: selectedPreset.name,
      [WORKER_TITLE_LABEL]: title,
      [WORKER_WORKSPACE_VOLUME_LABEL]: resolvedWorkspaceVolumeName,
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

    try {
      await applyGithubAccountToWorker(container.id, { accountId: githubAccountId })
    } catch (error) {
      console.error("[startWorker] failed to apply GitHub account to worker", error)
    }

    return { id: container.id, port, healthy }
  } catch (error) {
    try {
      await container.remove({ force: true })
    } catch (removeError) {
      console.error("[startWorker] failed to clean up container", removeError)
    }

    if (!workspaceVolumeName) {
      try {
        await docker.getVolume(resolvedWorkspaceVolumeName).remove()
      } catch (volumeError) {
        console.error("[startWorker] failed to clean up workspace volume", volumeError)
      }
    }

    throw error
  }
}
