import z from "zod"
import { readFileSync } from "fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const DEFAULT_DRI_NODE = "/dev/dri/renderD128"

const ConfigSchema = z.object({
  drinode: z.string().default(DEFAULT_DRI_NODE),
  presets: z.array(
    z.object({
      name: z.string(),
      imageTag: z.string(),
      presetEnv: z.record(z.string(), z.string()),
      requiredEnv: z.array(z.string()),
    }),
  ),
})

const defaultConfig: z.infer<typeof ConfigSchema> = {
  drinode: DEFAULT_DRI_NODE,
  presets: [
    {
      name: "default",
      imageTag: "agent-worker:latest",
      presetEnv: {},
      requiredEnv: [
        "CODEX_PROMPT",
      ],
    },
  ],
}

// Use a helper to read env vars at runtime — direct process.env.X access
// gets statically replaced by Bun's bundler at build time.
function readEnv(name: string, fallback?: string) {
  return process.env[name] ?? fallback
}

let parsedConfig: z.infer<typeof ConfigSchema> | undefined
const currentDir = dirname(fileURLToPath(import.meta.url))
const configPaths = [
  readEnv("CONFIG_PATH"),
  "./config.json",
  resolve(currentDir, "../config.json"),
].filter((path): path is string => Boolean(path))

let configError: unknown
for (const configPath of configPaths) {
  try {
    const rawConfig = readFileSync(configPath, "utf-8")
    parsedConfig = ConfigSchema.parse(JSON.parse(rawConfig))
    break
  } catch (e) {
    configError = e
  }
}

if (!parsedConfig) {
  console.warn("Failed to read config file, using default config:", configError)
  parsedConfig = defaultConfig
}
const config = parsedConfig

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
  port,
  host,
  isProduction,
  frontendDevServer,
  frontendDist,
  frontendIndexPath,
}
