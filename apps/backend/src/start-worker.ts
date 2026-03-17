import type Docker from "dockerode"
import {
  docker,
  getPreset,
  readPublishedPort,
  renderDeviceGroupId,
  selfIp,
  WORKER_MONITOR_PORT,
  WORKER_PRESET_LABEL,
  WORKER_TITLE_LABEL,
} from "./worker-container"
import { config } from "./config"

const SHARED_MEMORY_BYTES = 512 * 1024 * 1024
const MEMORY_LIMIT_BYTES = 16 * 1024 * 1024 * 1024
const HEALTH_POLL_INTERVAL_MS = 1_000
const HEALTH_TIMEOUT_MS = 60_000

type StartWorkerParams = {
  title: string
  preset: string
  env: Record<string, string>
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
  labels,
}: StartWorkerParams) {
  const selectedPreset = getPreset(preset)
  const mergedEnv = {
    ...(renderDeviceGroupId !== undefined
      ? {
        DRINODE: config.drinode,
        HW3D: "1",
       }
      : {}),
    ...(selfIp !== undefined
      ? { ORCHESTRATOR_ADDRESS: selfIp }
      : {}),
    ...selectedPreset.presetEnv,
    ...env,
  }

  assertRequiredEnv(selectedPreset.requiredEnv, mergedEnv)

  const pullStream = await docker.pull(selectedPreset.imageTag)
  await new Promise<void>((resolve, reject) => {
    docker.modem.followProgress(pullStream, (err: Error | null) => {
      if (err) return reject(err)
      resolve()
    })
  })

  const container = await docker.createContainer({
    Image: selectedPreset.imageTag,
    Env: toContainerEnv(mergedEnv),
    ExposedPorts: {
      [WORKER_MONITOR_PORT]: {},
    },
    HostConfig: {
      PortBindings: {
        [WORKER_MONITOR_PORT]: [{ HostPort: "" }],
      },
      ...(renderDeviceGroupId !== undefined
        ? { GroupAdd: [String(renderDeviceGroupId)] }
        : {}),
      ShmSize: SHARED_MEMORY_BYTES,
      Memory: MEMORY_LIMIT_BYTES,
      CpuShares: 128,
      BlkioWeight: 100,
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
      console.error("[startWorker] container not healthy, returning port anyway", error)
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
