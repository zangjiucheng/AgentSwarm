const SELECTED_WORKER_PORT_KEY = "claudeswarm-selected-worker-port"
const TERMINAL_HEIGHT_KEY = "claudeswarm-terminal-height"

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined"
}

export function readStoredNumber(key: string) {
  if (!canUseStorage()) {
    return undefined
  }

  const rawValue = window.localStorage.getItem(key)

  if (!rawValue) {
    return undefined
  }

  const parsedValue = Number.parseInt(rawValue, 10)
  return Number.isNaN(parsedValue) ? undefined : parsedValue
}

export function writeStoredNumber(key: string, value: number) {
  if (!canUseStorage()) {
    return
  }

  window.localStorage.setItem(key, `${value}`)
}

export function readStoredString(key: string) {
  if (!canUseStorage()) {
    return undefined
  }

  return window.localStorage.getItem(key) ?? undefined
}

export function writeStoredString(key: string, value: string) {
  if (!canUseStorage()) {
    return
  }

  window.localStorage.setItem(key, value)
}

export function removeStoredValue(key: string) {
  if (!canUseStorage()) {
    return
  }

  window.localStorage.removeItem(key)
}

export function readSelectedWorkerPort() {
  return readStoredNumber(SELECTED_WORKER_PORT_KEY)
}

export function writeSelectedWorkerPort(port: number) {
  writeStoredNumber(SELECTED_WORKER_PORT_KEY, port)
}

export function clearSelectedWorkerPort() {
  removeStoredValue(SELECTED_WORKER_PORT_KEY)
}

export function readTerminalHeight(defaultHeight: number) {
  return readStoredNumber(TERMINAL_HEIGHT_KEY) ?? defaultHeight
}

export function writeTerminalHeight(height: number) {
  writeStoredNumber(TERMINAL_HEIGHT_KEY, height)
}

export function getTerminalSelectionKey(port: number) {
  return `claudeswarm-${port}-terminal`
}
