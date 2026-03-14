import { initTRPC } from "@trpc/server"
import { z } from "zod"
import { getMonitorStatus, monitorInfoSchema } from "./monitor"

const t = initTRPC.create()

export const router = t.router
export const publicProcedure = t.procedure

export const appRouter = router({
  health: publicProcedure
    .output(
      z.object({
        ok: z.literal(true),
      }),
    )
    .query(() => {
      return {
        ok: true as const,
      }
    }),
  status: publicProcedure.output(monitorInfoSchema).query(() => getMonitorStatus()),
})

export type AppRouter = typeof appRouter
