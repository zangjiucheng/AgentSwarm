import { listWorkers } from "./list-workers"
import { getAutoPauseMinutes } from "./secrets"
import { stopManagedWorkerContainer } from "./control-worker"

const AUTO_PAUSE_POLL_INTERVAL_MS = 30_000

let schedulerInitialized = false
let sweepInFlight = false

async function runAutoPauseSweep() {
  const autoPauseMinutes = getAutoPauseMinutes()

  if (!autoPauseMinutes || sweepInFlight) {
    return
  }

  sweepInFlight = true

  try {
    const thresholdSeconds = autoPauseMinutes * 60
    const { workers } = await listWorkers()

    for (const worker of workers) {
      if (worker.status === "stopped") {
        continue
      }

      if (worker.durationS < thresholdSeconds) {
        continue
      }

      try {
        await stopManagedWorkerContainer(worker.id)
        console.log(
          `[autoPause] paused worker ${worker.id} (${worker.title}) after ${worker.durationS}s`,
        )
      } catch (error) {
        console.error(`[autoPause] failed to pause worker ${worker.id}`, error)
      }
    }
  } finally {
    sweepInFlight = false
  }
}

export function initializeAutoPauseScheduler() {
  if (schedulerInitialized) {
    return
  }

  schedulerInitialized = true

  const timer = setInterval(() => {
    void runAutoPauseSweep()
  }, AUTO_PAUSE_POLL_INTERVAL_MS)

  timer.unref?.()
  void runAutoPauseSweep()
}
