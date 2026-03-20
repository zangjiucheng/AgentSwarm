export type GithubAccount = {
  id: string
  name: string
  username: string
}

export type SshPublicKey = {
  id: string
  name: string
  publicKey: string
}

export type WorkerStatus = "ready" | "error" | "stopped"

export type GlobalSettings = {
  autoPauseMinutes: number | null
  defaultGithubAccountId: string | null
  githubAccounts: GithubAccount[]
  githubUsername: string
  githubTokenConfigured: boolean
  sshPublicKeys: SshPublicKey[]
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
  sshEnabled: boolean
  sshPort: number
  createdWithVersion: string
  currentAgentSwarmVersion: string
  workerImageTag: string
  createdAt: number
  githubAccountId?: string
  githubAccountName?: string
  githubConfigured: boolean
  githubUsername: string
  preset: string
  status: WorkerStatus
  title: string
  usesDefaultGithubAccount: boolean
}

export type WorkerConnectionInfo = {
  available: boolean
  sshAuthMode: "password" | "publicKey" | "unknown"
  sshPrivateKey: string | null
  sshPassword: string | null
  sshPort: number | null
  sshUser: string | null
  workspaceDir: string | null
}

export type WorkersResponse = {
  workers: WorkerInfo[]
  hierarchy: Record<string, string[]>
}

export type StartWorkerInput = {
  cloneRepositoryUrl?: string
  env: Record<string, string>
  enableSsh?: boolean
  githubAccountId?: string
  preset: string
  title: string
}
