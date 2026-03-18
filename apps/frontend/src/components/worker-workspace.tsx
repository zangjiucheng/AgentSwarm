import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/react"
import { IconCode, IconTerminal2, IconTrash } from "@tabler/icons-react"
import { useAtom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react"
import type { WorkerInfo } from "../lib/api-types"
import {
  getTerminalSelectionKey,
  readStoredString,
  writeStoredString,
} from "../lib/storage"
import { TerminalSession } from "./terminal-session"
import { useWorkerTerminalDropzone } from "./use-worker-terminal-dropzone"
import { getWorkerIframeUrl } from "../lib/worker-urls"

const DEFAULT_TERMINAL_HEIGHT = 320
const terminalHeightAtom = atomWithStorage(
  "terminal-height",
  DEFAULT_TERMINAL_HEIGHT,
)

type WorkerWorkspaceState = "active" | "cached" | "unloaded"
type WorkerTerminalHandle = {
  sendInput: (data: string) => void
}

type WorkerWorkspaceProps = {
  onDestroyWorker: (id: string) => Promise<void>
  state: WorkerWorkspaceState
  worker: WorkerInfo
}

type TerminalName = "codex" | "terminal"

const terminalSessions: Array<{
  command: string
  label: string
  value: TerminalName
}> = [
  {
    command: "tmux new-session -A -s codex",
    label: "codex",
    value: "codex",
  },
  {
    command: "tmux new-session -A -s terminal",
    label: "terminal",
    value: "terminal",
  },
]

const MIN_TERMINAL_HEIGHT = 200
const MIN_VIEWPORT_HEIGHT = 220

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum)
}

const terminalIcons: Record<TerminalName, typeof IconCode> = {
  codex: IconCode,
  terminal: IconTerminal2,
}

