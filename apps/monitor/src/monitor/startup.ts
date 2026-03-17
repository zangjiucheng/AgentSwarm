import {
  CLAUDE_SESSION_NAME,
  MONITOR_FLAG_PATH,
  TERMINAL_SESSION_NAME,
} from "./constants"
import { runTmuxCommand } from "./process"
import { shellEscape, sleep } from "./utils"

let startupPromise: Promise<void> | null = null

async function ensureTmuxSession(sessionName: string) {
  const result = await runTmuxCommand(["new-session", "-d", "-s", sessionName])

  if (
    result.exitCode === 0 ||
    result.stderr.includes("duplicate session") ||
    result.stderr.includes("session already exists")
  ) {
    return
  }

  console.error(
    `[monitor] failed to create tmux session ${sessionName}: ${result.stderr.trim()}`,
  )
}

async function sendKeysToTmuxSession(
  sessionName: string,
  keys: string[],
  errorLabel: string,
) {
  const result = await runTmuxCommand(["send-keys", "-t", sessionName, ...keys])

  if (result.exitCode === 0) {
    return
  }

  console.error(`[monitor] ${errorLabel} failed: ${result.stderr.trim()}`)
}

async function waitForMonitorFlagToDisappear() {
  while (await Bun.file(MONITOR_FLAG_PATH).exists()) {
    console.log(`[monitor] waiting for ${MONITOR_FLAG_PATH} to disappear...`)
    await sleep(1000)
  }
}

async function launchClaudeSession() {
  console.log("[monitor] running setup command in claude session")
    await sendKeysToTmuxSession(
      CLAUDE_SESSION_NAME,
      ["source ~/setup.sh", "Enter"],
      "SETUP_COMMAND",
    )

  const claudePrompt = process.env.CLAUDE_PROMPT
  let claudeCommand = `claude --dangerously-skip-permissions --allow-dangerously-skip-permissions --effort high${claudePrompt ? ` ${shellEscape(claudePrompt)}` : ""}`

  if (process.env.CLAUDE_ONESHOT) {
    claudeCommand = `${claudeCommand} -p | ~/orchestrator.py set-worker-output; ~/orchestrator.py destroy-worker`
  }

  await sendKeysToTmuxSession(
    CLAUDE_SESSION_NAME,
    [claudeCommand, "Enter"],
    "CLAUDE_PROMPT",
  )
}

async function confirmTrustAndSyncTerminalSession() {
  while (true) {
    const result = await runTmuxCommand([
      "capture-pane",
      "-p",
      "-S",
      "0",
      "-t",
      CLAUDE_SESSION_NAME,
    ])

    const paneOutput = result.stdout
    if (paneOutput.includes("Yes, I trust this folder")) {
      await sendKeysToTmuxSession(
        CLAUDE_SESSION_NAME,
        ["Enter"],
        "CLAUDE_PROMPT_CONFIRM",
      )
      break
    }

    if (
      paneOutput.includes("Type something.") ||
      paneOutput.includes("esc to interrupt")
    ) {
      break
    }

    await sleep(500)
  }

  const pathResult = await runTmuxCommand([
    "list-panes",
    "-t",
    CLAUDE_SESSION_NAME,
    "-F",
    "#{pane_current_path}",
  ])

  const fullPath = pathResult.stdout.trim()
  if (!fullPath) {
    return
  }

  await sendKeysToTmuxSession(
    TERMINAL_SESSION_NAME,
    [`cd ${shellEscape(fullPath)}`, "Enter"],
    "TERMINAL_CD",
  )
}

export async function initializeMonitor() {
  if (!startupPromise) {
    startupPromise = (async () => {
      await waitForMonitorFlagToDisappear()
      await Promise.all([
        ensureTmuxSession(CLAUDE_SESSION_NAME),
        ensureTmuxSession(TERMINAL_SESSION_NAME),
      ])
      await launchClaudeSession()
      void confirmTrustAndSyncTerminalSession()
    })()
  }

  return startupPromise
}
