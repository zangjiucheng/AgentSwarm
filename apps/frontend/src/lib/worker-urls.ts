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

export function getWorkerComputerUseUrl(port: number, password?: string | null) {
  const url = createWorkerUrl(port)
  url.pathname = "/vnc.html"
  url.search = ""
  url.searchParams.set("autoconnect", "1")
  url.searchParams.set("resize", "remote")
  url.searchParams.set("reconnect", "1")

  if (password) {
    url.searchParams.set("password", password)
  }

  return url.toString()
}

export function getWorkerMonitorWebSocketUrl(port: number, command: string) {
  const url = createWorkerUrl(port)
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  url.pathname = "/monitor/ws"
  url.searchParams.set("cmd", command)
  return url.toString()
}
