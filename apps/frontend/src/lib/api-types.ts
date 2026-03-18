export type WorkerStatus = "ready" | "error" | "stopped"

export type PresetInfo = {
  imageTag: string
  name: string
  requiredEnv: string[]
}

export type WorkerInfo = {
  id: string
  durationS: number
  port: number
  createdAt: number
  preset: string
  status: WorkerStatus
  title: string
}

export type WorkersResponse = {
  workers: WorkerInfo[]
  hierarchy: Record<string, string[]>
}

export type StartWorkerInput = {
  env: Record<string, string>
  preset: string
  title: string
}
