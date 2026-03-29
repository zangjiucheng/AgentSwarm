import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import z from "zod"

const GithubAccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  token: z.string(),
  username: z.string(),
})

const SshPublicKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  publicKey: z.string(),
})

const SecretStoreSchema = z.object({
  autoPauseMinutes: z.number().int().nonnegative().nullable().default(null),
  defaultGithubAccountId: z.string().default(""),
  githubAccounts: z.array(GithubAccountSchema).default([]),
  githubToken: z.string().default(""),
  githubUsername: z.string().default(""),
  sshPublicKeys: z.array(SshPublicKeySchema).default([]),
  workerGithubAccountIds: z.record(z.string(), z.string()).default({}),
  workerTitles: z.record(z.string(), z.string()).default({}),
})

type GithubAccount = z.infer<typeof GithubAccountSchema>
type SshPublicKey = z.infer<typeof SshPublicKeySchema>
type SecretStore = z.infer<typeof SecretStoreSchema>

export type GithubAccountPublic = Omit<GithubAccount, "token">
export type SshPublicKeyPublic = SshPublicKey

const SSH_PUBLIC_KEY_PATTERN =
  /^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(?:256|384|521)|sk-ssh-ed25519@openssh\.com|sk-ecdsa-sha2-nistp256@openssh\.com)\s+[A-Za-z0-9+/]+={0,3}(?:\s+.+)?$/

function readEnv(name: string, fallback?: string) {
  return process.env[name] ?? fallback
}

const currentDir = dirname(fileURLToPath(import.meta.url))
const secretStorePath =
  readEnv("SECRET_STORE_PATH") ??
  resolve(process.cwd(), "data/secrets.json") ??
  resolve(currentDir, "../data/secrets.json")

let secretStore: SecretStore = loadSecretStore()

function toPublicGithubAccount(account: GithubAccount): GithubAccountPublic {
  return {
    id: account.id,
    name: account.name,
    username: account.username,
  }
}

function normalizeSshPublicKeyValue(publicKey: string) {
  return publicKey
    .trim()
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
}

function assertValidSshPublicKey(publicKey: string) {
  const normalized = normalizeSshPublicKeyValue(publicKey)
  const lines = normalized.split("\n")

  if (lines.length === 0) {
    throw new Error("SSH public key cannot be empty")
  }

  for (const line of lines) {
    if (!SSH_PUBLIC_KEY_PATTERN.test(line)) {
      throw new Error("SSH public key format is invalid")
    }
  }

  return normalized
}

function normalizeSecretStore(store: SecretStore): SecretStore {
  const githubAccounts = [...store.githubAccounts]
  const seenIds = new Set(githubAccounts.map((account) => account.id))
  const autoPauseMinutes =
    store.autoPauseMinutes == null || store.autoPauseMinutes <= 0
      ? null
      : store.autoPauseMinutes

  if (githubAccounts.length === 0 && store.githubToken.trim().length > 0) {
    const legacyId = "legacy-default"
    githubAccounts.push({
      id: legacyId,
      name: store.githubUsername.trim() || "Default GitHub account",
      token: store.githubToken,
      username: store.githubUsername.trim(),
    })
    seenIds.add(legacyId)
  }

  const filteredWorkerGithubAccountIds = Object.fromEntries(
    Object.entries(store.workerGithubAccountIds).filter(([, accountId]) =>
      seenIds.has(accountId),
    ),
  )

  const defaultGithubAccountId = seenIds.has(store.defaultGithubAccountId)
    ? store.defaultGithubAccountId
    : githubAccounts[0]?.id ?? ""

  return {
    autoPauseMinutes,
    defaultGithubAccountId,
    githubAccounts,
    githubToken: "",
    githubUsername: "",
    sshPublicKeys: store.sshPublicKeys.map((key) => ({
      id: key.id,
      name: key.name.trim(),
      publicKey: normalizeSshPublicKeyValue(key.publicKey),
    })),
    workerGithubAccountIds: filteredWorkerGithubAccountIds,
    workerTitles: Object.fromEntries(
      Object.entries(store.workerTitles).map(([workerId, title]) => [
        workerId,
        title.trim(),
      ]),
    ),
  }
}

function loadSecretStore() {
  try {
    if (!existsSync(secretStorePath)) {
      return SecretStoreSchema.parse({})
    }

    const parsed = SecretStoreSchema.parse(
      JSON.parse(readFileSync(secretStorePath, "utf-8")),
    )

    return normalizeSecretStore(parsed)
  } catch (error) {
    console.warn("Failed to read secret store, using defaults:", error)
    return SecretStoreSchema.parse({})
  }
}

function persistSecretStore(nextSecretStore: SecretStore) {
  mkdirSync(dirname(secretStorePath), { recursive: true })
  writeFileSync(secretStorePath, `${JSON.stringify(nextSecretStore, null, 2)}\n`)
  secretStore = nextSecretStore
}

