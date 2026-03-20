import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/react"
import { useEffect, useMemo, useState } from "react"
import type { GlobalSettings } from "../lib/api-types"
import { trpc } from "../trpc"

type GlobalSettingsModalProps = {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  settings: GlobalSettings
}

export function GlobalSettingsModal({
  isOpen,
  onOpenChange,
  settings,
}: GlobalSettingsModalProps) {
  const utils = trpc.useUtils()
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

  return (
    <Modal
      backdrop="blur"
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      placement="top-center"
      size="2xl"
    >
      <ModalContent>
        {(close) => (
          <>
            <ModalHeader>GitHub Accounts</ModalHeader>
            <ModalBody className="gap-5">
              <div className="space-y-4 rounded-lg border border-default-200 px-4 py-4">
                <p className="text-sm font-medium text-default-700">
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
              </div>

              <div className="space-y-3">
                {settings.githubAccounts.length > 0 ? (
                  settings.githubAccounts.map((account) => {
                    const isDefault =
                      settings.defaultGithubAccountId === account.id

                    return (
                      <div
                        className="flex items-center justify-between gap-4 rounded-lg border border-default-200 px-4 py-3"
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
                  <p className="text-default-400 text-sm">
                    No GitHub accounts saved yet.
                  </p>
                )}
              </div>

              <div className="space-y-4 rounded-lg border border-default-200 px-4 py-4">
                <p className="text-sm font-medium text-default-700">
                  Add account
                </p>
                <Input
                  description="A friendly label shown when selecting an account for a worker."
                  label="Account Name"
                  onValueChange={setAccountName}
                  placeholder="Work GitHub"
                  value={accountName}
                />
                <Input
                  description="Used for GitHub HTTPS authentication inside workers."
                  label="GitHub Username"
                  onValueChange={setGithubUsername}
                  placeholder="your-github-handle"
                  value={githubUsername}
                />
                <Input
                  description="Stored in the backend secret store and can be selected per worker later."
                  label="GitHub Token"
                  onValueChange={setGithubToken}
                  placeholder="ghp_..."
                  type="password"
                  value={githubToken}
                />
              </div>

              {errorMessage ? (
                <p className="text-danger text-sm">{errorMessage}</p>
              ) : null}
            </ModalBody>
            <ModalFooter className="justify-between">
              <p className="text-default-400 text-xs">
                Auto-pause is based on worker runtime after start, not keyboard or terminal activity.
              </p>
              <div className="flex gap-2">
                <Button onPress={close} variant="light">
                  Close
                </Button>
                <Button
                  color="primary"
                  isDisabled={!autoPauseInputValid || !autoPauseChanged}
                  isLoading={saveGlobalSettings.isPending}
                  onPress={() =>
                    saveGlobalSettings.mutate({
                      autoPauseMinutes: normalizedAutoPauseMinutes,
                    })
                  }
                  variant="flat"
                >
                  Save settings
                </Button>
                <Button
                  color="primary"
                  isDisabled={!canAddAccount}
                  isLoading={saveGithubAccount.isPending}
                  onPress={() =>
                    saveGithubAccount.mutate({
                      githubToken: githubToken.trim(),
                      githubUsername: githubUsername.trim(),
                      name: accountName.trim(),
                    })
                  }
                  variant="flat"
                >
                  Add account
                </Button>
              </div>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  )
}
