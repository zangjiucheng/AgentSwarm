import type Docker from "dockerode"
import { clearWorkersCache } from "./list-workers"
import { startWorkerContainer } from "./start-worker"
import {
  findManagedContainerById,
  getContainerEnv,
  readPublishedPort,
  WORKER_PARENT_LABEL,
  WORKER_PRESET_LABEL,
  WORKER_TITLE_LABEL,
  WORKER_WORKSPACE_VOLUME_LABEL,
} from "./worker-container"
import { destroyWorkerContainer } from "./destroy-worker"
import { applyGithubAccountToWorker } from "./worker-github"
import {
  getStoredGithubAccountIdForWorker,
  getStoredWorkerTitle,
  setStoredWorkerTitle,
  transferWorkerTitle,
  transferWorkerGithubAccount,
} from "./secrets"

const HEALTH_POLL_INTERVAL_MS = 1_000
const HEALTH_TIMEOUT_MS = 60_000

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function toDockerContainerName(title: string, id: string) {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)

  const safeBase = base || "worker"
  return `agentswarm-${safeBase}-${id.slice(0, 8)}`
}

function sanitizeReplacementEnv(env: Record<string, string>) {
  const nextEnv = { ...env }

  for (const key of [
    "CODEX_VERSION",
    "CODEX_WORKER",
    "HOME",
    "HOSTNAME",
    "MONITOR_PORT",
    "NIX_REMOTE",
    "NPM_CONFIG_PREFIX",
    "ORCHESTRATOR_ADDRESS",
    "ORCHESTRATOR_PORT",
    "PATH",
    "PWD",
    "SHELL",
    "DISPLAY",
    "SSH_PORT",
    "SHLVL",
    "USER",
    "WORKER_SSH_AUTHORIZED_KEY",
    "WORKER_SSH_AUTHORIZED_KEYS",
    "WORKER_SSH_ENABLED",
    "WORKER_SSH_PASSWORD",
    "WORKER_SSH_PRIVATE_KEY",
    "WORKER_COMPUTER_USE_ENABLED",
    "WORKER_COMPUTER_USE_EXTRA_SETUP_SCRIPT",
    "WORKER_COMPUTER_USE_EXTRA_FLAKE_REF",
    "WORKER_VNC_PASSWORD",
    "WORKER_VNC_PORT",
    "WORKER_VNC_RESOLUTION",
    "WORKER_PROFILE",
  ]) {
    delete nextEnv[key]
  }

  return nextEnv
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

export async function startManagedWorkerContainer(id: string) {
  const container = await findManagedContainerById(id)

  if (!container) {
    throw new Error(`No managed worker found for id ${id}`)
  }

  const initialInspection = await container.inspect()
  if (!initialInspection.State.Running) {
    await container.start()
  }

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
    console.error("[startManagedWorker] worker is reachable but not healthy yet", error)
  }

  try {
    await applyGithubAccountToWorker(id)
  } catch (error) {
    console.error("[startManagedWorker] failed to apply GitHub account", error)
  }

  clearWorkersCache()
  return { id, port, healthy }
}

export async function stopManagedWorkerContainer(id: string) {
  const container = await findManagedContainerById(id)

  if (!container) {
    throw new Error(`No managed worker found for id ${id}`)
  }

  const inspection = await container.inspect()
  if (inspection.State.Running) {
    await container.stop()
  }

  clearWorkersCache()
}

export async function replaceManagedWorkerContainer(
  id: string,
  options?: { enableSsh?: boolean; enableComputerUse?: boolean },
) {
  const container = await findManagedContainerById(id)

  if (!container) {
    throw new Error(`No managed worker found for id ${id}`)
  }

  const inspection = await container.inspect()
  const workspaceVolumeName =
    inspection.Config.Labels?.[WORKER_WORKSPACE_VOLUME_LABEL]

  if (!workspaceVolumeName) {
    throw new Error(
      "This worker was created before workspace volumes were enabled and cannot be migrated automatically",
    )
  }

  const originalEnv = await getContainerEnv(id)
  const env = sanitizeReplacementEnv(originalEnv)
  const title =
    getStoredWorkerTitle(id) ||
    (inspection.Config.Labels?.[WORKER_TITLE_LABEL] ??
      inspection.Name.replace(/^\//, ""))
  const preset =
    inspection.Config.Labels?.[WORKER_PRESET_LABEL] ?? "default"
  const parentId = inspection.Config.Labels?.[WORKER_PARENT_LABEL]
  const githubAccountId = getStoredGithubAccountIdForWorker(id)
  const wasRunning = inspection.State.Running
  const currentSshEnabled = originalEnv.WORKER_SSH_ENABLED === "1"
  const currentComputerUseEnabled = originalEnv.WORKER_COMPUTER_USE_ENABLED === "1"
  const currentComputerUseExtraSetupScript =
    originalEnv.WORKER_COMPUTER_USE_EXTRA_SETUP_SCRIPT ??
    originalEnv.WORKER_COMPUTER_USE_EXTRA_FLAKE_REF

  let replacement:
    | Awaited<ReturnType<typeof startWorkerContainer>>
    | undefined

  if (wasRunning) {
    await container.stop()
  }

  try {
    replacement = await startWorkerContainer({
      enableComputerUse:
        options?.enableComputerUse ?? currentComputerUseEnabled,
      computerUseExtraSetupScript: currentComputerUseExtraSetupScript,
      enableSsh: options?.enableSsh ?? currentSshEnabled,
      env,
      githubAccountId,
      labels: parentId ? { [WORKER_PARENT_LABEL]: parentId } : undefined,
      preset,
      title,
      workspaceVolumeName,
    })

    if (!replacement.healthy) {
      throw new Error(
        "Replacement worker failed its health check; the original worker was kept",
      )
    }

    if (!wasRunning) {
      await stopManagedWorkerContainer(replacement.id)
    }

    transferWorkerGithubAccount(id, replacement.id)
    transferWorkerTitle(id, replacement.id)
    await destroyWorkerContainer(id, { removeWorkspaceVolume: false })

    clearWorkersCache()
    return replacement
  } catch (error) {
    if (replacement) {
      try {
        await destroyWorkerContainer(replacement.id, {
          removeWorkspaceVolume: false,
        })
      } catch (cleanupError) {
        console.error(
          "[replaceManagedWorker] failed to clean up replacement worker",
          cleanupError,
        )
      }
    }

    if (wasRunning) {
      try {
        await container.start()
      } catch (restartError) {
        console.error(
          "[replaceManagedWorker] failed to restart original worker",
          restartError,
        )
      }
    }

    throw error
  }
}

export async function renameManagedWorkerContainer(id: string, title: string) {
  const nextTitle = title.trim()

  if (!nextTitle) {
    throw new Error("Worker title cannot be empty")
  }

  const container = await findManagedContainerById(id)

  if (!container) {
    throw new Error(`No managed worker found for id ${id}`)
  }

  await container.rename({ name: toDockerContainerName(nextTitle, id) })
  setStoredWorkerTitle(id, nextTitle)
  clearWorkersCache()

  return undefined
}
