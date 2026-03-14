import { Button, Divider } from "@heroui/react"
import { useEffect, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router"
import { AddWorkerModal } from "../components/add-worker-modal"
import { WorkerSidebar } from "../components/worker-sidebar"
import { WorkerWorkspace } from "../components/worker-workspace"
import type { PresetInfo, WorkerInfo } from "../lib/api-types"
import { trpc } from "../trpc"

const MAX_CACHED_WORKSPACES = 3
const EMPTY_WORKERS: WorkerInfo[] = []
const EMPTY_PRESETS: PresetInfo[] = []

export function DashboardPage() {
  const utils = trpc.useUtils()
  const navigate = useNavigate()
  const { port: portParam } = useParams<{ port: string }>()
  const activePort = portParam ? Number(portParam) : undefined

  const workersQuery = trpc.workers.useQuery(undefined, {
    refetchInterval: 1_000,
    refetchOnWindowFocus: false,
  })
  const presetsQuery = trpc.presets.useQuery(undefined, {
    gcTime: Number.POSITIVE_INFINITY,
    staleTime: Number.POSITIVE_INFINITY,
  })
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const recentPortsRef = useRef<number[]>([])

  const workers = workersQuery.data ?? EMPTY_WORKERS
  const presets = presetsQuery.data ?? EMPTY_PRESETS

  // Track visited ports for caching
  useEffect(() => {
    if (activePort === undefined) return
    recentPortsRef.current = [
      activePort,
      ...recentPortsRef.current.filter((p) => p !== activePort),
    ].slice(0, MAX_CACHED_WORKSPACES)
  }, [activePort])

  const availablePorts = new Set(workers.map((w) => w.port))

  const cachedPorts = recentPortsRef.current.filter((p) => availablePorts.has(p))

  const getWorkerState = (port: number): "active" | "cached" | "unloaded" => {
    if (port === activePort) return "active"
    if (cachedPorts.includes(port)) return "cached"
    return "unloaded"
  }

  const startWorker = trpc.startWorker.useMutation({
    onSuccess: async ({ port }) => {
      setIsAddModalOpen(false)
      await utils.workers.invalidate()
      navigate(`/${port}`)
    },
  })

  const destroyWorker = trpc.destroyWorker.useMutation({
    onSuccess: async () => {
      await utils.workers.invalidate()
    },
  })

  const handleDestroyWorker = (worker: WorkerInfo) => {
    const confirmed = window.confirm(`Destroy "${worker.title}" on port ${worker.port}?`)

    if (!confirmed) {
      return
    }

    recentPortsRef.current = recentPortsRef.current.filter((p) => p !== worker.port)
    destroyWorker.mutate({ port: worker.port })

    if (activePort === worker.port) {
      navigate("/")
    }
  }

  const addWorkerError =
    startWorker.error?.message ??
    (presetsQuery.isError ? presetsQuery.error.message : undefined)

  return (
    <>
      <div className="flex min-h-screen bg-background text-foreground">
        <WorkerSidebar
          isLoading={workersQuery.isLoading}
          onCreateWorker={() => {
            startWorker.reset()
            setIsAddModalOpen(true)
          }}
          workers={workers}
        />
        <Divider orientation="vertical" />

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="relative min-h-0 flex-1 overflow-hidden">
            {activePort && availablePorts.has(activePort) ? (
              workers.map((worker) => (
                <WorkerWorkspace
                  key={worker.port}
                  onDestroyWorker={() => handleDestroyWorker(worker)}
                  state={getWorkerState(worker.port)}
                  workerPort={worker.port}
                />
              ))
            ) : (
              <div className="flex h-full items-center justify-center px-6">
                <div className="max-w-lg text-center">
                  <p className="text-xs uppercase tracking-[0.26em] text-default-500">
                    Nothing selected
                  </p>
                  <h2 className="mt-3 text-3xl font-semibold text-foreground">
                    Pick a worker or start a new one
                  </h2>
                  <p className="mt-3 text-default-400">
                    The left rail comes from backend tRPC. Once a worker is
                    selected, the right pane opens its published iframe and
                    terminal websocket endpoints directly from the worker port.
                  </p>
                  <Button
                    className="mt-6"
                    color="secondary"
                    onPress={() => {
                      startWorker.reset()
                      setIsAddModalOpen(true)
                    }}
                    variant="flat"
                  >
                    Start a worker
                  </Button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      <AddWorkerModal
        errorMessage={addWorkerError}
        isOpen={isAddModalOpen}
        isPending={startWorker.isPending}
        onOpenChange={setIsAddModalOpen}
        onSubmit={(input) => startWorker.mutate(input)}
        presets={presets}
      />
    </>
  )
}