function getGithubAccountById(accountId?: string) {
  if (!accountId) {
    return undefined
  }

  return secretStore.githubAccounts.find((account) => account.id === accountId)
}

export function getGithubAccountCredentials(accountId?: string) {
  const account = getGithubAccountById(accountId)

  if (!account) {
    return undefined
  }

  return account
}

function getDefaultGithubAccount() {
  return getGithubAccountById(secretStore.defaultGithubAccountId)
}

export function getStoredGithubAccountIdForWorker(workerId: string) {
  return secretStore.workerGithubAccountIds[workerId]
}

export function getStoredWorkerTitle(workerId: string) {
  return secretStore.workerTitles[workerId]
}

export function getEffectiveGithubAccountForWorker(workerId: string) {
  const explicitAccountId = getStoredGithubAccountIdForWorker(workerId)
  const explicitAccount = getGithubAccountById(explicitAccountId)
  const defaultAccount = getDefaultGithubAccount()
  const account = explicitAccount ?? defaultAccount

  return {
    account,
    accountId: account?.id,
    githubConfigured: Boolean(account),
    githubUsername: account?.username ?? "",
    usesDefaultGithubAccount: explicitAccount === undefined,
  }
}

export function getGlobalSettings() {
  const defaultAccount = getDefaultGithubAccount()

  return {
    autoPauseMinutes: secretStore.autoPauseMinutes,
    defaultGithubAccountId: defaultAccount?.id ?? null,
    githubAccounts: secretStore.githubAccounts.map(toPublicGithubAccount),
    githubTokenConfigured: secretStore.githubAccounts.length > 0,
    githubUsername: defaultAccount?.username ?? "",
    sshPublicKeys: secretStore.sshPublicKeys,
  }
}

export function saveGithubAccount(input: {
  id?: string
  name: string
  token: string
  username: string
}) {
  const id = input.id?.trim() || randomUUID()
  const nextAccount: GithubAccount = {
    id,
    name: input.name.trim() || input.username.trim(),
    token: input.token.trim(),
    username: input.username.trim(),
  }

  const existingIndex = secretStore.githubAccounts.findIndex(
    (account) => account.id === id,
  )
  const nextGithubAccounts =
    existingIndex >= 0
      ? secretStore.githubAccounts.map((account, index) =>
          index === existingIndex ? nextAccount : account,
        )
      : [...secretStore.githubAccounts, nextAccount]

  const nextSecretStore = normalizeSecretStore({
    ...secretStore,
    defaultGithubAccountId:
      secretStore.defaultGithubAccountId || nextAccount.id,
    githubAccounts: nextGithubAccounts,
  })

  persistSecretStore(nextSecretStore)
  return getGlobalSettings()
}

export function saveGlobalSettings(input: {
  autoPauseMinutes?: number | null
  githubUsername?: string
  githubToken?: string
  clearGithubToken?: boolean
}) {
  const nextSecretStore = normalizeSecretStore({
    ...secretStore,
    autoPauseMinutes:
      input.autoPauseMinutes === undefined ? secretStore.autoPauseMinutes : input.autoPauseMinutes,
  })
  persistSecretStore(nextSecretStore)

  const defaultAccount = getDefaultGithubAccount()
  const githubUsername = input.githubUsername?.trim() ?? ""

  if (input.clearGithubToken) {
    if (defaultAccount) {
      return deleteGithubAccount(defaultAccount.id)
    }

    return getGlobalSettings()
  }

  if (input.githubToken?.trim()) {
    return saveGithubAccount({
      id: defaultAccount?.id,
      name:
        defaultAccount?.name ||
        githubUsername ||
        "Default GitHub account",
      token: input.githubToken,
      username: githubUsername,
    })
  }

  if (defaultAccount && githubUsername) {
    return saveGithubAccount({
      id: defaultAccount.id,
      name: defaultAccount.name,
      token: defaultAccount.token,
      username: githubUsername,
    })
  }

  return getGlobalSettings()
}

export function getAutoPauseMinutes() {
  return secretStore.autoPauseMinutes
}

export function saveSshPublicKey(input: {
  id?: string
  name: string
  publicKey: string
}) {
  const id = input.id?.trim() || randomUUID()
  const nextKey: SshPublicKey = {
    id,
    name: input.name.trim() || "SSH key",
    publicKey: assertValidSshPublicKey(input.publicKey),
  }

  const existingIndex = secretStore.sshPublicKeys.findIndex((key) => key.id === id)
  const nextSshPublicKeys =
    existingIndex >= 0
      ? secretStore.sshPublicKeys.map((key, index) =>
          index === existingIndex ? nextKey : key,
        )
      : [...secretStore.sshPublicKeys, nextKey]

  persistSecretStore(
    normalizeSecretStore({
      ...secretStore,
      sshPublicKeys: nextSshPublicKeys,
    }),
  )

  return getGlobalSettings()
}

