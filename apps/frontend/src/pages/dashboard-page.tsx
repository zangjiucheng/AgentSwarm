import { Button, Divider, Tooltip } from "@heroui/react"
import { useEffect, useState } from "react"
import { AddWorkerModal } from "../components/add-worker-modal"
import { WorkerSidebar } from "../components/worker-sidebar"
import { WorkerWorkspace } from "../components/worker-workspace"
import type { PresetInfo, WorkerInfo } from "../lib/api-types"
import {
  clearSelectedWorkerPort,
  readSelectedWorkerPort,
  readTerminalHeight,
  writeSelectedWorkerPort,
  writeTerminalHeight,
} from "../lib/storage"
import { statusTone } from "../lib/format"
import { trpc } from "../trpc"

const DEFAULT_TERMINAL_HEIGHT = 320
const MAX_CACHED_WORKSPACES = 3
const EMPTY_WORKERS: WorkerInfo[] = []
const EMPTY_PRESETS: PresetInfo[] = []

export function DashboardPage() {
  const utils = trpc.useUtils()
  const workersQuery = trpc.workers.useQuery(undefined, {
    refetchInterval: 1_000,
    refetchOnWindowFocus: false,
  })
  const presetsQuery = trpc.presets.useQuery(undefined, {
    gcTime: Number.POSITIVE_INFINITY,
    staleTime: Number.POSITIVE_INFINITY,
  })
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [preferredPort, setPreferredPort] = useState<number | undefined>(() =>
    readSelectedWorkerPort(),
  )
  const [visitedPorts, setVisitedPorts] = useState<number[]>([])
  const [terminalHeight, setTerminalHeightState] = useState(() =>
    readTerminalHeight(DEFAULT_TERMINAL_HEIGHT),
  )

  const workers = workersQuery.data ?? EMPTY_WORKERS
  const presets = presetsQuery.data ?? EMPTY_PRESETS
  const selectedWorker =
    workers.find((worker) => worker.port === preferredPort) ?? workers[0]
  const selectedPort = selectedWorker?.port

  const rememberPort = (port: number) => {
    setPreferredPort(port)
    setVisitedPorts((currentPorts) =>
      [port, ...currentPorts.filter((currentPort) => currentPort !== port)].slice(
        0,
        MAX_CACHED_WORKSPACES,
      ),
    )
  }

  const startWorker = trpc.startWorker.useMutation({
    onSuccess: async ({ port }) => {
      setIsAddModalOpen(false)
      await utils.workers.invalidate()
      rememberPort(port)
    },
  })

  const destroyWorker = trpc.destroyWorker.useMutation({
    onSuccess: async () => {
      await utils.workers.invalidate()
    },
  })

  useEffect(() => {
    if (selectedPort === undefined) {
      clearSelectedWorkerPort()
      return
    }

    writeSelectedWorkerPort(selectedPort)
  }, [selectedPort])

  const cachedWorkers = (() => {
    const availablePorts = new Set(workers.map((worker) => worker.port))
    const candidatePorts =
      selectedPort === undefined ? visitedPorts : [selectedPort, ...visitedPorts]
    const uniquePorts = [...new Set(candidatePorts)].filter((port) =>
      availablePorts.has(port),
    )

    return uniquePorts
      .slice(0, MAX_CACHED_WORKSPACES)
      .map((port) => workers.find((worker) => worker.port === port))
      .filter((worker): worker is WorkerInfo => worker !== undefined)
  })()

  const addWorkerError =
    startWorker.error?.message ??
    (presetsQuery.isError ? presetsQuery.error.message : undefined)

  const handleDestroyWorker = (worker: WorkerInfo) => {
    const confirmed = window.confirm(`Destroy "${worker.title}" on port ${worker.port}?`)

    if (!confirmed) {
      return
    }

    setVisitedPorts((currentPorts) =>
      currentPorts.filter((port) => port !== worker.port),
    )
    destroyWorker.mutate({ port: worker.port })
  }

  const handleTerminalHeightChange = (height: number) => {
    setTerminalHeightState(height)
    writeTerminalHeight(height)
  }

  return (
    <>
      <div className="app-grid flex min-h-screen bg-background text-foreground">
        <WorkerSidebar
          destroyPendingPort={destroyWorker.variables?.port}
          isLoading={workersQuery.isLoading}
          onCreateWorker={() => {
            startWorker.reset()
            setIsAddModalOpen(true)
          }}
          onDestroyWorker={handleDestroyWorker}
          onRefresh={() => void workersQuery.refetch()}
          onSelectWorker={rememberPort}
          selectedPort={selectedPort}
          workers={workers}
        />
        <Divider orientation="vertical" />

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="px-6 py-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.26em] text-default-500">
                  Worker dashboard
                </p>
                <div className="mt-2 flex items-center gap-3">
                  {selectedWorker ? (
                    <>
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${statusTone(selectedWorker.status)}`}
                      />
                      <h2 className="text-2xl font-semibold">
                        {selectedWorker.title}
                      </h2>
                    </>
                  ) : (
                    <h2 className="text-2xl font-semibold">Select a worker</h2>
                  )}
                </div>
                <p className="mt-2 text-sm text-default-400">
                  The last three visited workers stay mounted so the iframe and
                  terminals reconnect less often.
                </p>
              </div>

              {selectedWorker ? (
                <div className="flex items-center gap-3 text-right">
                  <Tooltip content="Published worker port">
                    <div className="text-sm text-default-400">
                      <p className="uppercase tracking-[0.2em] text-default-500">
                        Port
                      </p>
                      <p className="mt-1 font-mono text-foreground">
                        {selectedWorker.port}
                      </p>
                    </div>
                  </Tooltip>
                  <Button
                    color="danger"
                    isLoading={destroyWorker.isPending}
                    onPress={() => handleDestroyWorker(selectedWorker)}
                    variant="light"
                  >
                    Destroy
                  </Button>
                </div>
              ) : null}
            </div>

            {workersQuery.isError ? (
              <p className="mt-4 text-sm text-danger">
                Failed to load workers: {workersQuery.error.message}
              </p>
            ) : null}
          </header>

          <Divider />

          <div className="relative min-h-0 flex-1 overflow-hidden">
            {selectedWorker ? (
              cachedWorkers.map((worker) => (
                <WorkerWorkspace
                  isActive={worker.port === selectedWorker.port}
                  key={worker.port}
                  onTerminalHeightChange={handleTerminalHeightChange}
                  terminalHeight={terminalHeight}
                  worker={worker}
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
