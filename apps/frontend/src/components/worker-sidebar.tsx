import { Button } from "@heroui/react"
import { IconPlus, IconSettings } from "@tabler/icons-react"
import { useState } from "react"
import { Link, useParams } from "react-router"
import type { GlobalSettings, PresetInfo, WorkerInfo } from "../lib/api-types"
import { formatDuration, statusTone } from "../lib/format"
import { AddWorkerModal } from "./add-worker-modal"
import { BrandLogo } from "./brand-logo"
import { GlobalSettingsModal } from "./global-settings-modal"

type WorkerSidebarProps = {
  globalSettings: GlobalSettings
  presets: PresetInfo[]
  workers: WorkerInfo[]
  hierarchy: Record<string, string[]>
}

function WorkerItem({ worker }: { worker: WorkerInfo }) {
  const { id } = useParams<{ id: string }>()
  const isActive = id === worker.id

  return (
    <Button
      as={Link}
      className={`relative h-auto w-full flex-col items-start gap-0 rounded-none px-4 py-3 text-left ${
        isActive ? "bg-gray-700" : ""
      }`}
      to={`/${worker.id}`}
      variant="light"
      fullWidth
    >
      <p className="absolute top-3 right-4 text-sm text-gray-300">
        {formatDuration(worker.durationS)}
      </p>
      <p className="text-sm">
        <span
          className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${statusTone(worker.status)}`}
        />
        <span className="ml-2 text-gray-300">{worker.preset}</span>
        <span className="ml-2 text-gray-500 uppercase">{worker.status}</span>
      </p>
      <p className="mt-2 text-base text-wrap">{worker.title}</p>
    </Button>
  )
}

function SubWorkerItem({ worker }: { worker: WorkerInfo }) {
  const { id } = useParams<{ id: string }>()
  const isActive = id === worker.id

  return (
    <Button
      as={Link}
      className={`relative h-auto w-full flex-col items-start gap-0 rounded-none pl-8 pr-4 py-2 text-left ${
        isActive ? "bg-gray-700" : ""
      }`}
      to={`/${worker.id}`}
      variant="light"
      fullWidth
    >
      <p className="absolute top-2 right-4 text-xs text-gray-300">
        {formatDuration(worker.durationS)}
      </p>
      <p className="text-xs">
        <span
          className={`inline-block h-2 w-2 shrink-0 rounded-full ${statusTone(worker.status)}`}
        />
        <span className="ml-2 text-gray-300">{worker.preset}</span>
        <span className="ml-2 text-gray-500 uppercase">{worker.status}</span>
      </p>
      <p className="mt-1 text-sm text-wrap">{worker.title}</p>
    </Button>
  )
}

export function WorkerSidebar({
  globalSettings,
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
                    <WorkerItem worker={worker} />
                    {children.map((child) => (
                      <SubWorkerItem key={child.id} worker={child} />
                    ))}
                  </div>
                )
              })}
            </div>
          ) : null}
        </div>
      </aside>

      <AddWorkerModal
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
