import { readFileSync, writeFileSync } from "fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import z from "zod"

const PresetSchema = z.object({
  name: z.string(),
  imageTag: z.string(),
  presetEnv: z.record(z.string(), z.string()),
  requiredEnv: z.array(z.string()),
})

const ConfigSchema = z
  .object({
    globalEnv: z.record(z.string(), z.string()).default({}),
    presets: z.array(PresetSchema),
  })
  .passthrough()

type AppConfig = {
  globalEnv: Record<string, string>
  presets: z.infer<typeof PresetSchema>[]
}

const defaultConfig: AppConfig = {
  globalEnv: {},
  presets: [
    {
      name: "default",
      imageTag: "agent-worker:latest",
      presetEnv: {},
      requiredEnv: [],
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
    globalEnv: parsed.globalEnv,
    presets: parsed.presets,
  } satisfies AppConfig
}

const currentDir = dirname(fileURLToPath(import.meta.url))
const configPaths = [
  readEnv("CONFIG_PATH"),
  "./config.json",
  resolve(currentDir, "../config.json"),
].filter((path): path is string => Boolean(path))

let configFilePath = readEnv("CONFIG_PATH") ?? resolve(currentDir, "../config.json")
let rawConfigObject: Record<string, unknown> = {}
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
    rawConfigObject = rawConfig
    configFilePath = configPath
    configLoaded = true
    configError = undefined
    break
  } catch (error) {
    configError = error
  }
}

if (!configLoaded) {
  console.warn("Failed to read config file, using default config:", configError)
  rawConfigObject = { ...defaultConfig }
}

function persistConfig(nextConfig: AppConfig) {
  const nextRawConfig: Record<string, unknown> = {
    ...rawConfigObject,
    globalEnv: nextConfig.globalEnv,
    presets: nextConfig.presets,
  }

  writeFileSync(configFilePath, `${JSON.stringify(nextRawConfig, null, 2)}\n`)

  rawConfigObject = nextRawConfig
  config = nextConfig
}

function setGlobalEnv(globalEnv: Record<string, string>) {
  persistConfig({
    ...config,
    globalEnv,
  })
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

export {
  config,
  setGlobalEnv,
  port,
  host,
  isProduction,
  frontendDevServer,
  frontendDist,
  frontendIndexPath,
}