export function WorkerWorkspace({
  onDestroyWorker,
  state,
  worker,
}: WorkerWorkspaceProps) {
  const { id: workerId, port: workerPort } = worker
  const shellRef = useRef<HTMLDivElement | null>(null)
  const codexTerminalRef = useRef<WorkerTerminalHandle | null>(null)
  const terminalRef = useRef<WorkerTerminalHandle | null>(null)
  const [terminalHeight, setTerminalHeight] = useAtom(terminalHeightAtom)
  const [destroyModalOpen, setDestroyModalOpen] = useState(false)
  const [isDestroying, setIsDestroying] = useState(false)
  const [activeTerminal, setActiveTerminal] = useState<TerminalName>(() => {
    const storedTerminal = readStoredString(getTerminalSelectionKey(workerId))
    return storedTerminal === "terminal" ? "terminal" : "codex"
  })

  const handleUploadPathReady = useCallback(
    (typedPaths: string[], targetTerminal: TerminalName) => {
      const terminalHandle =
        targetTerminal === "codex"
          ? codexTerminalRef.current
          : terminalRef.current

      if (typedPaths.length === 0) {
        return
      }

      terminalHandle?.sendInput(typedPaths.join(" "))
    },
    [],
  )

  const {
    clearUploadError,
    getInputProps,
    getRootProps,
    isUploading,
    showDropOverlay,
    uploadError,
    uploadFiles,
    uploadingFileName,
  } = useWorkerTerminalDropzone({
    activeTerminal,
    disabled: state !== "active",
    onUploadPathReady: handleUploadPathReady,
    workerPort,
  })

  const handleDestroy = async () => {
    setIsDestroying(true)
    try {
      await onDestroyWorker(workerId)
    } finally {
      setIsDestroying(false)
      setDestroyModalOpen(false)
    }
  }

  useEffect(() => {
    writeStoredString(getTerminalSelectionKey(workerId), activeTerminal)
  }, [activeTerminal, workerId])

  const beginResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const shell = shellRef.current

    if (!shell) {
      return
    }

    event.preventDefault()
    const target = event.currentTarget
    const pointerId = event.pointerId
    target.setPointerCapture(pointerId)

    const startHeight = terminalHeight
    const startY = event.clientY
    const shellRect = shell.getBoundingClientRect()
    const maximumHeight = Math.max(
      MIN_TERMINAL_HEIGHT,
      shellRect.height - MIN_VIEWPORT_HEIGHT,
    )

    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      const delta = startY - moveEvent.clientY
      setTerminalHeight(
        clamp(startHeight + delta, MIN_TERMINAL_HEIGHT, maximumHeight),
      )
    }

    const stopResize = () => {
      target.removeEventListener("pointermove", handlePointerMove)
      target.removeEventListener("pointerup", stopResize)
      target.removeEventListener("pointercancel", stopResize)
      target.releasePointerCapture(pointerId)
    }

    target.addEventListener("pointermove", handlePointerMove)
    target.addEventListener("pointerup", stopResize)
    target.addEventListener("pointercancel", stopResize)
  }

  if (state === "unloaded") {
    return null
  }

  const hiddenClass =
    state === "active"
      ? "pointer-events-auto opacity-100"
      : "pointer-events-none opacity-0"

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

      <Modal
        backdrop="blur"
        isOpen={uploadError !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            clearUploadError()
          }
        }}
        placement="top-center"
      >
        <ModalContent>
          {(close) => (
            <>
              <ModalHeader>Upload Failed</ModalHeader>
              <ModalBody>
                <p className="text-default-500">{uploadError}</p>
              </ModalBody>
              <ModalFooter className="pt-3">
                <Button
                  onPress={() => {
                    clearUploadError()
                    close()
                  }}
                  variant="light"
                >
                  Close
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      <section
        className={`absolute inset-0 flex flex-col ${hiddenClass}`}
        ref={shellRef}
      >
        <iframe
          allow="autoplay; microphone; clipboard-read; clipboard-write; fullscreen; self"
          allowFullScreen
          className="h-full w-full border-0 bg-[#282828]"
          src={getWorkerIframeUrl(workerPort)}
        />

        <div className="relative shrink-0 border-t border-gray-500">
          <div
            onPointerDown={beginResize}
            className="absolute -top-2 z-10 h-4 w-full cursor-ns-resize"
          />
        </div>

        <div
          className="relative flex shrink-0 overflow-hidden"
          style={{ height: `${terminalHeight}px` }}
        >
          <div className="bg-[#282828] p-3 pl-0">
            <div className="flex h-full flex-col items-center justify-between rounded-lg bg-[#353535] p-1">
              <div className="flex flex-col items-center gap-1">
                {terminalSessions.map((session) => {
                  const isSelected = activeTerminal === session.value
                  const Icon = terminalIcons[session.value]

                  return (
                    <Button
                      className={
                        isSelected ? "text-primary" : "text-default-500"
                      }
                      isIconOnly
                      key={session.value}
                      onPress={() => setActiveTerminal(session.value)}
                      size="sm"
                      variant="light"
                    >
                      <Icon size={18} />
                    </Button>
                  )
                })}
              </div>
              <Button
                className="text-default-500"
                color="danger"
                isIconOnly
                onPress={() => setDestroyModalOpen(true)}
                size="sm"
                variant="light"
              >
                <IconTrash size={18} />
              </Button>
            </div>
          </div>
          <div {...getRootProps({ className: "relative min-w-0 flex-1" })}>
            <input {...getInputProps()} />
            <div
              className={`absolute inset-0 z-20 flex items-center justify-center transition ${
                showDropOverlay
                  ? "pointer-events-auto opacity-100"
                  : "pointer-events-none opacity-0"
              }`}
            >
              <div className="rounded-2xl border border-dashed border-white/30 bg-black/65 px-6 py-5 text-center backdrop-blur-sm">
                <p className="text-sm font-medium text-white">
                  {isUploading
                    ? `Uploading ${uploadingFileName ?? "file"}...`
                    : "Drop files to upload"}
                </p>
                <p className="mt-1 text-xs text-gray-300">
                  The saved paths will be typed into the active terminal.
                </p>
              </div>
            </div>
            {terminalSessions.map((session) => (
              <TerminalSession
                command={session.command}
                isActive={
                  activeTerminal === session.value && state === "active"
                }
                key={session.value}
                onPasteFiles={uploadFiles}
                port={workerPort}
                ref={session.value === "codex" ? codexTerminalRef : terminalRef}
                title={session.label}
              />
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
