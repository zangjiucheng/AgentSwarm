import {
  AGENT_SESSION_NAME,
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

function getPrompt() {
  return process.env.CODEX_PROMPT
}

function getOneShotEnabled() {
  return Boolean(process.env.CODEX_ONESHOT)
}

function buildAgentCommand() {
  const prompt = getPrompt()
  const promptArg = prompt ? ` ${shellEscape(prompt)}` : ""
  const loginCommand =
    'if [ -n "${OPENAI_API_KEY:-}" ]; then printenv OPENAI_API_KEY | codex login --with-api-key >/tmp/codex-login.log 2>&1 || { cat /tmp/codex-login.log; exit 1; }; fi'

  if (getOneShotEnabled()) {
    return `${loginCommand}; codex --search exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox -o /tmp/codex-output.txt${promptArg}; status=$?; if [ -f /tmp/codex-output.txt ]; then cat /tmp/codex-output.txt | ~/orchestrator.py set-worker-output; fi; ~/orchestrator.py destroy-worker; exit $status`
  }

  return `${loginCommand}; exec codex --dangerously-bypass-approvals-and-sandbox --search${promptArg}`
}

async function launchAgentSession() {
  console.log("[monitor] running setup command in agent session")
  await sendKeysToTmuxSession(
    AGENT_SESSION_NAME,
    ["source ~/setup.sh", "Enter"],
    "SETUP_COMMAND",
  )

  await sendKeysToTmuxSession(
    AGENT_SESSION_NAME,
    [buildAgentCommand(), "Enter"],
    "AGENT_START",
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
      AGENT_SESSION_NAME,
    ])

    const paneOutput = result.stdout
    if (paneOutput.includes("Yes, I trust this folder")) {
      await sendKeysToTmuxSession(
        AGENT_SESSION_NAME,
        ["Enter"],
        "AGENT_PROMPT_CONFIRM",
      )
      break
    }

    if (
      paneOutput.includes("Type something.") ||
      paneOutput.includes("esc to interrupt") ||
      paneOutput.includes("OpenAI Codex")
    ) {
      break
    }

    await sleep(500)
  }

  const pathResult = await runTmuxCommand([
    "list-panes",
    "-t",
    AGENT_SESSION_NAME,
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
        ensureTmuxSession(AGENT_SESSION_NAME),
        ensureTmuxSession(TERMINAL_SESSION_NAME),
      ])
      await launchAgentSession()
      void confirmTrustAndSyncTerminalSession()
    })()
  }

  return startupPromise
}
