import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Snippet,
} from "@heroui/react"
import {
  IconBrandGithub,
  IconRefresh,
  IconExternalLink,
  IconPlayerPause,
  IconPlayerPlay,
  IconTrash,
} from "@tabler/icons-react"
import { useMemo, useState } from "react"
import type { GlobalSettings, WorkerConnectionInfo, WorkerInfo } from "../lib/api-types"
import { getWorkerIframeUrl } from "../lib/worker-urls"
import { trpc } from "../trpc"
import { WorkerGithubModal } from "./worker-github-modal"
import { WorkerTerminalPanel } from "./worker-terminal-panel"

type WorkerWorkspaceState = "active" | "cached" | "unloaded"

type WorkerWorkspaceProps = {
  globalSettings: GlobalSettings
  isReplacing: boolean
  isStarting: boolean
  isStopping: boolean
  onDestroyWorker: (id: string) => Promise<void>
  onReplaceWorker: (id: string) => Promise<void>
  onStartWorker: (id: string) => Promise<void>
  onStopWorker: (id: string) => Promise<void>
  state: WorkerWorkspaceState
  worker: WorkerInfo
}

export function WorkerWorkspace({
  globalSettings,
  isReplacing,
  isStarting,
  isStopping,
  onDestroyWorker,
  onReplaceWorker,
  onStartWorker,
  onStopWorker,
  state,
  worker,
}: WorkerWorkspaceProps) {
  const [destroyModalOpen, setDestroyModalOpen] = useState(false)
  const [githubModalOpen, setGithubModalOpen] = useState(false)
  const [isDestroying, setIsDestroying] = useState(false)

  if (state === "unloaded") {
    return null
  }

  const hiddenClass =
    state === "active"
      ? "pointer-events-auto opacity-100"
      : "pointer-events-none opacity-0"
  const hasWorkerPort = worker.port > 0
  const isReady = worker.status === "ready"
  const isStopped = worker.status === "stopped"
  const workerUrl = getWorkerIframeUrl(worker.port)
  const workerConnectionQuery = trpc.workerConnection.useQuery(
    { id: worker.id },
    {
      enabled: state === "active",
      refetchInterval: 10_000,
      refetchOnWindowFocus: false,
    },
  )

  const sshDetails = useMemo(() => {
    const connection = workerConnectionQuery.data as WorkerConnectionInfo | undefined

    if (!connection?.available || connection.sshPort == null || connection.sshUser == null) {
      return null
    }

    const host = window.location.hostname
    const sshTarget = `${connection.sshUser}@${host}`
    return {
      command: `ssh ${sshTarget} -p ${connection.sshPort}`,
      password: connection.sshPassword,
      target: sshTarget,
      workspaceDir: connection.workspaceDir ?? "/home/kasm-user/workers",
    }
  }, [workerConnectionQuery.data])

  const handleDestroy = async () => {
    setIsDestroying(true)
    try {
      await onDestroyWorker(worker.id)
    } finally {
      setIsDestroying(false)
      setDestroyModalOpen(false)
    }
  }

  return (
    <>
      <Modal
        backdrop="blur"
        isOpen={destroyModalOpen}
        onOpenChange={setDestroyModalOpen}
        placement="top-center"
      >
        <ModalContent>
          {(close) => (
            <>
              <ModalHeader>Destroy Worker</ModalHeader>
              <ModalBody>
                <p className="text-default-500">
                  Destroy &quot;{worker.title}&quot;?
                </p>
              </ModalBody>
              <ModalFooter className="pt-3">
                <Button onPress={close} variant="light">
                  Cancel
                </Button>
                <Button
                  color="danger"
                  isLoading={isDestroying}
                  onPress={() => void handleDestroy()}
                  variant="flat"
                >
                  Destroy
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      <WorkerGithubModal
        isOpen={githubModalOpen}
        onOpenChange={setGithubModalOpen}
        settings={globalSettings}
        worker={worker}
      />

      <section className={`absolute inset-0 flex flex-col ${hiddenClass}`}>
        <div className="flex items-center justify-end gap-2 border-b border-gray-700 bg-[#282828] px-4 py-3">
          <Button
            onPress={() => setGithubModalOpen(true)}
            size="sm"
            startContent={<IconBrandGithub size={16} />}
            variant="light"
          >
            {worker.usesDefaultGithubAccount
              ? "GitHub: Default"
              : `GitHub: ${worker.githubAccountName || worker.githubUsername || "Custom"}`}
          </Button>
          <Button
            isLoading={isReplacing}
            onPress={() => void onReplaceWorker(worker.id)}
            size="sm"
            startContent={<IconRefresh size={16} />}
            variant="light"
          >
            Migrate
          </Button>
          <Button
            color={isStopped ? "success" : "default"}
            isLoading={isStarting || isStopping}
            onPress={() =>
              void (isStopped ? onStartWorker(worker.id) : onStopWorker(worker.id))
            }
            size="sm"
            startContent={
              isStopped ? (
                <IconPlayerPlay size={16} />
              ) : (
                <IconPlayerPause size={16} />
              )
            }
            variant="light"
          >
            {isStopped ? "Start" : "Pause"}
          </Button>
          <Button
            as="a"
            href={workerUrl}
            isDisabled={!hasWorkerPort || !isReady}
            rel="noreferrer"
            size="sm"
            startContent={<IconExternalLink size={16} />}
            target="_blank"
            variant="light"
          >
            Open in tab
          </Button>
          <Button
            color="danger"
            isIconOnly
            onPress={() => setDestroyModalOpen(true)}
            size="sm"
            variant="light"
          >
            <IconTrash size={18} />
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-gray-800 bg-[#222222] px-4 py-3">
            {sshDetails ? (
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
                <Snippet
                  classNames={{
                    base: "bg-default-100 items-start",
                    pre: "whitespace-pre-wrap break-all font-mono text-xs",
                  }}
                  symbol=""
                  variant="flat"
                >
                  {sshDetails.command}
                </Snippet>
                <Snippet
                  classNames={{
                    base: "bg-default-100 items-start",
                    pre: "whitespace-pre-wrap break-all font-mono text-xs",
                  }}
                  symbol=""
                  variant="flat"
                >
                  {sshDetails.password ?? "Password unavailable"}
                </Snippet>
                <div className="text-default-400 text-xs">
                  <p>User: `kasm-user`</p>
                  <p>Workspace: `{sshDetails.workspaceDir}`</p>
                  <p>Use VS Code Remote-SSH with the command on the left.</p>
                </div>
              </div>
            ) : (
              <p className="text-default-500 text-xs">
                {workerConnectionQuery.isLoading
                  ? "Loading VS Code Remote-SSH connection details..."
                  : "VS Code Remote-SSH is unavailable for this worker. Recreate or migrate older workers to enable SSH access."}
              </p>
            )}
          </div>

          {hasWorkerPort && isReady ? (
            <iframe
              allow="clipboard-read; clipboard-write; fullscreen; self"
              allowFullScreen
              className="min-h-0 flex-1 border-0 bg-[#282828]"
              src={workerUrl}
              title={`${worker.title} code-server`}
            />
          ) : isStopped ? (
            <div className="flex min-h-0 flex-1 items-center justify-center bg-[#282828] px-6">
              <div className="max-w-md text-center">
                <p className="text-default-300 text-sm font-medium">
                  Worker is stopped
                </p>
                <p className="text-default-500 mt-2 text-xs">
                  Start this worker to relaunch its code-server session and reopen
                  the persisted workspace.
                </p>
                <Button
                  className="mt-4"
                  color="success"
                  isLoading={isStarting}
                  onPress={() => void onStartWorker(worker.id)}
                  startContent={<IconPlayerPlay size={16} />}
                >
                  Start worker
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center bg-[#282828] px-6">
              <div className="max-w-md text-center">
                <p className="text-default-300 text-sm font-medium">
                  Worker is not ready
                </p>
                <p className="text-default-500 mt-2 text-xs">
                  The code-server endpoint is unavailable. Check the worker logs
                  or Docker Desktop for the startup failure.
                </p>
              </div>
            </div>
          )}

          <WorkerTerminalPanel
            isReady={isReady}
            isStopped={isStopped}
            monitorPort={worker.monitorPort}
          />
        </div>
      </section>
    </>
  )
}
