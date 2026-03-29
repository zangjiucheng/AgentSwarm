import { useEffect, useMemo, useRef } from "react"
import { useNavigate, useParams } from "react-router"
import { WorkerSidebar } from "../components/worker-sidebar"
import { WorkerWorkspace } from "../components/worker-workspace"
import type { WorkerInfo } from "../lib/api-types"
import { trpc } from "../trpc"

const EMPTY_WORKERS: WorkerInfo[] = []
const EMPTY_HIERARCHY: Record<string, string[]> = {}

function showWorkerTransitionNotification(
  worker: WorkerInfo,
  newStatus: string,
  onNavigate: (id: string) => void,
) {
  if (!("Notification" in window) || Notification.permission !== "granted") return

  const n = new Notification("Worker updated", {
    body: `${worker.title} (${worker.preset}) is now ${newStatus}`,
    tag: `worker-${worker.id}`,
  })

  n.onclick = () => {
    window.focus()
    n.close()
    onNavigate(worker.id)
  }
}

export function DashboardPage() {
  const navigate = useNavigate()
  const { id: activeId } = useParams<{ id: string }>()

  const workersQuery = trpc.workers.useQuery(undefined, {
    refetchInterval: 1_000,
    refetchOnWindowFocus: false,
  })
  const presetsQuery = trpc.presets.useQuery(undefined, {
    gcTime: Number.POSITIVE_INFINITY,
    staleTime: Number.POSITIVE_INFINITY,
  })
  const globalSettingsQuery = trpc.globalSettings.useQuery(undefined, {
    gcTime: Number.POSITIVE_INFINITY,
    staleTime: Number.POSITIVE_INFINITY,
  })
  const destroyWorker = trpc.destroyWorker.useMutation()
  const renameWorker = trpc.renameWorker.useMutation()
  const replaceWorker = trpc.replaceWorker.useMutation()
  const setWorkerSsh = trpc.setWorkerSsh.useMutation()
  const startExistingWorker = trpc.startExistingWorker.useMutation()
  const stopWorker = trpc.stopWorker.useMutation()
  const prevStatusById = useRef<Map<string, string>>(new Map())
  const hasRequestedNotificationPermission = useRef(false)

  const workers = workersQuery.data?.workers ?? EMPTY_WORKERS
  const hierarchy = workersQuery.data?.hierarchy ?? EMPTY_HIERARCHY
  const presets = presetsQuery.data ?? []
  const globalSettings = globalSettingsQuery.data ?? {
    autoPauseMinutes: null,
    defaultGithubAccountId: null,
    githubAccounts: [],
    githubUsername: "",
    githubTokenConfigured: false,
    sshPublicKeys: [],
  }

  useEffect(() => {
    const prev = prevStatusById.current

    for (const worker of workers) {
      const prevStatus = prev.get(worker.id)
      prev.set(worker.id, worker.status)

      if (
        prevStatus === "error" &&
        worker.status === "ready"
      ) {
        showWorkerTransitionNotification(worker, worker.status, (id) => {
          void navigate(`/${id}`)
        })
      }
    }

    for (const id of prev.keys()) {
      if (!workers.some((w) => w.id === id)) {
        prev.delete(id)
      }
    }
  }, [workers, navigate])

  const availableIds = useMemo(
    () => new Set(workers.map((w) => w.id)),
    [workers],
  )

  const getWorkerState = (id: string): "active" | "cached" | "unloaded" => {
    if (id === activeId) return "active"
    return "unloaded"
  }

  const handleDestroyWorker = async (id: string) => {
    await destroyWorker.mutateAsync({ id })
    await workersQuery.refetch()

    void navigate("/")
  }

  const handleStartWorker = async (id: string) => {
    await startExistingWorker.mutateAsync({ id })
    await workersQuery.refetch()
  }

  const handleRenameWorker = async (id: string, title: string) => {
    await renameWorker.mutateAsync({ id, title })
    await workersQuery.refetch()
  }

  const handleReplaceWorker = async (id: string) => {
    try {
      const replacement = await replaceWorker.mutateAsync({ id })
      await workersQuery.refetch()
      void navigate(`/${replacement.id}`)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to migrate worker"
      window.alert(message)
    }
  }

  const handleSetWorkerSsh = async (id: string, enabled: boolean) => {
    try {
      const replacement = await setWorkerSsh.mutateAsync({ enabled, id })
      await workersQuery.refetch()
      void navigate(`/${replacement.id}`)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update worker SSH"
      window.alert(message)
    }
  }

  const handleStopWorker = async (id: string) => {
    await stopWorker.mutateAsync({ id })
    await workersQuery.refetch()
  }

  const handleUserInteraction = () => {
    if (
      hasRequestedNotificationPermission.current ||
      !("Notification" in window) ||
      Notification.permission !== "default"
    ) {
      return
    }

    hasRequestedNotificationPermission.current = true
    void Notification.requestPermission()
  }

  return (
    <>
      <div
        className="bg-background text-foreground flex min-h-screen"
        onPointerDownCapture={handleUserInteraction}
      >
        <WorkerSidebar
          globalSettings={globalSettings}
          isDestroyingWorker={(id) =>
            destroyWorker.isPending && destroyWorker.variables?.id === id
          }
          isReplacingWorker={(id) =>
            replaceWorker.isPending && replaceWorker.variables?.id === id
          }
          isStartingWorker={(id) =>
            startExistingWorker.isPending &&
            startExistingWorker.variables?.id === id
          }
          isStoppingWorker={(id) =>
            stopWorker.isPending && stopWorker.variables?.id === id
          }
          onDestroyWorker={handleDestroyWorker}
          onReplaceWorker={handleReplaceWorker}
          onStartWorker={handleStartWorker}
          onStopWorker={handleStopWorker}
          presets={presets}
          workers={workers}
          hierarchy={hierarchy}
        />

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="relative min-h-0 flex-1 overflow-hidden">
            {activeId && availableIds.has(activeId) ? (
              workers.map((worker) => (
                <WorkerWorkspace
                  globalSettings={globalSettings}
                  isReplacing={
                    replaceWorker.isPending && replaceWorker.variables?.id === worker.id
                  }
                  isRenaming={
                    renameWorker.isPending && renameWorker.variables?.id === worker.id
                  }
                  isUpdatingSsh={
                    setWorkerSsh.isPending && setWorkerSsh.variables?.id === worker.id
                  }
                  isStarting={
                    startExistingWorker.isPending &&
                    startExistingWorker.variables?.id === worker.id
                  }
                  isStopping={
                    stopWorker.isPending && stopWorker.variables?.id === worker.id
                  }
                  key={worker.id}
                  onDestroyWorker={handleDestroyWorker}
                  onRenameWorker={handleRenameWorker}
                  onReplaceWorker={handleReplaceWorker}
                  onSetWorkerSsh={handleSetWorkerSsh}
                  onStartWorker={handleStartWorker}
                  onStopWorker={handleStopWorker}
                  state={getWorkerState(worker.id)}
                  worker={worker}
                />
              ))
            ) : (
              <div className="flex h-full items-center justify-center bg-[#282828] px-6">
                <div className="max-w-lg text-center">
                  <p className="text-default-500 text-xs tracking-[0.26em] uppercase">
                    Nothing selected
                  </p>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </>
  )
}
