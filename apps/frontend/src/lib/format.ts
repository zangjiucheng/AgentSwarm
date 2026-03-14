import type { WorkerStatus } from "./api-types"

export function formatDuration(durationS: number) {
  if (durationS < 60) {
    return `${durationS}s`
  }

  const hours = Math.floor(durationS / 3600)
  const minutes = Math.floor((durationS % 3600) / 60)

  if (hours === 0) {
    return `${minutes}m`
  }

  return `${hours}h ${minutes}m`
}

export function statusTone(status: WorkerStatus) {
  switch (status) {
    case "working":
      return "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]"
    case "stopped":
    case "idle":
      return "bg-gray-500"
    case "waiting":
      return "bg-yellow-500 shadow-[0_0_6px_rgba(234,179,8,0.6)]"
    case "error":
      return "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]"
  }
}
