import { TRPCError, initTRPC } from "@trpc/server"
import { z } from "zod"
import { destroyWorkerContainer } from "./destroy-worker"
import { listWorkers } from "./list-workers"
import { startWorkerContainer } from "./start-worker"
import { config } from "./config"

const t = initTRPC.create()

export const router = t.router
export const publicProcedure = t.procedure

const workerStatusSchema = z.enum([
  "working",
  "idle",
  "waiting",
  "error",
  "stopped",
])

const workerSchema = z.object({
  title: z.string(),
  preset: z.string(),
  status: workerStatusSchema,
  port: z.number(),
  durationS: z.number(),
  pr: z
    .object({
      name: z.string(),
      number: z.string(),
      link: z.string(),
      branch: z.string(),
      baseBranch: z.string(),
    })
    .optional(),
})

const presetsSchema = z.array(
  z.object({
    name: z.string(),
    imageTag: z.string(),
    requiredEnv: z.array(z.string()),
  }),
)

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
  presets: publicProcedure.output(presetsSchema).query(() => {
    return config.presets
  }),
  workers: publicProcedure.output(z.array(workerSchema)).query(async () => {
    return listWorkers()
  }),
  destroyWorker: publicProcedure
    .input(
      z.object({
        port: z.number(),
      }),
    )
    .output(z.void())
    .mutation(async ({ input }) => {
      try {
        await destroyWorkerContainer(input.port)
        return undefined
      } catch (error) {
        console.error("[destroyWorker] failed to destroy worker", error)

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error ? error.message : "Failed to destroy worker",
          cause: error,
        })
      }
    }),
  startWorker: publicProcedure
    .input(
      z.object({
        title: z.string(),
        preset: z.string(),
        env: z.record(z.string(), z.string()),
      }),
    )
    .output(
      z.object({
        port: z.number(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        return await startWorkerContainer(input)
      } catch (error) {
        console.error("[startWorker] failed to start worker", error)

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error ? error.message : "Failed to start worker",
          cause: error,
        })
      }
    }),
  logPage: publicProcedure
    .input(
      z.object({
        page: z.enum(["home", "about"]),
      }),
    )
    .mutation(({ input }) => {
      console.log(`[trpc] page button clicked: ${input.page}`)

      return { ok: true }
    }),
})

export type AppRouter = typeof appRouter
