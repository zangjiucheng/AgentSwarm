import { Button } from "@heroui/react"
import {
  IconRefresh,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlus,
  IconSettings,
  IconTrash,
} from "@tabler/icons-react"
import { useState } from "react"
import { Link, useParams } from "react-router"
import type { GlobalSettings, PresetInfo, WorkerInfo } from "../lib/api-types"
import { formatDuration, formatVersionLabel, statusTone } from "../lib/format"
import { AddWorkerModal } from "./add-worker-modal"
import { BrandLogo } from "./brand-logo"
import { GlobalSettingsModal } from "./global-settings-modal"

type WorkerSidebarProps = {
  globalSettings: GlobalSettings
  isDestroyingWorker: (id: string) => boolean
  isReplacingWorker: (id: string) => boolean
  isStartingWorker: (id: string) => boolean
  isStoppingWorker: (id: string) => boolean
  onDestroyWorker: (id: string) => Promise<void>
  onReplaceWorker: (id: string) => Promise<void>
  onStartWorker: (id: string) => Promise<void>
  onStopWorker: (id: string) => Promise<void>
  presets: PresetInfo[]
  workers: WorkerInfo[]
  hierarchy: Record<string, string[]>
}

type WorkerListItemProps = {
  isDestroying: boolean
  isReplacing: boolean
  worker: WorkerInfo
  isStarting: boolean
  isStopping: boolean
  onDestroyWorker: (id: string) => Promise<void>
  onReplaceWorker: (id: string) => Promise<void>
  onStartWorker: (id: string) => Promise<void>
  onStopWorker: (id: string) => Promise<void>
}

function WorkerControls({
  isDestroying,
  isReplacing,
  worker,
  isStarting,
  isStopping,
  onDestroyWorker,
  onReplaceWorker,
  onStartWorker,
  onStopWorker,
}: WorkerListItemProps) {
  const isStopped = worker.status === "stopped"

  return (
    <div className="flex shrink-0 items-center gap-1 self-stretch px-2">
      <Button
        className="data-[hover=true]:bg-white/10"
        isIconOnly
        isLoading={isReplacing}
        onPress={() => void onReplaceWorker(worker.id)}
        size="sm"
        variant="light"
      >
        <IconRefresh size={16} />
      </Button>
      <Button
        className="data-[hover=true]:bg-white/10"
        color={isStopped ? "success" : "default"}
        isIconOnly
        isLoading={isStarting || isStopping}
        onPress={() =>
          void (isStopped ? onStartWorker(worker.id) : onStopWorker(worker.id))
        }
        size="sm"
        variant="light"
      >
        {isStopped ? <IconPlayerPlay size={16} /> : <IconPlayerPause size={16} />}
      </Button>
      <Button
        className="data-[hover=true]:bg-white/10"
        color="danger"
        isIconOnly
        isLoading={isDestroying}
        onPress={() => {
          if (!window.confirm(`Destroy "${worker.title}"?`)) {
            return
          }

          void onDestroyWorker(worker.id)
        }}
        size="sm"
        variant="light"
      >
        <IconTrash size={16} />
      </Button>
    </div>
  )
}

