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

export function statusTone(status: string) {
  switch (status) {
    case "working":
      return "bg-success"
    case "idle":
      return "bg-primary"
    case "waiting":
      return "bg-warning"
    case "stopped":
    case "error":
      return "bg-danger"
    default:
      return "bg-default-500"
  }
}
