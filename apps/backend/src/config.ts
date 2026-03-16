import z from "zod"
import { readFileSync } from "fs"

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
      imageTag: "pegasis0/claude-worker:latest",
      presetEnv: {},
      requiredEnv: [
        "DISCORD_USER_ID",
        "DISCORD_WEBHOOK_URL",
        "GITHUB_TOKEN",
        "CLAUDE_CODE_OAUTH_TOKEN",
        "CLAUDE_PROMPT",
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

export { config }
