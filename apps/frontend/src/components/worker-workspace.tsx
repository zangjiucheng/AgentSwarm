import { Button, Divider, Spinner, Tooltip } from "@heroui/react"
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react"
import { getTerminalSelectionKey, readStoredString, writeStoredString } from "../lib/storage"
import type { WorkerInfo } from "../lib/api-types"
import { TerminalSession } from "./terminal-session"
import { getWorkerIframeUrl } from "../lib/worker-urls"

type WorkerWorkspaceProps = {
  isActive: boolean
  onTerminalHeightChange: (height: number) => void
  terminalHeight: number
  worker: WorkerInfo
}

type TerminalName = "claude" | "terminal"

const terminalSessions: Array<{
  command: string
  label: string
  value: TerminalName
}> = [
  {
    command: "tmux new-session -A -s claude",
    label: "claude",
    value: "claude",
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

export function WorkerWorkspace({
  isActive,
  onTerminalHeightChange,
  terminalHeight,
  worker,
}: WorkerWorkspaceProps) {
  const shellRef = useRef<HTMLDivElement | null>(null)
  const [activeTerminal, setActiveTerminal] = useState<TerminalName>(() => {
    const storedTerminal = readStoredString(getTerminalSelectionKey(worker.port))
    return storedTerminal === "terminal" ? "terminal" : "claude"
  })
  const [iframeState, setIframeState] = useState<"loading" | "ready" | "error">(
    worker.port > 0 ? "loading" : "error",
  )

  const iframeUrl = useMemo(() => {
    if (worker.port <= 0) {
      return undefined
    }

    return getWorkerIframeUrl(worker.port)
  }, [worker.port])

  useEffect(() => {
    writeStoredString(getTerminalSelectionKey(worker.port), activeTerminal)
  }, [activeTerminal, worker.port])

  const beginResize = (event: ReactMouseEvent<HTMLButtonElement>) => {
    const shell = shellRef.current

    if (!shell) {
      return
    }

    event.preventDefault()

    const startHeight = terminalHeight
    const startY = event.clientY
    const shellRect = shell.getBoundingClientRect()
    const maximumHeight = Math.max(
      MIN_TERMINAL_HEIGHT,
      shellRect.height - MIN_VIEWPORT_HEIGHT,
    )

    const handlePointerMove = (moveEvent: globalThis.MouseEvent) => {
      const delta = startY - moveEvent.clientY
      onTerminalHeightChange(
        clamp(startHeight + delta, MIN_TERMINAL_HEIGHT, maximumHeight),
      )
    }

    const stopResize = () => {
      window.removeEventListener("mousemove", handlePointerMove)
      window.removeEventListener("mouseup", stopResize)
    }

    window.addEventListener("mousemove", handlePointerMove)
    window.addEventListener("mouseup", stopResize)
  }

  const hiddenClass = isActive
    ? "pointer-events-auto opacity-100"
    : "pointer-events-none opacity-0"

  return (
    <section
      className={`absolute inset-0 flex flex-col transition-opacity duration-200 ${hiddenClass}`}
      ref={shellRef}
    >
      {iframeUrl ? (
        <>
          <div className="min-h-0 flex-1">
            <div className="relative h-full overflow-hidden">
              <iframe
                allow="clipboard-read; clipboard-write"
                className="h-full w-full border-0 bg-black"
                onError={() => setIframeState("error")}
                onLoad={() => setIframeState("ready")}
                src={iframeUrl}
                title={`${worker.title} preview`}
              />
              {iframeState !== "ready" ? (
                <div className="absolute inset-0 flex items-center justify-center bg-background/82 backdrop-blur-sm">
                  <div className="flex max-w-sm flex-col items-center gap-3 px-6 text-center">
                    {iframeState === "loading" ? (
                      <>
                        <Spinner color="secondary" size="sm" />
                        <p className="text-sm text-default-500">
                          Loading the worker preview.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-default-400">
                          The worker preview did not load.
                        </p>
                        <Button
                          as="a"
                          color="secondary"
                          href={iframeUrl}
                          rel="noreferrer"
                          size="sm"
                          target="_blank"
                          variant="flat"
                        >
                          Open in a new tab
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="shrink-0">
            <button
              aria-label="Resize terminal area"
              className="flex h-6 w-full items-center justify-center text-default-500 transition hover:text-default-300"
              onMouseDown={beginResize}
              type="button"
            >
              <span className="h-px w-full bg-divider" />
              <span className="absolute rounded-full bg-default-500 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-background">
                drag
              </span>
            </button>
          </div>

          <div
            className="relative shrink-0 overflow-hidden"
            style={{ height: `${terminalHeight}px` }}
          >
            <div className="flex h-12 items-center justify-between px-5">
              <div className="flex items-center gap-2">
                {terminalSessions.map((session) => {
                  const isSelected = activeTerminal === session.value

                  return (
                    <Button
                      className={isSelected ? "text-primary" : "text-default-500"}
                      color={isSelected ? "secondary" : "default"}
                      key={session.value}
                      onPress={() => setActiveTerminal(session.value)}
                      radius="full"
                      size="sm"
                      variant="light"
                    >
                      {session.label}
                    </Button>
                  )
                })}
              </div>
              <Tooltip content="Worker terminal websocket">
                <p className="text-[11px] uppercase tracking-[0.2em] text-default-500">
                  /monitor/ws
                </p>
              </Tooltip>
            </div>
            <Divider />
            <div className="relative h-[calc(100%-49px)]">
              {terminalSessions.map((session) => (
                <TerminalSession
                  command={session.command}
                  isActive={isActive && activeTerminal === session.value}
                  key={session.value}
                  port={worker.port}
                  title={session.label}
                />
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="flex h-full items-center justify-center px-6">
          <div className="max-w-md text-center">
            <p className="text-sm uppercase tracking-[0.24em] text-default-500">
              Worker unavailable
            </p>
            <p className="mt-3 text-default-400">
              This worker does not have a published monitor port yet, so the
              preview and terminal cannot be opened.
            </p>
          </div>
        </div>
      )}
    </section>
  )
}
