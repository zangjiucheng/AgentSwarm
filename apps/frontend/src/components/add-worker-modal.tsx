import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  Textarea,
} from "@heroui/react"
import { Fragment, useMemo, useState, type Key } from "react"
import { useNavigate } from "react-router"
import type { PresetInfo } from "../lib/api-types"
import { trpc } from "../trpc"

type AddWorkerModalProps = {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  presets: PresetInfo[]
}

export function AddWorkerModal({
  isOpen,
  onOpenChange,
  presets,
}: AddWorkerModalProps) {
  const navigate = useNavigate()
  const utils = trpc.useUtils()

  const [title, setTitle] = useState("")
  const [presetName, setPresetName] = useState("")
  const [envValues, setEnvValues] = useState<Record<string, string>>({})

  const startWorker = trpc.startWorker.useMutation({
    onSuccess: async ({ port }) => {
      onOpenChange(false)
      await utils.workers.invalidate()
      void navigate(`/${port}`)
    },
  })

  const effectivePresetName = presetName || presets[0]?.name || ""
  const selectedPreset = useMemo(
    () => presets.find((preset) => preset.name === effectivePresetName),
    [effectivePresetName, presets],
  )

  const missingRequiredField =
    title.trim().length === 0 || selectedPreset == null

  const errorMessage = startWorker.error?.message

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setTitle("")
      setPresetName("")
      setEnvValues({})
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
      size="xl"
    >
      <ModalContent>
        {(close) => (
          <>
            <ModalHeader>New Worker</ModalHeader>
            <ModalBody className="gap-5">
              <Input
                autoFocus
                isRequired
                label="Title"
                onValueChange={setTitle}
                placeholder="Frontend QA, bug triage, release check..."
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

              {selectedPreset ? (
                <div className="grid grid-cols-[auto_1fr] items-start gap-x-4 gap-y-4">
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
              ) : null}

              {errorMessage ? (
                <p className="text-danger text-sm">{errorMessage}</p>
              ) : null}
            </ModalBody>
            <ModalFooter className="pt-3">
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
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  )
}
