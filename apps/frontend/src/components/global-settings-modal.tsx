import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/react"
import { useMemo, useState } from "react"
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
  const [githubUsernameDraft, setGithubUsernameDraft] = useState<string | null>(
    null,
  )
  const [githubToken, setGithubToken] = useState("")

  const githubUsername = githubUsernameDraft ?? settings.githubUsername

  const saveGlobalSettings = trpc.saveGlobalSettings.useMutation({
    onSuccess: async () => {
      setGithubUsernameDraft(null)
      setGithubToken("")
      await utils.globalSettings.invalidate()
      onOpenChange(false)
    },
  })

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setGithubUsernameDraft(null)
      setGithubToken("")
      saveGlobalSettings.reset()
    }

    onOpenChange(open)
  }

  const hasChanges = useMemo(() => {
    return (
      githubUsername.trim() !== settings.githubUsername ||
      githubToken.trim().length > 0
    )
  }, [githubToken, githubUsername, settings.githubUsername])

  return (
    <Modal
      backdrop="blur"
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      placement="top-center"
      size="lg"
    >
      <ModalContent>
        {(close) => (
          <>
            <ModalHeader>Global Settings</ModalHeader>
            <ModalBody className="gap-4">
              <Input
                description="Used for GitHub HTTPS authentication when cloning repos with a personal access token."
                label="GitHub Username"
                onValueChange={setGithubUsernameDraft}
                placeholder="your-github-handle"
                value={githubUsername}
              />

              <Input
                description="Applied to newly created workers and stored in backend config."
                label="GitHub Token"
                onValueChange={setGithubToken}
                placeholder={
                  settings.githubTokenConfigured
                    ? "A token is already configured. Enter a new one to replace it."
                    : "ghp_..."
                }
                type="password"
                value={githubToken}
              />

              <p className="text-default-400 text-sm">
                Current status:{" "}
                {settings.githubTokenConfigured ? "token configured" : "token not configured"}
              </p>

              {saveGlobalSettings.error ? (
                <p className="text-danger text-sm">
                  {saveGlobalSettings.error.message}
                </p>
              ) : null}
            </ModalBody>
            <ModalFooter className="justify-between">
              <Button
                color="danger"
                isDisabled={!settings.githubTokenConfigured}
                isLoading={saveGlobalSettings.isPending}
                onPress={() =>
                  saveGlobalSettings.mutate({
                    clearGithubToken: true,
                    githubUsername: githubUsername.trim(),
                  })
                }
                variant="light"
              >
                Clear token
              </Button>
              <div className="flex gap-2">
                <Button onPress={close} variant="light">
                  Cancel
                </Button>
                <Button
                  color="primary"
                  isDisabled={!hasChanges}
                  isLoading={saveGlobalSettings.isPending}
                  onPress={() =>
                    saveGlobalSettings.mutate({
                      ...(githubToken.trim()
                        ? { githubToken: githubToken.trim() }
                        : {}),
                      githubUsername: githubUsername.trim(),
                    })
                  }
                  variant="flat"
                >
                  Save
                </Button>
              </div>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  )
}
