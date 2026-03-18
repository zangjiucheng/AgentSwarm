import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/react"
import {
  IconExternalLink,
  IconPlayerPause,
  IconPlayerPlay,
  IconTrash,
} from "@tabler/icons-react"
import { useState } from "react"
import type { WorkerInfo } from "../lib/api-types"
import { getWorkerIframeUrl } from "../lib/worker-urls"
import { WorkerTerminalPanel } from "./worker-terminal-panel"

type WorkerWorkspaceState = "active" | "cached" | "unloaded"

type WorkerWorkspaceProps = {
  isStarting: boolean
  isStopping: boolean
  onDestroyWorker: (id: string) => Promise<void>
  onStartWorker: (id: string) => Promise<void>
  onStopWorker: (id: string) => Promise<void>
  state: WorkerWorkspaceState
  worker: WorkerInfo
}

export function WorkerWorkspace({
  isStarting,
  isStopping,
  onDestroyWorker,
  onStartWorker,
  onStopWorker,
  state,
  worker,
}: WorkerWorkspaceProps) {
  const [destroyModalOpen, setDestroyModalOpen] = useState(false)
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

      <section className={`absolute inset-0 flex flex-col ${hiddenClass}`}>
        <div className="flex items-center justify-end gap-2 border-b border-gray-700 bg-[#282828] px-4 py-3">
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
