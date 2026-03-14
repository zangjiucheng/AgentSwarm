export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function getDefaultShell() {
  return process.env.SHELL?.trim() || "bash"
}

export function shellEscape(value: string) {
  if (value.length === 0) {
    return "''"
  }

  return `'${value.replace(/'/g, `'\\''`)}'`
}
