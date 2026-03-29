import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/react"
import {
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconBrandGithub,
  IconCopy,
  IconRefresh,
  IconExternalLink,
  IconPencil,
  IconPlayerPause,
  IconPlayerPlay,
  IconTrash,
} from "@tabler/icons-react"
import { useEffect, useMemo, useRef, useState } from "react"
import type { GlobalSettings, WorkerConnectionInfo, WorkerInfo } from "../lib/api-types"
import { getWorkerComputerUseUrl, getWorkerIframeUrl } from "../lib/worker-urls"
import { trpc } from "../trpc"
import { WorkerGithubModal } from "./worker-github-modal"

type WorkerWorkspaceState = "active" | "cached" | "unloaded"

type WorkerWorkspaceProps = {
  globalSettings: GlobalSettings
  isReplacing: boolean
  isRenaming: boolean
  isUpdatingSsh: boolean
  isStarting: boolean
  isStopping: boolean
  onDestroyWorker: (id: string) => Promise<void>
  onRenameWorker: (id: string, title: string) => Promise<void>
  onReplaceWorker: (id: string) => Promise<void>
  onSetWorkerSsh: (id: string, enabled: boolean) => Promise<void>
  onStartWorker: (id: string) => Promise<void>
  onStopWorker: (id: string) => Promise<void>
  state: WorkerWorkspaceState
  worker: WorkerInfo
}

function normalizeSshHost(rawHost: string) {
  const trimmedHost = rawHost.trim()

  if (!trimmedHost) {
    return "localhost"
  }

  if (trimmedHost.startsWith("[") && trimmedHost.endsWith("]")) {
    return trimmedHost.slice(1, -1)
  }

  return trimmedHost
}

type CopyableBlockProps = {
  copied: boolean
  label: string
  onCopy: () => Promise<void>
  value: string
}

type CopyActionCardProps = {
  copied: boolean
  description: string
  label: string
  onCopy: () => Promise<void>
}

function CopyableBlock({
  copied,
  label,
  onCopy,
  value,
}: CopyableBlockProps) {
  return (
    <div className="overflow-hidden rounded-md border border-gray-800 bg-[#171717]">
      <div className="flex items-center justify-between gap-3 border-b border-gray-800 px-3 py-2">
        <p className="text-default-400 text-[11px] font-medium tracking-[0.16em] uppercase">
          {label}
        </p>
        <Button
          onPress={() => void onCopy()}
          size="sm"
          startContent={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
          variant="flat"
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all px-3 py-3 font-mono text-xs text-gray-100">
        {value}
      </pre>
    </div>
  )
}

function CopyActionCard({
  copied,
  description,
  label,
  onCopy,
}: CopyActionCardProps) {
  return (
    <div className="overflow-hidden rounded-md border border-gray-800 bg-[#171717]">
      <div className="flex items-center justify-between gap-3 border-b border-gray-800 px-3 py-2">
        <p className="text-default-400 text-[11px] font-medium tracking-[0.16em] uppercase">
          {label}
        </p>
        <Button
          onPress={() => void onCopy()}
          size="sm"
          startContent={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
          variant="flat"
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <div className="px-3 py-3 text-xs text-gray-300">
        {description}
      </div>
    </div>
  )
}

async function copyTextToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value)
      return
    } catch {
      // Fall back to a manual textarea-based copy path on browsers where
      // clipboard permissions fail despite the API being present.
    }
  }

  const textarea = document.createElement("textarea")
  textarea.value = value
  textarea.setAttribute("readonly", "")
  textarea.style.position = "fixed"
  textarea.style.opacity = "0"
  textarea.style.pointerEvents = "none"
  document.body.append(textarea)
  textarea.focus()
  textarea.select()

  const copied = document.execCommand("copy")
  textarea.remove()

  if (!copied) {
    throw new Error("Clipboard copy failed")
  }
}

