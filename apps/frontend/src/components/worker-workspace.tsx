import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/react"
import { IconExternalLink, IconTrash } from "@tabler/icons-react"
import { useState } from "react"
import type { WorkerInfo } from "../lib/api-types"
import { getWorkerIframeUrl } from "../lib/worker-urls"

type WorkerWorkspaceState = "active" | "cached" | "unloaded"

type WorkerWorkspaceProps = {
  onDestroyWorker: (id: string) => Promise<void>
  state: WorkerWorkspaceState
  worker: WorkerInfo
}

export function WorkerWorkspace({
  onDestroyWorker,
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
            as="a"
            href={workerUrl}
            isDisabled={!hasWorkerPort}
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

        {hasWorkerPort ? (
          <iframe
            allow="clipboard-read; clipboard-write; fullscreen; self"
            allowFullScreen
            className="h-full w-full border-0 bg-[#282828]"
            src={workerUrl}
            title={`${worker.title} code-server`}
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-[#282828] px-6">
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
      </section>
    </>
  )
}
