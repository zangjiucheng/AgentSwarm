import { docker, findManagedContainerById, WORKER_WORKSPACE_VOLUME_LABEL } from "./worker-container"
import { clearWorkersCache } from "./list-workers"
import { clearStoredWorkerTitle, clearWorkerGithubAccount } from "./secrets"
import { clearWorkerOutput } from "./worker-output-store"

const WORKSPACE_ROOT = "/home/kasm-user/workers"

export async function destroyWorkerContainer(
  id: string,
  options?: { removeWorkspaceVolume?: boolean },
) {
  const container = await findManagedContainerById(id)

  if (!container) {
    throw new Error(`No managed worker found for id ${id}`)
  }

  const inspection = await container.inspect()
  const workspaceVolumeName =
    inspection.Config.Labels?.[WORKER_WORKSPACE_VOLUME_LABEL] ??
    inspection.Mounts.find(
      (mount) =>
        mount.Type === "volume" &&
        mount.Destination === WORKSPACE_ROOT &&
        Boolean(mount.Name),
    )?.Name

  await container.remove({ force: true })

  if (options?.removeWorkspaceVolume !== false && workspaceVolumeName) {
    try {
      await docker.getVolume(workspaceVolumeName).remove()
    } catch (error) {
      console.error("[destroyWorker] failed to remove workspace volume", error)
    }
  }

  clearWorkerGithubAccount(id)
  clearStoredWorkerTitle(id)
  clearWorkerOutput(id)
  clearWorkersCache()
}
