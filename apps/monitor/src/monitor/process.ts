export async function runCommand(args: string[], cwd?: string) {
  const proc = Bun.spawn(args, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  })

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])

  await proc.exited

  return {
    exitCode: proc.exitCode,
    stderr,
    stdout,
  }
}

export function runTmuxCommand(args: string[]) {
  return runCommand(["tmux", ...args])
}
