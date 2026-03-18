function createWorkerUrl(port: number) {
  const url = new URL(window.location.href)
  url.port = `${port}`
  url.hash = ""
  return url
}

export function getWorkerIframeUrl(port: number) {
  const url = createWorkerUrl(port)
  url.pathname = "/"
  url.search = ""
  return url.toString()
}

export function getWorkerMonitorWebSocketUrl(port: number, command: string) {
  const url = createWorkerUrl(port)
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  url.pathname = "/monitor/ws"
  url.searchParams.set("cmd", command)
  return url.toString()
}
