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
        "GITHUB_TOKEN",
        "OPENAI_API_KEY",
        "CODEX_PROMPT",
      ],
    },
  ],
}

let config: z.infer<typeof ConfigSchema>
try {
  const rawConfig = readFileSync("./config.json", "utf-8")
  config = ConfigSchema.parse(JSON.parse(rawConfig))
} catch (e) {
  console.warn("Failed to read config.json, using default config:", e)
  config = defaultConfig
}

// Use a helper to read env vars at runtime — direct process.env.X access
// gets statically replaced by Bun's bundler at build time.
function readEnv(name: string, fallback?: string) {
  return process.env[name] ?? fallback
}

const port = Number(readEnv("PORT", "3000"))
const host = readEnv("HOST", "0.0.0.0")!
const nodeEnv = readEnv("NODE_ENV", "development")
const isProduction = nodeEnv === "production"
const frontendDevServer = readEnv(
  "FRONTEND_DEV_SERVER",
  "http://127.0.0.1:4100",
)!

const currentDir = dirname(fileURLToPath(import.meta.url))
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