export function WorkerWorkspace({
  globalSettings,
  isReplacing,
  isRenaming,
  isUpdatingSsh,
  isStarting,
  isStopping,
  onDestroyWorker,
  onRenameWorker,
  onReplaceWorker,
  onSetWorkerSsh,
  onStartWorker,
  onStopWorker,
  state,
  worker,
}: WorkerWorkspaceProps) {
  const [destroyModalOpen, setDestroyModalOpen] = useState(false)
  const [githubModalOpen, setGithubModalOpen] = useState(false)
  const [isDestroying, setIsDestroying] = useState(false)
  const [renameModalOpen, setRenameModalOpen] = useState(false)
  const [renameTitle, setRenameTitle] = useState(worker.title)
  const [sshPanelOpen, setSshPanelOpen] = useState(false)
  const [copiedSshField, setCopiedSshField] = useState<
    "command" | "config" | "credential" | null
  >(null)
  const copyResetTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    setRenameTitle(worker.title)
  }, [worker.title])

  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current)
      }
    }
  }, [])

  const hiddenClass =
    state === "active"
      ? "pointer-events-auto opacity-100"
      : "pointer-events-none opacity-0"
  const hasWorkerPort = worker.port > 0
  const hasComputerUsePort = worker.vncPort > 0
  const isReady = worker.status === "ready"
  const isStopped = worker.status === "stopped"
  const workerUrl = getWorkerIframeUrl(worker.port)
  const workerConnectionQuery = trpc.workerConnection.useQuery(
    { id: worker.id },
    {
      enabled:
        state === "active" &&
        ((sshPanelOpen && worker.sshEnabled) || worker.computerUseEnabled),
      refetchInterval: 10_000,
      refetchOnWindowFocus: false,
    },
  )
  const computerUseUrl = getWorkerComputerUseUrl(
    worker.vncPort,
    workerConnectionQuery.data?.vncPassword,
  )
  const computerUseStatus = workerConnectionQuery.data?.computerUseStatus ??
    worker.computerUseStatus
  const computerUseReady = computerUseStatus === "ready"
  const computerUsePreparing = computerUseStatus === "preparing"
  const computerUseError = computerUseStatus === "error"

  const sshDetails = useMemo(() => {
    const connection = workerConnectionQuery.data as WorkerConnectionInfo | undefined

    if (!connection?.available || connection.sshPort == null || connection.sshUser == null) {
      return null
    }

    const host = normalizeSshHost(window.location.hostname)
    const sshTarget = `${connection.sshUser}@${host}`
    const configAlias = `agentswarm-${worker.id.slice(0, 8)}`
    const password = connection.sshPassword
    const privateKey = connection.sshPrivateKey

    return {
      authMethod: connection.sshAuthMode,
      command: `ssh ${sshTarget} -p ${connection.sshPort}`,
      config: [
        `Host ${configAlias}`,
        `  HostName ${host}`,
        `  User ${connection.sshUser}`,
        `  Port ${connection.sshPort}`,
        ...(connection.sshAuthMode === "publicKey"
          ? ["  IdentitiesOnly yes", "  IdentityFile ~/.ssh/id_ed25519"]
          : []),
      ].join("\n"),
      credentialLabel:
        connection.sshAuthMode === "password"
          ? "Password"
          : connection.sshAuthMode === "publicKey"
            ? "Authorized keys"
            : "SSH credential",
      credentialValue:
        connection.sshAuthMode === "password"
          ? password
          : connection.sshAuthMode === "publicKey"
            ? null
            : privateKey,
      privateKey,
      password,
      target: sshTarget,
      workspaceDir: connection.workspaceDir ?? "/home/kasm-user/workers",
    }
  }, [worker.id, workerConnectionQuery.data])

  const desktopUrl = computerUseUrl
  const workspaceTitle = `${worker.title} code-server`

  const handleDestroy = async () => {
    setIsDestroying(true)
    try {
      await onDestroyWorker(worker.id)
    } finally {
      setIsDestroying(false)
      setDestroyModalOpen(false)
    }
  }

  const handleRename = async () => {
    const nextTitle = renameTitle.trim()

    if (!nextTitle) {
      window.alert("Worker title cannot be empty")
      return
    }

    try {
      await onRenameWorker(worker.id, nextTitle)
      setRenameModalOpen(false)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to rename worker"
      window.alert(message)
    }
  }

  const handleCopySshField = async (
    field: "command" | "config" | "credential",
    value: string,
  ) => {
    try {
      await copyTextToClipboard(value)
      setCopiedSshField(field)

      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current)
      }

      copyResetTimeoutRef.current = window.setTimeout(() => {
        setCopiedSshField((current) => (current === field ? null : current))
        copyResetTimeoutRef.current = null
      }, 1500)
    } catch {
      window.alert("Failed to copy SSH content to the clipboard")
    }
  }

  if (state === "unloaded") {
    return null
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

      <Modal
        backdrop="blur"
        isOpen={renameModalOpen}
        onOpenChange={setRenameModalOpen}
        placement="top-center"
      >
        <ModalContent>
          {(close) => (
            <>
              <ModalHeader>Rename Worker</ModalHeader>
              <ModalBody>
                <Input
                  autoFocus
                  label="Worker title"
                  onValueChange={setRenameTitle}
                  placeholder="Enter a title"
                  value={renameTitle}
                />
              </ModalBody>
              <ModalFooter className="pt-3">
                <Button onPress={close} variant="light">
                  Cancel
                </Button>
                <Button
                  isLoading={isRenaming}
                  onPress={() => void handleRename()}
                  variant="flat"
                >
                  Save
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
            isLoading={isRenaming}
            onPress={() => setRenameModalOpen(true)}
            size="sm"
            startContent={<IconPencil size={16} />}
            variant="light"
          >
            Rename
          </Button>
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
          {worker.sshEnabled ? (
            <Button
              isLoading={isUpdatingSsh}
              onPress={() => setSshPanelOpen((open) => !open)}
              size="sm"
              startContent={
                sshPanelOpen ? (
                  <IconChevronDown size={16} />
                ) : (
                  <IconChevronRight size={16} />
                )
              }
              variant="light"
            >
              SSH
            </Button>
          ) : (
            <Button
              isLoading={isUpdatingSsh}
              onPress={() => void onSetWorkerSsh(worker.id, true)}
              size="sm"
              variant="light"
            >
              Enable SSH
            </Button>
          )}
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
          {worker.computerUseEnabled ? (
            <Button
              as="a"
              href={desktopUrl}
              isDisabled={!hasComputerUsePort || !isReady || !computerUseReady}
              rel="noreferrer"
              size="sm"
              startContent={<IconExternalLink size={16} />}
              target="_blank"
              variant="flat"
            >
              Open desktop
            </Button>
          ) : null}
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
          {worker.sshEnabled && sshPanelOpen ? (
            <div className="border-b border-gray-800 bg-[#222222] px-4 py-3">
              <div className="mb-3 flex justify-end">
                <Button
                  isLoading={isUpdatingSsh}
                  onPress={() => void onSetWorkerSsh(worker.id, false)}
                  size="sm"
                  variant="flat"
                >
                  Disable SSH
                </Button>
              </div>
              {sshDetails ? (
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-start">
                  <CopyActionCard
                    copied={copiedSshField === "config"}
                    label="VS Code SSH config"
                    onCopy={() => handleCopySshField("config", sshDetails.config)}
                    description="Copy this block into your SSH config, then connect from VS Code Remote-SSH using the Host entry it defines."
                  />
                  <CopyableBlock
                    copied={copiedSshField === "command"}
                    label="Terminal command"
                    onCopy={() => handleCopySshField("command", sshDetails.command)}
                    value={sshDetails.command}
                  />
                  {sshDetails.credentialValue ? (
                    <CopyableBlock
                      copied={copiedSshField === "credential"}
                      label={sshDetails.credentialLabel}
                      onCopy={() =>
                        handleCopySshField("credential", sshDetails.credentialValue ?? "")
                      }
                      value={sshDetails.credentialValue}
                    />
                  ) : (
                    <div className="overflow-hidden rounded-md border border-gray-800 bg-[#171717]">
                      <div className="border-b border-gray-800 px-3 py-2">
                        <p className="text-default-400 text-[11px] font-medium tracking-[0.16em] uppercase">
                          {sshDetails.credentialLabel}
                        </p>
                      </div>
                      <div className="px-3 py-3 text-xs text-gray-300">
                        {globalSettings.sshPublicKeys.length > 0
                          ? `This worker trusts ${globalSettings.sshPublicKeys.length} public key${globalSettings.sshPublicKeys.length === 1 ? "" : "s"} from Settings.`
                          : "No public keys are configured in Settings."}
                      </div>
                    </div>
                  )}
                  <div className="text-default-400 text-xs">
                    <p>User: `kasm-user`</p>
                    <p>Workspace: `{sshDetails.workspaceDir}`</p>
                    <p>
                      {sshDetails.authMethod === "publicKey"
                        ? "Auth: public key"
                        : sshDetails.authMethod === "password"
                          ? "Auth: password"
                          : "Auth: unknown"}
                    </p>
                    <p>
                      {sshDetails.authMethod === "publicKey"
                        ? "Use one of the public keys configured in Settings on your local machine."
                        : sshDetails.authMethod === "password"
                          ? "Use the command on the left with the password in the middle."
                          : "SSH is enabled, but no login credential is currently available."}
                    </p>
                    <p>
                      In VS Code Remote-SSH, add the config block first, then connect using the Host entry from your SSH config.
                    </p>
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
          ) : null}

          {worker.computerUseEnabled ? (
            <div className="border-b border-gray-800 bg-[#1d1d1d] px-4 py-2 text-xs text-gray-300">
              <span className="font-medium text-gray-100">Computer use mode</span>
              <span className="ml-2 uppercase text-gray-400">{computerUseStatus}</span>
              {computerUseReady && workerConnectionQuery.data?.vncPassword ? (
                <span>{` · VNC password: ${workerConnectionQuery.data.vncPassword}`}</span>
              ) : null}
              <span className="ml-2 text-gray-400">
                Desktop opens in a separate tab so the main workspace stays on code-server.
              </span>
            </div>
          ) : null}

          {worker.computerUseEnabled && (computerUsePreparing || computerUseError) ? (
            <div className="border-b border-gray-800 bg-[#191919] px-4 py-3">
              <p className="text-sm font-medium text-gray-100">
                {computerUsePreparing
                  ? "Preparing computer-use environment"
                  : "Computer-use environment failed"}
              </p>
              <p className="mt-1 text-xs text-gray-400">
                {computerUsePreparing
                  ? "Desktop packages are being provisioned from the configured flake outputs. code-server stays available while this finishes."
                  : workerConnectionQuery.data?.computerUseError ??
                    "Open desktop will remain unavailable until provisioning succeeds."}
              </p>
              {workerConnectionQuery.data?.computerUseLog ? (
                <pre className="mt-3 max-h-48 overflow-auto rounded-md border border-gray-800 bg-[#111111] px-3 py-3 whitespace-pre-wrap break-all font-mono text-[11px] text-gray-200">
                  {workerConnectionQuery.data.computerUseLog}
                </pre>
              ) : null}
            </div>
          ) : null}

          {hasWorkerPort && isReady ? (
            <iframe
              allow="clipboard-read; clipboard-write; fullscreen; self"
              allowFullScreen
              className="min-h-0 flex-1 border-0 bg-[#282828]"
              src={workerUrl}
              title={workspaceTitle}
            />
          ) : isStopped ? (
            <div className="flex min-h-0 flex-1 items-center justify-center bg-[#282828] px-6">
              <div className="max-w-md text-center">
                <p className="text-default-300 text-sm font-medium">
                  Worker is stopped
                </p>
                <p className="text-default-500 mt-2 text-xs">
                  Start this worker to relaunch its
                  {worker.computerUseEnabled ? " code-server and desktop session" : " code-server session"}
                  {" "}and reopen the persisted workspace.
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
                  The code-server endpoint is unavailable. Check the worker logs or
                  Docker Desktop for the startup failure.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  )
}