export function deleteSshPublicKey(id: string) {
  persistSecretStore(
    normalizeSecretStore({
      ...secretStore,
      sshPublicKeys: secretStore.sshPublicKeys.filter((key) => key.id !== id),
    }),
  )

  return getGlobalSettings()
}

export function deleteGithubAccount(accountId: string) {
  const nextSecretStore = normalizeSecretStore({
    ...secretStore,
    defaultGithubAccountId:
      secretStore.defaultGithubAccountId === accountId
        ? ""
        : secretStore.defaultGithubAccountId,
    githubAccounts: secretStore.githubAccounts.filter(
      (account) => account.id !== accountId,
    ),
  })

  persistSecretStore(nextSecretStore)
  return getGlobalSettings()
}

export function setDefaultGithubAccount(accountId: string) {
  if (!getGithubAccountById(accountId)) {
    throw new Error(`Unknown GitHub account: ${accountId}`)
  }

  const nextSecretStore = normalizeSecretStore({
    ...secretStore,
    defaultGithubAccountId: accountId,
  })

  persistSecretStore(nextSecretStore)
  return getGlobalSettings()
}

export function assignWorkerGithubAccount(input: {
  accountId?: string
  workerId: string
}) {
  if (input.accountId && !getGithubAccountById(input.accountId)) {
    throw new Error(`Unknown GitHub account: ${input.accountId}`)
  }

  const workerGithubAccountIds = { ...secretStore.workerGithubAccountIds }

  if (input.accountId) {
    workerGithubAccountIds[input.workerId] = input.accountId
  } else {
    delete workerGithubAccountIds[input.workerId]
  }

  const nextSecretStore = normalizeSecretStore({
    ...secretStore,
    workerGithubAccountIds,
  })

  persistSecretStore(nextSecretStore)
  return getEffectiveGithubAccountForWorker(input.workerId)
}

export function transferWorkerGithubAccount(oldWorkerId: string, newWorkerId: string) {
  const nextSecretStore = {
    ...secretStore,
    workerGithubAccountIds: { ...secretStore.workerGithubAccountIds },
  }
  const accountId = nextSecretStore.workerGithubAccountIds[oldWorkerId]

  if (accountId) {
    nextSecretStore.workerGithubAccountIds[newWorkerId] = accountId
  }

  delete nextSecretStore.workerGithubAccountIds[oldWorkerId]
  persistSecretStore(normalizeSecretStore(nextSecretStore))
}

export function setStoredWorkerTitle(workerId: string, title: string) {
  const nextSecretStore = {
    ...secretStore,
    workerTitles: {
      ...secretStore.workerTitles,
      [workerId]: title.trim(),
    },
  }

  persistSecretStore(normalizeSecretStore(nextSecretStore))
}

export function transferWorkerTitle(oldWorkerId: string, newWorkerId: string) {
  const nextSecretStore = {
    ...secretStore,
    workerTitles: { ...secretStore.workerTitles },
  }
  const title = nextSecretStore.workerTitles[oldWorkerId]

  if (title) {
    nextSecretStore.workerTitles[newWorkerId] = title
  }

  delete nextSecretStore.workerTitles[oldWorkerId]
  persistSecretStore(normalizeSecretStore(nextSecretStore))
}

export function clearStoredWorkerTitle(workerId: string) {
  if (!secretStore.workerTitles[workerId]) {
    return
  }

  const nextSecretStore = {
    ...secretStore,
    workerTitles: { ...secretStore.workerTitles },
  }

  delete nextSecretStore.workerTitles[workerId]
  persistSecretStore(normalizeSecretStore(nextSecretStore))
}

export function clearWorkerGithubAccount(workerId: string) {
  if (!secretStore.workerGithubAccountIds[workerId]) {
    return
  }

  const nextSecretStore = {
    ...secretStore,
    workerGithubAccountIds: { ...secretStore.workerGithubAccountIds },
  }

  delete nextSecretStore.workerGithubAccountIds[workerId]
  persistSecretStore(normalizeSecretStore(nextSecretStore))
}

export function getWorkerSecretEnv(options?: {
  accountId?: string
  workerId?: string
}) {
  const env: Record<string, string> = {}

  if (process.env.OPENAI_API_KEY) {
    env.OPENAI_API_KEY = process.env.OPENAI_API_KEY
  }

  const account =
    getGithubAccountById(options?.accountId) ??
    (options?.workerId
      ? getEffectiveGithubAccountForWorker(options.workerId).account
      : getDefaultGithubAccount())

  if (account?.token) {
    env.GITHUB_TOKEN = account.token
  }

  if (account?.username) {
    env.GITHUB_USERNAME = account.username
  }

  if (secretStore.sshPublicKeys.length > 0) {
    env.WORKER_SSH_AUTHORIZED_KEYS = secretStore.sshPublicKeys
      .map((key) => key.publicKey)
      .join("\n")
  }

  return env
}
