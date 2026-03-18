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
