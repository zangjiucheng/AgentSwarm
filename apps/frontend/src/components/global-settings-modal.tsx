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
  IconBrandGithub,
  IconSettings,
} from "@tabler/icons-react"
import { useEffect, useMemo, useState } from "react"
import type { GlobalSettings } from "../lib/api-types"
import { trpc } from "../trpc"

type GlobalSettingsModalProps = {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  settings: GlobalSettings
}

type SettingsSection = "github" | "other"

export function GlobalSettingsModal({
  isOpen,
  onOpenChange,
  settings,
}: GlobalSettingsModalProps) {
  const utils = trpc.useUtils()
  const [activeSection, setActiveSection] = useState<SettingsSection>("github")
  const [accountName, setAccountName] = useState("")
  const [autoPauseMinutes, setAutoPauseMinutes] = useState("")
  const [githubUsername, setGithubUsername] = useState("")
  const [githubToken, setGithubToken] = useState("")

  const refreshQueries = async () => {
    await Promise.all([
      utils.globalSettings.invalidate(),
      utils.workers.invalidate(),
    ])
  }

  const saveGithubAccount = trpc.saveGithubAccount.useMutation({
    onSuccess: async () => {
      setAccountName("")
      setGithubUsername("")
      setGithubToken("")
      await refreshQueries()
    },
  })

  const saveGlobalSettings = trpc.saveGlobalSettings.useMutation({
    onSuccess: refreshQueries,
  })

  const deleteGithubAccount = trpc.deleteGithubAccount.useMutation({
    onSuccess: refreshQueries,
  })

  const setDefaultGithubAccount = trpc.setDefaultGithubAccount.useMutation({
    onSuccess: refreshQueries,
  })

  const resetState = () => {
    setActiveSection("github")
    setAccountName("")
    setAutoPauseMinutes(
      settings.autoPauseMinutes == null ? "" : String(settings.autoPauseMinutes),
    )
    setGithubUsername("")
    setGithubToken("")
    saveGlobalSettings.reset()
    saveGithubAccount.reset()
    deleteGithubAccount.reset()
    setDefaultGithubAccount.reset()
  }

  useEffect(() => {
    if (!isOpen) {
      return
    }

    setAutoPauseMinutes(
      settings.autoPauseMinutes == null ? "" : String(settings.autoPauseMinutes),
    )
  }, [isOpen, settings.autoPauseMinutes])

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      resetState()
    }

    onOpenChange(open)
  }

  const canAddAccount = useMemo(() => {
    return (
      accountName.trim().length > 0 &&
      githubUsername.trim().length > 0 &&
      githubToken.trim().length > 0
    )
  }, [accountName, githubToken, githubUsername])

  const parsedAutoPauseMinutes = autoPauseMinutes.trim()
    ? Number.parseInt(autoPauseMinutes.trim(), 10)
    : null
  const normalizedAutoPauseMinutes =
    parsedAutoPauseMinutes == null || parsedAutoPauseMinutes <= 0
      ? null
      : parsedAutoPauseMinutes
  const autoPauseInputValid =
    parsedAutoPauseMinutes === null ||
    (Number.isInteger(parsedAutoPauseMinutes) && parsedAutoPauseMinutes >= 0)
  const autoPauseChanged =
    (settings.autoPauseMinutes ?? null) !== normalizedAutoPauseMinutes

  const errorMessage =
    saveGlobalSettings.error?.message ??
    saveGithubAccount.error?.message ??
    deleteGithubAccount.error?.message ??
    setDefaultGithubAccount.error?.message

  const activeAction =
    activeSection === "github"
      ? {
          disabled: !canAddAccount,
          label: "Add account",
          loading: saveGithubAccount.isPending,
          onPress: () =>
            saveGithubAccount.mutate({
              githubToken: githubToken.trim(),
              githubUsername: githubUsername.trim(),
              name: accountName.trim(),
            }),
        }
      : {
          disabled: !autoPauseInputValid || !autoPauseChanged,
          label: "Save settings",
          loading: saveGlobalSettings.isPending,
          onPress: () =>
            saveGlobalSettings.mutate({
              autoPauseMinutes: normalizedAutoPauseMinutes,
            }),
        }

  return (
    <Modal
      backdrop="blur"
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      placement="top-center"
      size="4xl"
    >
      <ModalContent>
        {(close) => (
          <>
            <ModalHeader>Settings</ModalHeader>
            <ModalBody className="gap-0 px-0 py-0 md:flex-row">
              <aside className="border-default-200 bg-default-50/40 border-b px-3 py-3 md:w-64 md:border-b-0 md:border-r">
                <div className="space-y-2">
                  <button
                    className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                      activeSection === "github"
                        ? "border-default-300 bg-background shadow-sm"
                        : "border-transparent bg-transparent hover:border-default-200 hover:bg-background/70"
                    }`}
                    onClick={() => setActiveSection("github")}
                    type="button"
                  >
                    <div className="flex items-center gap-3">
                      <div className="bg-content2 text-default-700 rounded-lg p-2">
                        <IconBrandGithub size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-default-800">
                          GitHub
                        </p>
                        <p className="text-default-500 text-xs">
                          {settings.githubAccounts.length} account
                          {settings.githubAccounts.length === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>
                  </button>
                  <button
                    className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                      activeSection === "other"
                        ? "border-default-300 bg-background shadow-sm"
                        : "border-transparent bg-transparent hover:border-default-200 hover:bg-background/70"
                    }`}
                    onClick={() => setActiveSection("other")}
                    type="button"
                  >
                    <div className="flex items-center gap-3">
                      <div className="bg-content2 text-default-700 rounded-lg p-2">
                        <IconSettings size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-default-800">
                          Other
                        </p>
                        <p className="text-default-500 text-xs">
                          runtime and behavior
                        </p>
                      </div>
                    </div>
                  </button>
                </div>
              </aside>

              <div className="min-h-[30rem] flex-1 px-6 py-5">
                {activeSection === "github" ? (
                  <div className="space-y-5">
                    <div className="rounded-xl border border-default-200 px-4 py-4">
                      <p className="text-sm font-medium text-default-800">
                        GitHub accounts
                      </p>
                      <p className="text-default-500 mt-1 text-xs">
                        Saved accounts can be selected globally or assigned per worker.
                      </p>
                    </div>

                    <div className="space-y-3">
                      {settings.githubAccounts.length > 0 ? (
                        settings.githubAccounts.map((account) => {
                          const isDefault =
                            settings.defaultGithubAccountId === account.id

                          return (
                            <div
                              className="flex items-center justify-between gap-4 rounded-xl border border-default-200 px-4 py-3"
                              key={account.id}
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-default-800">
                                  {account.name}
                                </p>
                                <p className="text-default-500 text-xs">
                                  @{account.username}
                                  {isDefault ? " · default" : ""}
                                </p>
                              </div>
                              <div className="flex shrink-0 gap-2">
                                <Button
                                  isDisabled={isDefault}
                                  isLoading={
                                    setDefaultGithubAccount.isPending &&
                                    setDefaultGithubAccount.variables?.id === account.id
                                  }
                                  onPress={() =>
                                    setDefaultGithubAccount.mutate({ id: account.id })
                                  }
                                  size="sm"
                                  variant="flat"
                                >
                                  Set default
                                </Button>
                                <Button
                                  color="danger"
                                  isLoading={
                                    deleteGithubAccount.isPending &&
                                    deleteGithubAccount.variables?.id === account.id
                                  }
                                  onPress={() => {
                                    if (
                                      !window.confirm(
                                        `Delete GitHub account "${account.name}"?`,
                                      )
                                    ) {
                                      return
                                    }

                                    deleteGithubAccount.mutate({ id: account.id })
                                  }}
                                  size="sm"
                                  variant="light"
                                >
                                  Delete
                                </Button>
                              </div>
                            </div>
                          )
                        })
                      ) : (
                        <div className="rounded-xl border border-dashed border-default-200 px-4 py-6">
                          <p className="text-default-400 text-sm">
                            No GitHub accounts saved yet.
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="space-y-4 rounded-xl border border-default-200 px-4 py-4">
                      <p className="text-sm font-medium text-default-800">
                        Add account
                      </p>
                      <Input
                        description="A friendly label shown when selecting an account for a worker."
                        label="Account name"
                        onValueChange={setAccountName}
                        placeholder="Work GitHub"
                        value={accountName}
                      />
                      <Input
                        description="Used for GitHub HTTPS authentication inside workers."
                        label="GitHub username"
                        onValueChange={setGithubUsername}
                        placeholder="your-github-handle"
                        value={githubUsername}
                      />
                      <Input
                        description="Stored in the backend secret store and can be selected per worker later."
                        label="GitHub token"
                        onValueChange={setGithubToken}
                        placeholder="ghp_..."
                        type="password"
                        value={githubToken}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div className="rounded-xl border border-default-200 px-4 py-4">
                      <p className="text-sm font-medium text-default-800">
                        Worker behavior
                      </p>
                      <p className="text-default-500 mt-1 text-xs">
                        Configure dashboard-wide runtime defaults.
                      </p>
                    </div>

                    <div className="space-y-4 rounded-xl border border-default-200 px-4 py-4">
                      <p className="text-sm font-medium text-default-800">
                        Worker auto-pause
                      </p>
                      <Input
                        description="Automatically pause running workers after this many minutes. Leave empty or set 0 to disable."
                        endContent={
                          <span className="text-default-400 text-xs">minutes</span>
                        }
                        isInvalid={!autoPauseInputValid}
                        label="Auto-pause after"
                        min={0}
                        onValueChange={setAutoPauseMinutes}
                        placeholder="Disabled"
                        type="number"
                        value={autoPauseMinutes}
                      />
                      <p className="text-default-400 text-xs">
                        Auto-pause is based on worker runtime after start, not keyboard or terminal activity.
                      </p>
                    </div>
                  </div>
                )}

                {errorMessage ? (
                  <p className="text-danger mt-5 text-sm">{errorMessage}</p>
                ) : null}
              </div>
            </ModalBody>
            <ModalFooter className="justify-between">
              <p className="text-default-400 text-xs">
                {activeSection === "github"
                  ? "GitHub tokens stay in the backend secret store and can be assigned per worker."
                  : "Changes here apply to newly running workers across the dashboard."}
              </p>
              <div className="flex gap-2">
                <Button onPress={close} variant="light">
                  Close
                </Button>
                <Button
                  color="primary"
                  isDisabled={activeAction.disabled}
                  isLoading={activeAction.loading}
                  onPress={activeAction.onPress}
                  variant="flat"
                >
                  {activeAction.label}
                </Button>
              </div>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  )
}
