import {
  Button,
  Divider,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
} from "@heroui/react"
import { useMemo, useState, type Key } from "react"
import type { PresetInfo, StartWorkerInput } from "../lib/api-types"

type AddWorkerModalProps = {
  errorMessage?: string
  isOpen: boolean
  isPending: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: StartWorkerInput) => void
  presets: PresetInfo[]
}

function isSensitiveEnv(name: string) {
  return /token|secret|key|password/i.test(name)
}

export function AddWorkerModal({
  errorMessage,
  isOpen,
  isPending,
  onOpenChange,
  onSubmit,
  presets,
}: AddWorkerModalProps) {
  const [title, setTitle] = useState("")
  const [presetName, setPresetName] = useState("")
  const [envValues, setEnvValues] = useState<Record<string, string>>({})

  const effectivePresetName = presetName || presets[0]?.name || ""
  const selectedPreset = useMemo(
    () => presets.find((preset) => preset.name === effectivePresetName),
    [effectivePresetName, presets],
  )

  const missingRequiredField =
    title.trim().length === 0 ||
    (selectedPreset?.requiredEnv.some((key) => (envValues[key] ?? "").trim().length === 0) ??
      true)

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setTitle("")
      setPresetName("")
      setEnvValues({})
    }

    onOpenChange(open)
  }

  return (
    <Modal
      backdrop="blur"
      classNames={{
        backdrop: "bg-background/70",
        base: "border border-white/5 bg-content1/95 text-foreground",
      }}
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      placement="top-center"
      size="2xl"
    >
      <ModalContent>
        {(close) => (
          <>
            <ModalHeader className="flex flex-col gap-1 pb-3">
              <p className="text-xs uppercase tracking-[0.24em] text-default-500">
                Start worker
              </p>
              <p className="text-2xl font-semibold text-foreground">
                Create a new worker from a preset
              </p>
            </ModalHeader>
            <Divider />
            <ModalBody className="gap-5 py-5">
              <Input
                autoFocus
                classNames={{
                  inputWrapper:
                    "bg-transparent shadow-none ring-1 ring-white/10 data-[hover=true]:bg-transparent",
                }}
                isRequired
                label="Worker title"
                onValueChange={setTitle}
                placeholder="Frontend QA, bug triage, release check..."
                value={title}
              />
              <Select
                classNames={{
                  trigger:
                    "bg-transparent shadow-none ring-1 ring-white/10 data-[hover=true]:bg-transparent",
                }}
                disallowEmptySelection
                label="Preset"
                onSelectionChange={(keys) => {
                  const nextKey =
                    keys === "all" ? undefined : (Array.from(keys)[0] as Key | undefined)

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
                <p className="text-sm text-default-400">
                  No presets are currently available from the backend.
                </p>
              ) : null}

              {selectedPreset ? (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-[0.22em] text-default-500">
                      Required environment
                    </p>
                    <p className="text-sm text-default-400">
                      These fields come directly from the selected preset.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {selectedPreset.requiredEnv.map((envKey) => (
                      <Input
                        classNames={{
                          inputWrapper:
                            "bg-transparent shadow-none ring-1 ring-white/10 data-[hover=true]:bg-transparent",
                        }}
                        isRequired
                        key={envKey}
                        label={envKey}
                        onValueChange={(value) =>
                          setEnvValues((currentValues) => ({
                            ...currentValues,
                            [envKey]: value,
                          }))
                        }
                        type={isSensitiveEnv(envKey) ? "password" : "text"}
                        value={envValues[envKey] ?? ""}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {errorMessage ? (
                <p className="text-sm text-danger">{errorMessage}</p>
              ) : null}
            </ModalBody>
            <Divider />
            <ModalFooter className="pt-3">
              <Button onPress={close} variant="light">
                Cancel
              </Button>
              <Button
                color="secondary"
                isDisabled={missingRequiredField}
                isLoading={isPending}
                onPress={() => {
                  if (!selectedPreset) {
                    return
                  }

                  onSubmit({
                    env: envValues,
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
