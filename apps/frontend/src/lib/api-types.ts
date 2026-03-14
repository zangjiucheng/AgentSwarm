export type WorkerPullRequest = {
  baseBranch: string
  branch: string
  link: string
  name: string
  number: string
}

export type WorkerStatus = "working" | "idle" | "waiting" | "error" | "stopped"

export type PresetInfo = {
  imageTag: string
  name: string
  requiredEnv: string[]
}

export type WorkerInfo = {
  durationS: number
  port: number
  pr?: WorkerPullRequest
  preset: string
  status: WorkerStatus
  title: string
}

export type StartWorkerInput = {
  env: Record<string, string>
  preset: string
  title: string
}