function WorkerItem({
  isDestroying,
  isReplacing,
  worker,
  isStarting,
  isStopping,
  onDestroyWorker,
  onReplaceWorker,
  onStartWorker,
  onStopWorker,
}: WorkerListItemProps) {
  const { id } = useParams<{ id: string }>()
  const isActive = id === worker.id
  const displayStatus = isReplacing ? "migrating" : worker.status

  return (
    <div
      className={`group flex items-stretch gap-1 rounded-md transition ${
        isActive ? "bg-gray-700" : "hover:bg-white/6"
      }`}
    >
      <Button
        as={Link}
        className="relative h-auto flex-1 flex-col items-start gap-0 rounded-md bg-transparent px-4 py-3 text-left data-[hover=true]:bg-transparent"
        to={`/${worker.id}`}
        variant="light"
        fullWidth
      >
        <p className="absolute top-3 right-4 text-sm text-gray-300">
          {formatDuration(worker.durationS)}
        </p>
        <p className="text-sm">
          <span
            className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${statusTone(displayStatus)}`}
          />
          <span className="ml-2 text-gray-300">{worker.preset}</span>
          <span className="ml-2 text-gray-500 uppercase">{displayStatus}</span>
        </p>
        <p className="mt-2 text-base text-wrap">{worker.title}</p>
        <p className="mt-1 text-xs text-gray-500">
          created {formatVersionLabel(worker.createdWithVersion)} / current {formatVersionLabel(worker.currentAgentSwarmVersion)}
        </p>
        {worker.computerUseEnabled &&
        (worker.computerUseStatus === "preparing" ||
          worker.computerUseStatus === "error") ? (
          <p className="mt-1 text-[11px] text-amber-300">
            desktop {worker.computerUseStatus}
          </p>
        ) : null}
      </Button>
      <WorkerControls
        isDestroying={isDestroying}
        isReplacing={isReplacing}
        worker={worker}
        isStarting={isStarting}
        isStopping={isStopping}
        onDestroyWorker={onDestroyWorker}
        onReplaceWorker={onReplaceWorker}
        onStartWorker={onStartWorker}
        onStopWorker={onStopWorker}
      />
    </div>
  )
}

function SubWorkerItem({
  isDestroying,
  isReplacing,
  worker,
  isStarting,
  isStopping,
  onDestroyWorker,
  onReplaceWorker,
  onStartWorker,
  onStopWorker,
}: WorkerListItemProps) {
  const { id } = useParams<{ id: string }>()
  const isActive = id === worker.id
  const displayStatus = isReplacing ? "migrating" : worker.status

  return (
    <div
      className={`group flex items-stretch gap-1 rounded-md transition ${
        isActive ? "bg-gray-700" : "hover:bg-white/6"
      }`}
    >
      <Button
        as={Link}
        className="relative h-auto flex-1 flex-col items-start gap-0 rounded-md bg-transparent pl-8 pr-4 py-2 text-left data-[hover=true]:bg-transparent"
        to={`/${worker.id}`}
        variant="light"
        fullWidth
      >
        <p className="absolute top-2 right-4 text-xs text-gray-300">
          {formatDuration(worker.durationS)}
        </p>
        <p className="text-xs">
          <span
            className={`inline-block h-2 w-2 shrink-0 rounded-full ${statusTone(displayStatus)}`}
          />
          <span className="ml-2 text-gray-300">{worker.preset}</span>
          <span className="ml-2 text-gray-500 uppercase">{displayStatus}</span>
        </p>
        <p className="mt-1 text-sm text-wrap">{worker.title}</p>
        <p className="mt-1 text-[11px] text-gray-500">
          {formatVersionLabel(worker.createdWithVersion)}
          {" -> "}
          {formatVersionLabel(worker.currentAgentSwarmVersion)}
        </p>
        {worker.computerUseEnabled &&
        (worker.computerUseStatus === "preparing" ||
          worker.computerUseStatus === "error") ? (
          <p className="mt-1 text-[11px] text-amber-300">
            desktop {worker.computerUseStatus}
          </p>
        ) : null}
      </Button>
      <WorkerControls
        isDestroying={isDestroying}
        isReplacing={isReplacing}
        worker={worker}
        isStarting={isStarting}
        isStopping={isStopping}
        onDestroyWorker={onDestroyWorker}
        onReplaceWorker={onReplaceWorker}
        onStartWorker={onStartWorker}
        onStopWorker={onStopWorker}
      />
    </div>
  )
}

export function WorkerSidebar({
  globalSettings,
  isDestroyingWorker,
  isReplacingWorker,
  isStartingWorker,
  isStoppingWorker,
  onDestroyWorker,
  onReplaceWorker,
  onStartWorker,
  onStopWorker,
  presets,
  workers,
  hierarchy,
}: WorkerSidebarProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)

  const workerById = new Map(workers.map((w) => [w.id, w]))
  const childIds = new Set(Object.values(hierarchy).flat())
  const topLevelWorkers = workers.filter((w) => !childIds.has(w.id))

  return (
    <>
      <aside className="h-screen w-[20rem] shrink-0 bg-[#282828] p-3">
        <div className="h-full rounded-lg bg-[#353535]">
          <div className="flex items-center justify-between gap-3 px-4 py-4">
            <BrandLogo compact />
            <div className="flex items-center gap-1">
              <div className="relative">
                <Button
                  isIconOnly
                  onPress={() => setIsSettingsModalOpen(true)}
                  size="sm"
                  variant="light"
                >
                  <IconSettings size={18} />
                </Button>
                {globalSettings.githubTokenConfigured ? (
                  <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-emerald-400" />
                ) : null}
              </div>
              <Button
                isIconOnly
                onPress={() => setIsAddModalOpen(true)}
                size="sm"
                variant="light"
              >
                <IconPlus size={18} />
              </Button>
            </div>
          </div>
          {topLevelWorkers.length > 0 ? (
            <div className="flex flex-col">
              {topLevelWorkers.map((worker) => {
                const children = (hierarchy[worker.id] ?? [])
                  .map((childId) => workerById.get(childId))
                  .filter((w): w is WorkerInfo => w !== undefined)

                return (
                  <div key={worker.id}>
                    <WorkerItem
                      isDestroying={isDestroyingWorker(worker.id)}
                      isReplacing={isReplacingWorker(worker.id)}
                      isStarting={isStartingWorker(worker.id)}
                      isStopping={isStoppingWorker(worker.id)}
                      onDestroyWorker={onDestroyWorker}
                      onReplaceWorker={onReplaceWorker}
                      onStartWorker={onStartWorker}
                      onStopWorker={onStopWorker}
                      worker={worker}
                    />
                    {children.map((child) => (
                      <SubWorkerItem
                        key={child.id}
                        isDestroying={isDestroyingWorker(child.id)}
                        isReplacing={isReplacingWorker(child.id)}
                        isStarting={isStartingWorker(child.id)}
                        isStopping={isStoppingWorker(child.id)}
                        onDestroyWorker={onDestroyWorker}
                        onReplaceWorker={onReplaceWorker}
                        onStartWorker={onStartWorker}
                        onStopWorker={onStopWorker}
                        worker={child}
                      />
                    ))}
                  </div>
                )
              })}
            </div>
          ) : null}
        </div>
      </aside>

      <AddWorkerModal
        globalSettings={globalSettings}
        isOpen={isAddModalOpen}
        onOpenChange={setIsAddModalOpen}
        presets={presets}
      />
      <GlobalSettingsModal
        isOpen={isSettingsModalOpen}
        onOpenChange={setIsSettingsModalOpen}
        settings={globalSettings}
      />
    </>
  )
}
