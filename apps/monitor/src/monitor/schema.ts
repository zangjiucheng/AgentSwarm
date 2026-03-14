import { z } from "zod"

export const monitorPullRequestSchema = z.object({
  name: z.string(),
  number: z.string(),
  link: z.string(),
  branch: z.string(),
  baseBranch: z.string(),
})

export const monitorStatusSchema = z.enum(["working", "idle", "waiting"])

export const monitorInfoSchema = z.object({
  status: monitorStatusSchema,
  pr: monitorPullRequestSchema.optional(),
})

export type MonitorPullRequest = z.infer<typeof monitorPullRequestSchema>
export type MonitorInfo = z.infer<typeof monitorInfoSchema>
export type MonitorStatus = z.infer<typeof monitorStatusSchema>
