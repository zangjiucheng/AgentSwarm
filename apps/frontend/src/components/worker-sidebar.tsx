import { Button } from "@heroui/react"
import { IconPlus } from "@tabler/icons-react"
import { Link, useParams } from "react-router"
import type { WorkerInfo } from "../lib/api-types"
import { formatDuration, statusTone } from "../lib/format"

type WorkerSidebarProps = {
  onCreateWorker: () => void
  workers: WorkerInfo[]
}

function WorkerItem({ worker }: { worker: WorkerInfo }) {
  const { port } = useParams<{ port: string }>()
  const isActive = port === String(worker.port)

  return (
    <Button
      as={Link}
      className={`relative h-auto w-full flex-col justify-start rounded-none px-4 py-3 text-left ${
        isActive ? "text-foreground bg-gray-700" : "text-default-500"
      }`}
      to={`/${worker.port}`}
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
        <span className="ml-1.5 text-gray-300">{worker.preset}</span>
      </p>
      <p className="mt-1">{worker.title}</p>
      {worker.pr ? (
        <a
          className="mt-1"
          href={worker.pr.link}
          rel="noreferrer"
          target="_blank"
        >
          {worker.pr.baseBranch} ← #{worker.pr.number}
        </a>
      ) : null}
      {/* <Divider className="mt-3 text-gray-500" /> */}
    </Button>
  )
}

export function WorkerSidebar({ onCreateWorker, workers }: WorkerSidebarProps) {
  return (
    <aside className="h-screen w-[20rem] shrink-0 border-r border-gray-500 bg-gray-800">
      <div className="flex items-center justify-between px-4 py-4">
        <h1 className="text-default-500 text-xs font-semibold tracking-[0.3em] uppercase">
          ClaudeSwarm
        </h1>
        <Button isIconOnly onPress={onCreateWorker} size="sm" variant="light">
          <IconPlus size={18} />
        </Button>
      </div>
      {workers.length > 0 ? (
        <div className="flex flex-col">
          {workers.map((worker) => (
            <WorkerItem
              key={`${worker.port}-${worker.title}`}
              worker={worker}
            />
          ))}
        </div>
      ) : null}
    </aside>
  )
}
