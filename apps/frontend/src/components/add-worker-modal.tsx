import {
  Button,
  Checkbox,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  Snippet,
  Textarea,
} from "@heroui/react"
import { Fragment, useEffect, useMemo, useState, type Key } from "react"
import { useNavigate } from "react-router"
import type { GlobalSettings, PresetInfo } from "../lib/api-types"
import { trpc } from "../trpc"

type AddWorkerModalProps = {
  globalSettings: GlobalSettings
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  presets: PresetInfo[]
}

export function AddWorkerModal({
  globalSettings,
  isOpen,
  onOpenChange,
  presets,
}: AddWorkerModalProps) {
  const navigate = useNavigate()
  const utils = trpc.useUtils()

  const [title, setTitle] = useState("")
  const [presetName, setPresetName] = useState("")
  const [cloneRepositoryUrl, setCloneRepositoryUrl] = useState("")
  const [enableSsh, setEnableSsh] = useState(false)
  const [enableComputerUse, setEnableComputerUse] = useState(false)
  const [computerUseExtraFlakeRef, setComputerUseExtraFlakeRef] = useState("")
  const [githubAccountSelection, setGithubAccountSelection] =
    useState<string>("default")
  const [envValues, setEnvValues] = useState<Record<string, string>>({})
  const [showLongLoadHint, setShowLongLoadHint] = useState(false)

  const startWorker = trpc.startWorker.useMutation({
    onSuccess: async ({ id }) => {
      onOpenChange(false)
      await utils.workers.invalidate()
      void navigate(`/${id}`)
    },
    onSettled: () => setShowLongLoadHint(false),
  })

  useEffect(() => {
    if (!startWorker.isPending) return
    const timer = setTimeout(() => setShowLongLoadHint(true), 20_000)
    return () => clearTimeout(timer)
  }, [startWorker.isPending])

  const effectivePresetName = presetName || presets[0]?.name || ""
  const selectedPreset = useMemo(
    () => presets.find((preset) => preset.name === effectivePresetName),
    [effectivePresetName, presets],
  )

  const missingRequiredField =
    title.trim().length === 0 || selectedPreset == null
  const selectedGithubAccount =
    githubAccountSelection === "default"
      ? null
      : globalSettings.githubAccounts.find((account) => account.id === githubAccountSelection) ?? null

  const errorMessage = startWorker.error?.message

  const curlCommand = useMemo(() => {
    if (!selectedPreset) return null

    const input = {
      title: title.trim(),
      preset: selectedPreset.name,
      env: Object.fromEntries(
        selectedPreset.requiredEnv.map((key) => [key, envValues[key] ?? ""]),
      ),
      ...(enableSsh ? { enableSsh: true } : {}),
      ...(enableComputerUse ? { enableComputerUse: true } : {}),
      ...(enableComputerUse && computerUseExtraFlakeRef.trim()
        ? { computerUseExtraFlakeRef: computerUseExtraFlakeRef.trim() }
        : {}),
      ...(githubAccountSelection !== "default"
        ? { githubAccountId: githubAccountSelection }
        : {}),
      ...(cloneRepositoryUrl.trim()
        ? { cloneRepositoryUrl: cloneRepositoryUrl.trim() }
        : {}),
    }

    const origin = window.location.origin
    return `curl -X POST '${origin}/api/trpc/startWorker' \\\n  -H 'content-type: application/json' \\\n  -d '${JSON.stringify(input)}'`
  }, [
    title,
    selectedPreset,
    envValues,
    enableSsh,
    enableComputerUse,
    computerUseExtraFlakeRef,
    githubAccountSelection,
    cloneRepositoryUrl,
  ])

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setTitle("")
      setPresetName("")
      setCloneRepositoryUrl("")
      setEnableSsh(false)
      setEnableComputerUse(false)
      setComputerUseExtraFlakeRef("")
      setGithubAccountSelection("default")
      setEnvValues({})
      setShowLongLoadHint(false)
      startWorker.reset()
    }

    onOpenChange(open)
  }

  return (
    <Modal
      backdrop="blur"
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      placement="top-center"
      size="2xl"
    >
      <ModalContent className="max-h-[88vh] overflow-hidden">
        {(close) => (
          <>
            <ModalHeader className="flex-col items-start gap-1">
              <span>New Worker</span>
              <span className="text-default-500 text-xs font-normal">
                Codex is preinstalled by default. code-server stays primary; computer use mode adds a separate desktop window.
              </span>
            </ModalHeader>
            <ModalBody className="min-h-0 gap-5 overflow-y-auto">
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(20rem,0.9fr)]">
                <div className="space-y-5">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs font-semibold tracking-[0.2em] uppercase text-default-400">
                      Basics
                    </p>
                    <div className="mt-4 space-y-4">
                      <Input
                        autoFocus
                        isRequired
                        label="Title"
                        onValueChange={setTitle}
                        placeholder="UI bug triage, OSS contribution, agent task..."
                        value={title}
                      />
                      <Select
                        isRequired
                        label="Preset"
                        onSelectionChange={(keys) => {
                          const nextKey =
                            keys === "all"
                              ? undefined
                              : (Array.from(keys)[0] as Key | undefined)

                          if (typeof nextKey === "string") {
                            setPresetName(nextKey)
                          }
                        }}
                        selectedKeys={effectivePresetName ? [effectivePresetName] : []}
                      >
                        {presets.map((preset) => (
                          <SelectItem key={preset.name}>{preset.name}</SelectItem>
                        ))}
                      </Select>

                      {presets.length === 0 ? (
                        <p className="text-default-400 text-sm">
                          No presets are currently available from the backend.
                        </p>
                      ) : null}

                      <Input
                        description="Optional. Clone a repository and open the worker in that workspace."
                        label="Repository URL"
                        onValueChange={setCloneRepositoryUrl}
                        placeholder="https://github.com/org/repo.git or git@github.com:org/repo.git"
                        value={cloneRepositoryUrl}
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs font-semibold tracking-[0.2em] uppercase text-default-400">
                      Workspace Mode
                    </p>
                    <div className="mt-4 space-y-4">
                      <Checkbox
                        description="Expose SSH credentials for VS Code Remote-SSH."
                        isSelected={enableSsh}
                        onValueChange={setEnableSsh}
                      >
                        Enable SSH
                      </Checkbox>

                      <Checkbox
                        description="Adds a desktop session, browser, and computer-use tools during startup. The main workspace still opens in code-server."
                        isSelected={enableComputerUse}
                        onValueChange={setEnableComputerUse}
                      >
                        Enable computer use mode
                      </Checkbox>

                      {enableComputerUse ? (
                        <Input
                          description="Optional. Extra flake ref installed after the default computer-use environment, for example github:org/repo#desktopEnv."
                          label="Extra computer-use flake"
                          onValueChange={setComputerUseExtraFlakeRef}
                          placeholder="github:org/repo#computerUseEnv"
                          value={computerUseExtraFlakeRef}
                        />
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs font-semibold tracking-[0.2em] uppercase text-default-400">
                      GitHub
                    </p>
                    <div className="mt-4 space-y-4">
                      <Select
                        description="Choose a saved account for this worker or keep following the global default."
                        label="GitHub Account"
                        onSelectionChange={(keys) => {
                          const nextKey =
                            keys === "all"
                              ? undefined
                              : (Array.from(keys)[0] as Key | undefined)

                          if (typeof nextKey === "string") {
                            setGithubAccountSelection(nextKey)
                          }
                        }}
                        selectedKeys={[githubAccountSelection]}
                      >
                        <SelectItem key="default" textValue="Follow default">
                          Follow default
                        </SelectItem>
                        {globalSettings.githubAccounts.map((account) => (
                          <SelectItem
                            key={account.id}
                            textValue={`${account.name} (@${account.username})`}
                          >
                            {account.name} (@{account.username})
                          </SelectItem>
                        ))}
                      </Select>
                    </div>
                  </div>

                  {selectedPreset && selectedPreset.requiredEnv.length > 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-xs font-semibold tracking-[0.2em] uppercase text-default-400">
                        Required Environment
                      </p>
                      <div className="mt-4 grid grid-cols-[auto_1fr] items-start gap-x-4 gap-y-4">
                        {selectedPreset.requiredEnv.map((envKey) => (
                          <Fragment key={envKey}>
                            <label className="text-foreground self-center font-mono text-sm">
                              {envKey}
                            </label>
                            <Textarea
                              onValueChange={(value) =>
                                setEnvValues((currentValues) => ({
                                  ...currentValues,
                                  [envKey]: value,
                                }))
                              }
                              value={envValues[envKey] ?? ""}
                              minRows={1}
                            />
                          </Fragment>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-5">
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/8 p-4">
                    <p className="text-xs font-semibold tracking-[0.2em] uppercase text-emerald-300">
                      Launch Summary
                    </p>
                    <div className="mt-4 grid gap-3">
                      <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-default-400">
                          Main Workspace
                        </p>
                        <p className="mt-1 text-sm text-default-100">code-server</p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-default-400">
                          Desktop
                        </p>
                        <p className="mt-1 text-sm text-default-100">
                          {enableComputerUse ? "Enabled after provisioning" : "Off"}
                        </p>
                        {enableComputerUse ? (
                          <p className="mt-1 text-xs text-default-400">
                            {computerUseExtraFlakeRef.trim()
                              ? `Default flake + ${computerUseExtraFlakeRef.trim()}`
                              : "Default computer-use flake"}
                          </p>
                        ) : null}
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-default-400">
                          Connectivity
                        </p>
                        <p className="mt-1 text-sm text-default-100">
                          SSH {enableSsh ? "enabled" : "disabled"}
                        </p>
                        <p className="mt-1 text-xs text-default-400">
                          {selectedGithubAccount
                            ? `${selectedGithubAccount.name} (@${selectedGithubAccount.username})`
                            : "GitHub follows default account"}
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-default-400">
                          Source
                        </p>
                        <p className="mt-1 text-sm text-default-100">
                          {cloneRepositoryUrl.trim() || "Empty workspace"}
                        </p>
                        <p className="mt-1 text-xs text-default-400">
                          Preset: {selectedPreset?.name ?? "Not selected"}
                        </p>
                      </div>
                      {selectedPreset && selectedPreset.requiredEnv.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-white/10 px-3 py-3 text-xs text-default-400">
                          This preset does not require any extra environment variables.
                        </div>
                      ) : null}
                      <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-default-400">
                          Default Tools
                        </p>
                        <p className="mt-1 text-sm text-default-100">
                          Codex, terminal, git, code-server
                        </p>
                      </div>
                    </div>
                  </div>

                  {curlCommand ? (
                    <Snippet
                      classNames={{
                        base: "bg-default-100 items-start",
                        pre: "whitespace-pre-wrap break-all font-mono text-xs",
                      }}
                      symbol=""
                      variant="flat"
                    >
                      {curlCommand}
                    </Snippet>
                  ) : null}
                </div>
              </div>

              {errorMessage ? (
                <p className="text-danger text-sm">{errorMessage}</p>
              ) : null}
            </ModalBody>
            <ModalFooter className="flex-col items-stretch gap-2 pt-3">
              <div className="flex w-full justify-end gap-2">
                <Button onPress={close} variant="light">
                  Cancel
                </Button>
                <Button
                  color="primary"
                  isDisabled={missingRequiredField}
                  isLoading={startWorker.isPending}
                  onPress={() => {
                    if (!selectedPreset) {
                      return
                    }

                    startWorker.mutate({
                      ...(enableComputerUse ? { enableComputerUse: true } : {}),
                      ...(enableComputerUse && computerUseExtraFlakeRef.trim()
                        ? { computerUseExtraFlakeRef: computerUseExtraFlakeRef.trim() }
                        : {}),
                      ...(enableSsh ? { enableSsh: true } : {}),
                      ...(githubAccountSelection !== "default"
                        ? { githubAccountId: githubAccountSelection }
                        : {}),
                      ...(cloneRepositoryUrl.trim()
                        ? { cloneRepositoryUrl: cloneRepositoryUrl.trim() }
                        : {}),
                      env: Object.fromEntries(
                        selectedPreset.requiredEnv.map((key) => [
                          key,
                          envValues[key] ?? "",
                        ]),
                      ),
                      preset: selectedPreset.name,
                      title: title.trim(),
                    })
                  }}
                  variant="flat"
                >
                  Start worker
                </Button>
              </div>
              {showLongLoadHint ? (
                <p className="text-default-400 text-center text-xs">
                  Creating a worker for the first time may take a long time due
                  to pulling images.
                </p>
              ) : null}
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  )
}
