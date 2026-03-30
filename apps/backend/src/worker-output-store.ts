const MAX_OUTPUT_BYTES = 64 * 1024

type WorkerOutputEntry = {
  output: string
  truncated: boolean
}

const workerOutputs = new Map<string, WorkerOutputEntry>()

function normalizeOutput(output: string): WorkerOutputEntry {
  const normalized = output

  if (normalized.length <= MAX_OUTPUT_BYTES) {
    return {
      output: normalized,
      truncated: false,
    }
  }

  return {
    output: normalized.slice(normalized.length - MAX_OUTPUT_BYTES),
    truncated: true,
  }
}

export function setWorkerOutput(workerId: string, output: string) {
  workerOutputs.set(workerId, normalizeOutput(output))
}

export function getWorkerOutput(workerId: string) {
  return workerOutputs.get(workerId) ?? null
}

export function clearWorkerOutput(workerId: string) {
  workerOutputs.delete(workerId)
}

export function pruneWorkerOutputs(validWorkerIds: Iterable<string>) {
  const validIds = new Set(validWorkerIds)

  for (const workerId of workerOutputs.keys()) {
    if (!validIds.has(workerId)) {
      workerOutputs.delete(workerId)
    }
  }
}
