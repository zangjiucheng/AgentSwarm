import { Button, Divider, ScrollShadow, Spinner, Tooltip } from "@heroui/react"
import type { WorkerInfo } from "../lib/api-types"
import { formatDuration, statusTone } from "../lib/format"

type WorkerSidebarProps = {
  destroyPendingPort?: number
  isLoading: boolean
  onCreateWorker: () => void
  onDestroyWorker: (worker: WorkerInfo) => void
  onRefresh: () => void
  onSelectWorker: (port: number) => void
  selectedPort?: number
  workers: WorkerInfo[]
}

export function WorkerSidebar({
  destroyPendingPort,
  isLoading,
  onCreateWorker,
  onDestroyWorker,
  onRefresh,
  onSelectWorker,
  selectedPort,
  workers,
}: WorkerSidebarProps) {
  const selectedWorker = workers.find((worker) => worker.port === selectedPort)

  return (
    <aside className="flex h-screen w-[20rem] shrink-0 flex-col">
      <div className="px-5 pt-5">
        <p className="text-xs uppercase tracking-[0.26em] text-default-500">
          ClaudeSwarm
        </p>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Workers</h1>
            <p className="mt-1 text-sm text-default-400">
              Backend lifecycle plus live worker sessions.
            </p>
          </div>
          <Button
            color="secondary"
            isIconOnly
            onPress={onRefresh}
            radius="full"
            size="sm"
            variant="light"
          >
            ↻
          </Button>
        </div>
      </div>

      <div className="px-5 pt-5">
        <div className="flex items-center justify-between text-xs uppercase tracking-[0.22em] text-default-500">
          <span>Active workers</span>
          <span>{workers.length}</span>
        </div>
      </div>

      <ScrollShadow className="min-h-0 flex-1 px-3 pb-3 pt-2">
        {isLoading && workers.length === 0 ? (
          <div className="flex h-full items-center justify-center py-12">
            <Spinner color="secondary" size="sm" />
          </div>
        ) : null}

        {!isLoading && workers.length === 0 ? (
          <div className="px-3 py-12 text-center">
            <p className="text-sm uppercase tracking-[0.22em] text-default-500">
              No workers
            </p>
            <p className="mt-3 text-sm text-default-400">
              Start a new worker to open its preview and terminals.
            </p>
          </div>
        ) : null}

        {workers.length > 0 ? (
          <div className="divide-y divide-divider">
            {workers.map((worker) => {
              const isSelected = worker.port === selectedPort

              return (
                <button
                  className={`w-full px-3 py-4 text-left transition ${
                    isSelected
                      ? "bg-primary/8 text-foreground"
                      : "text-default-500 hover:bg-white/3 hover:text-default-200"
                  }`}
                  key={`${worker.port}-${worker.title}`}
                  onClick={() => onSelectWorker(worker.port)}
                  type="button"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${statusTone(worker.status)}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {worker.title}
                          </p>
                          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-default-500">
                            {worker.preset}
                          </p>
                        </div>
                        <p className="shrink-0 text-[11px] uppercase tracking-[0.18em] text-default-500">
                          {formatDuration(worker.durationS)}
                        </p>
                      </div>

                      {worker.pr ? (
                        <div className="mt-3 space-y-1 text-xs text-default-400">
                          <a
                            className="line-clamp-1 text-primary hover:text-primary-400"
                            href={worker.pr.link}
                            onClick={(event) => event.stopPropagation()}
                            rel="noreferrer"
                            target="_blank"
                          >
                            #{worker.pr.number} {worker.pr.name}
                          </a>
                          <p className="line-clamp-1">
                            {worker.pr.branch} → {worker.pr.baseBranch}
                          </p>
                        </div>
                      ) : (
                        <p className="mt-3 text-xs text-default-500">
                          No PR metadata available.
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        ) : null}
      </ScrollShadow>

      <Divider />
      <div className="flex items-center gap-3 px-5 py-4">
        <Button
          className="flex-1 justify-center text-lg"
          color="secondary"
          onPress={onCreateWorker}
          radius="full"
          variant="flat"
        >
          +
        </Button>
        <Tooltip content="Destroy selected worker">
          <Button
            color="danger"
            isDisabled={!selectedWorker}
            isIconOnly
            isLoading={selectedWorker?.port === destroyPendingPort}
            onPress={() => selectedWorker && onDestroyWorker(selectedWorker)}
            radius="full"
            variant="light"
          >
            ⌫
          </Button>
        </Tooltip>
      </div>
    </aside>
  )
}
