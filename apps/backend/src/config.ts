import { readFileSync } from "fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import z from "zod"

const PresetSchema = z.object({
  name: z.string(),
  imageTag: z.string(),
  presetEnv: z.record(z.string(), z.string()),
  requiredEnv: z.array(z.string()),
  privileged: z.boolean().optional(),
})

const ConfigSchema = z
  .object({
    presets: z.array(PresetSchema),
  })
  .passthrough()

type AppConfig = {
  presets: z.infer<typeof PresetSchema>[]
}

const defaultConfig: AppConfig = {
  presets: [
    {
      name: "default",
      imageTag: "agent-worker:latest",
      presetEnv: {
        GIT_AUTHOR_NAME: "Agent Swarm",
        GIT_AUTHOR_EMAIL: "agentswarm@local",
        GIT_COMMITTER_NAME: "Agent Swarm",
        GIT_COMMITTER_EMAIL: "agentswarm@local",
      },
      requiredEnv: [],
    },
    {
      name: "frontend",
      imageTag: "agent-worker:latest",
      presetEnv: {
        GIT_AUTHOR_NAME: "Agent Swarm Frontend",
        GIT_AUTHOR_EMAIL: "frontend@agentswarm.local",
        GIT_COMMITTER_NAME: "Agent Swarm Frontend",
        GIT_COMMITTER_EMAIL: "frontend@agentswarm.local",
        NODE_ENV: "development",
        BROWSER: "none",
      },
      requiredEnv: [],
    },
    {
      name: "fullstack",
      imageTag: "agent-worker:latest",
      presetEnv: {
        GIT_AUTHOR_NAME: "Agent Swarm Fullstack",
        GIT_AUTHOR_EMAIL: "fullstack@agentswarm.local",
        GIT_COMMITTER_NAME: "Agent Swarm Fullstack",
        GIT_COMMITTER_EMAIL: "fullstack@agentswarm.local",
        NODE_ENV: "development",
      },
      requiredEnv: [],
    },
    {
      name: "oss-contrib",
      imageTag: "agent-worker:latest",
      presetEnv: {
        GIT_AUTHOR_NAME: "Agent Swarm OSS",
        GIT_AUTHOR_EMAIL: "oss@agentswarm.local",
        GIT_COMMITTER_NAME: "Agent Swarm OSS",
        GIT_COMMITTER_EMAIL: "oss@agentswarm.local",
        GH_PROMPT_DISABLED: "1",
      },
      requiredEnv: [],
    },
    {
      name: "ai-agent",
      imageTag: "agent-worker:latest",
      presetEnv: {
        GIT_AUTHOR_NAME: "Agent Swarm AI Agent",
        GIT_AUTHOR_EMAIL: "ai@agentswarm.local",
        GIT_COMMITTER_NAME: "Agent Swarm AI Agent",
        GIT_COMMITTER_EMAIL: "ai@agentswarm.local",
        NODE_ENV: "development",
      },
      requiredEnv: ["OPENAI_API_KEY"],
    },
  ],
}

// Use a helper to read env vars at runtime — direct process.env.X access
// gets statically replaced by Bun's bundler at build time.
function readEnv(name: string, fallback?: string) {
  return process.env[name] ?? fallback
}

function toAppConfig(rawConfig: unknown) {
  const parsed = ConfigSchema.parse(rawConfig)
  return {
    presets: parsed.presets,
  } satisfies AppConfig
}

const currentDir = dirname(fileURLToPath(import.meta.url))
const configPaths = [
  readEnv("CONFIG_PATH"),
  "./config.json",
  resolve(currentDir, "../config.json"),
].filter((path): path is string => Boolean(path))

let config: AppConfig = defaultConfig
let configLoaded = false
let configError: unknown

for (const configPath of configPaths) {
  try {
    const rawConfig = JSON.parse(readFileSync(configPath, "utf-8")) as Record<
      string,
      unknown
    >
    config = toAppConfig(rawConfig)
    configLoaded = true
    configError = undefined
    break
  } catch (error) {
    configError = error
  }
}

if (!configLoaded) {
  console.warn("Failed to read config file, using default config:", configError)
}

const port = Number(readEnv("PORT", "3000"))
const host = readEnv("HOST", "0.0.0.0")!
const nodeEnv = readEnv("NODE_ENV", "development")
const isProduction = nodeEnv === "production"
const frontendDevServer = readEnv(
  "FRONTEND_DEV_SERVER",
  "http://127.0.0.1:4100",
)!
const frontendDist =
  readEnv("FRONTEND_DIST") ?? resolve(currentDir, "../../frontend/dist")
const frontendIndexPath = resolve(frontendDist, "index.html")
const adminToken = readEnv("AGENTSWARM_ADMIN_TOKEN", "").trim()

export {
  config,
  port,
  host,
  isProduction,
  frontendDevServer,
  frontendDist,
  frontendIndexPath,
  adminToken,
}
