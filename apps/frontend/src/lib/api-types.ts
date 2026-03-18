export type WorkerStatus = "ready" | "error" | "stopped"

export type GlobalSettings = {
  githubUsername: string
  githubTokenConfigured: boolean
}

export type PresetInfo = {
  imageTag: string
  name: string
  requiredEnv: string[]
}

export type WorkerInfo = {
  id: string
  durationS: number
  port: number
  monitorPort: number
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
  cloneRepositoryUrl?: string
  env: Record<string, string>
  preset: string
  title: string
}
