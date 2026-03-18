import {
  AGENT_COMMANDS,
  AGENT_SESSION_NAME,
  IDLE_COMMANDS,
  PR_TTL_MS,
} from "./constants"
import { runCommand, runTmuxCommand } from "./process"
import {
  type MonitorInfo,
  type MonitorPullRequest,
  type MonitorStatus,
} from "./schema"

const prCache: {
  pr: MonitorPullRequest | undefined
  lastPath: string
  lastStatus: MonitorStatus | null
  lastFetchedAt: number
} = {
  pr: undefined,
  lastPath: "",
  lastStatus: null,
  lastFetchedAt: 0,
}

async function fetchPullRequest(fullPath: string) {
  try {
    const result = await runCommand(
      [
        "gh",
        "pr",
        "view",
        "--json",
        "number,url,title,headRefName,baseRefName",
      ],
      fullPath,
    )

    if (result.exitCode !== 0) {
      return undefined
    }

    const pullRequest = JSON.parse(result.stdout) as {
      baseRefName: string
      headRefName: string
      number: number
      title: string
      url: string
    }

    return {
      baseBranch: pullRequest.baseRefName,
      branch: pullRequest.headRefName,
      link: pullRequest.url,
      name: pullRequest.title,
      number: String(pullRequest.number),
    } satisfies MonitorPullRequest
  } catch {
    return undefined
  }
}

async function readAgentPaneState() {
  const [commandResult, pathResult] = await Promise.all([
    runTmuxCommand([
      "list-panes",
      "-t",
      AGENT_SESSION_NAME,
      "-F",
      "#{pane_current_command}",
    ]),
    runTmuxCommand([
      "list-panes",
      "-t",
      AGENT_SESSION_NAME,
      "-F",
      "#{pane_current_path}",
    ]),
  ])

  return {
    currentCommand: commandResult.stdout.trim(),
    fullPath: pathResult.stdout.trim(),
  }
}

function resetPullRequestCache(status: MonitorStatus, fullPath: string) {
  prCache.pr = undefined
  prCache.lastFetchedAt = 0
  prCache.lastPath = fullPath
  prCache.lastStatus = status
}

function shouldRefreshPullRequest(status: MonitorStatus, fullPath: string) {
  const now = Date.now()
  const pathChanged = fullPath !== prCache.lastPath
  const statusChanged = status !== prCache.lastStatus
  const ttlExpired = now - prCache.lastFetchedAt > PR_TTL_MS

  return {
    now,
    shouldRefresh: pathChanged || statusChanged || ttlExpired,
  }
}

export async function getMonitorStatus(): Promise<MonitorInfo> {
  try {
    const { currentCommand, fullPath } = await readAgentPaneState()

    if (!currentCommand || IDLE_COMMANDS.has(currentCommand)) {
      resetPullRequestCache("idle", fullPath)

      return {
        status: "idle",
      }
    }

    let status: MonitorStatus

    if (AGENT_COMMANDS.has(currentCommand)) {
      const paneResult = await runTmuxCommand([
        "capture-pane",
        "-p",
        "-S",
        "0",
        "-t",
        AGENT_SESSION_NAME,
      ])

      if (
        paneResult.stdout.includes("esc to interrupt") ||
        paneResult.stdout.includes("(running)") ||
        paneResult.stdout.includes("Running") ||
        paneResult.stdout.includes("Esc to interrupt")
      ) {
        status = "working"
      } else if (
        paneResult.stdout.includes("Type something.") ||
        paneResult.stdout.includes("OpenAI Codex") ||
        paneResult.stdout.includes("Press Enter to submit")
      ) {
        status = "waiting"
      } else {
        status = "idle"
      }
    } else {
      status = "working"
    }

    if (fullPath) {
      const refreshState = shouldRefreshPullRequest(status, fullPath)
      if (refreshState.shouldRefresh) {
        prCache.pr = await fetchPullRequest(fullPath)
        prCache.lastFetchedAt = refreshState.now
        prCache.lastPath = fullPath
        prCache.lastStatus = status
      }
    } else {
      resetPullRequestCache(status, "")
    }

    return {
      pr: prCache.pr,
      status,
    }
  } catch (error) {
    console.error("[monitor] failed to read monitor status", error)

    return {
      status: "idle",
    }
  }
}
