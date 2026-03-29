import type Docker from "dockerode"
import {
  getEffectiveGithubAccountForWorker,
  getGithubAccountCredentials,
} from "./secrets"
import { findManagedContainerById, listManagedContainerIds } from "./worker-container"

const WORKER_HOME = "/home/kasm-user"
const WORKER_SHELL = "/bin/bash"

async function execInContainer(
  container: Docker.Container,
  cmd: string[],
  env: Record<string, string>,
) {
  const exec = await container.exec({
    AttachStderr: true,
    AttachStdout: true,
    Cmd: cmd,
    Env: Object.entries(env).map(([key, value]) => `${key}=${value}`),
    Tty: true,
    User: "1000:1000",
    WorkingDir: WORKER_HOME,
  })

  const stream = await exec.start({
    hijack: false,
    stdin: false,
  })

  let output = ""

  await new Promise<void>((resolve, reject) => {
    stream.on("data", (chunk: Buffer | string) => {
      output += chunk.toString()
    })
    stream.on("end", () => resolve())
    stream.on("error", reject)
  })

  const inspection = await exec.inspect()

  return {
    exitCode: inspection.ExitCode ?? 0,
    output,
  }
}

export async function applyGithubAccountToWorker(
  workerId: string,
  options?: { accountId?: string },
) {
  const container = await findManagedContainerById(workerId)

  if (!container) {
    throw new Error(`No managed worker found for id ${workerId}`)
  }

  const inspection = await container.inspect()
  if (!inspection.State.Running) {
    return
  }

  const account =
    getGithubAccountCredentials(options?.accountId) ??
    getEffectiveGithubAccountForWorker(workerId).account
  const env = {
    HOME: WORKER_HOME,
    SHELL: WORKER_SHELL,
    USER: "kasm-user",
    XDG_CONFIG_HOME: `${WORKER_HOME}/.config`,
  }

  const result = await execInContainer(
    container,
    account
      ? [
          "/usr/local/bin/configure-github",
          "--username",
          account.username,
          "--token",
          account.token,
          "--no-shellrc",
        ]
      : ["/usr/local/bin/configure-github", "--clear", "--no-shellrc"],
    env,
  )

  if (result.exitCode !== 0) {
    const suffix = result.output.trim() ? `: ${result.output.trim()}` : ""
    throw new Error(`Failed to apply GitHub account to worker${suffix}`)
  }
}

export async function applyGithubAccountsToRunningWorkers() {
  const workerIds = await listManagedContainerIds({ runningOnly: true })

  await Promise.allSettled(
    workerIds.map(async (workerId) => {
      await applyGithubAccountToWorker(workerId)
    }),
  )
}
