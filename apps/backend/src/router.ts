import { TRPCError, initTRPC } from "@trpc/server"
import { z } from "zod"
import { startManagedWorkerContainer, stopManagedWorkerContainer } from "./control-worker"
import { destroyWorkerContainer } from "./destroy-worker"
import { listWorkers } from "./list-workers"
import { startWorkerContainer } from "./start-worker"
import { config, setGlobalEnv } from "./config"
import { getContainerEnv, resolveWorkerByIp, WORKER_PARENT_LABEL } from "./worker-container"

export type TRPCContext = {
  clientIp: string | undefined
}

const t = initTRPC.context<TRPCContext>().create()

export const router = t.router
export const publicProcedure = t.procedure

const workerStatusSchema = z.enum([
  "ready",
  "error",
  "stopped",
])

const workerSchema = z.object({
  id: z.string(),
  title: z.string(),
  preset: z.string(),
  status: workerStatusSchema,
  port: z.number(),
  monitorPort: z.number(),
  durationS: z.number(),
  createdAt: z.number(),
})

const workersSchema = z.object({
  workers: z.array(workerSchema),
  hierarchy: z.record(z.string(), z.array(z.string())),
})

const presetsSchema = z.array(
  z.object({
    name: z.string(),
    imageTag: z.string(),
    requiredEnv: z.array(z.string()),
  }),
)

const globalSettingsSchema = z.object({
  githubUsername: z.string(),
  githubTokenConfigured: z.boolean(),
})

const workerOutputs = new Map<string, string>()

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
  globalSettings: publicProcedure
    .output(globalSettingsSchema)
    .query(() => {
      return {
        githubUsername: config.globalEnv.GITHUB_USERNAME ?? "",
        githubTokenConfigured: Boolean(config.globalEnv.GITHUB_TOKEN),
      }
    }),
  saveGlobalSettings: publicProcedure
    .input(
      z.object({
        githubUsername: z.string().trim(),
        githubToken: z.string().trim().min(1).optional(),
        clearGithubToken: z.boolean().optional(),
      }),
    )
    .output(globalSettingsSchema)
    .mutation(({ input }) => {
      const nextGlobalEnv = { ...config.globalEnv }

      if (input.githubUsername) {
        nextGlobalEnv.GITHUB_USERNAME = input.githubUsername
      } else {
        delete nextGlobalEnv.GITHUB_USERNAME
      }

      if (input.clearGithubToken) {
        delete nextGlobalEnv.GITHUB_TOKEN
      } else if (input.githubToken) {
        nextGlobalEnv.GITHUB_TOKEN = input.githubToken
      }

      setGlobalEnv(nextGlobalEnv)

      return {
        githubUsername: nextGlobalEnv.GITHUB_USERNAME ?? "",
        githubTokenConfigured: Boolean(nextGlobalEnv.GITHUB_TOKEN),
      }
    }),
  workers: publicProcedure.output(workersSchema).query(async () => {
    return listWorkers()
  }),
  stopWorker: publicProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .output(z.void())
    .mutation(async ({ input }) => {
      try {
        await stopManagedWorkerContainer(input.id)
        return undefined
      } catch (error) {
        console.error("[stopWorker] failed to stop worker", error)

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error ? error.message : "Failed to stop worker",
          cause: error,
        })
      }
    }),
  startExistingWorker: publicProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .output(
      z.object({
        id: z.string(),
        port: z.number(),
        healthy: z.boolean(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        return await startManagedWorkerContainer(input.id)
      } catch (error) {
        console.error("[startExistingWorker] failed to start worker", error)

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error ? error.message : "Failed to start worker",
          cause: error,
        })
      }
    }),
  destroyWorker: publicProcedure
    .input(
      z.object({
        id: z.string().optional(),
      }),
    )
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      try {
        let targetId = input.id

        if (!targetId) {
          if (!ctx.clientIp) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "No id provided and unable to determine caller IP",
            })
          }

          const caller = await resolveWorkerByIp(ctx.clientIp)

          if (!caller) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "No id provided and caller is not a managed worker",
            })
          }

          targetId = caller.id
        }

        await destroyWorkerContainer(targetId)
        return undefined
      } catch (error) {
        if (error instanceof TRPCError) throw error

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
        cloneRepositoryUrl: z.string().trim().min(1).optional(),
      }),
    )
    .output(
      z.object({
        id: z.string(),
        port: z.number(),
        healthy: z.boolean(),
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
  startSubWorker: publicProcedure
    .input(
      z.object({
        title: z.string(),
        preset: z.string().nullable(),
        overwriteEnv: z.record(z.string(), z.string().nullable()),
      }),
    )
    .output(
      z.object({
        id: z.string(),
        port: z.number(),
        healthy: z.boolean(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        if (!ctx.clientIp) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Unable to determine caller IP",
          })
        }

        const caller = await resolveWorkerByIp(ctx.clientIp)

        if (!caller) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Caller is not a managed worker",
          })
        }

        if (caller.parentId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Sub-workers cannot create workers",
          })
        }

        const parentEnv = await getContainerEnv(caller.id)
        const env: Record<string, string> = { ...parentEnv }

        for (const [key, value] of Object.entries(input.overwriteEnv)) {
          if (value === null) {
            delete env[key]
          } else {
            env[key] = value
          }
        }

        return await startWorkerContainer({
          title: input.title,
          preset: input.preset ?? caller.preset ?? "default",
          env,
          labels: { [WORKER_PARENT_LABEL]: caller.id },
        })
      } catch (error) {
        if (error instanceof TRPCError) throw error

        console.error("[startSubWorker] failed to start sub-worker", error)

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error ? error.message : "Failed to start sub-worker",
          cause: error,
        })
      }
    }),
  setWorkerOutput: publicProcedure
    .input(
      z.object({
        output: z.string(),
      }),
    )
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      if (!ctx.clientIp) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Unable to determine caller IP",
        })
      }

      const caller = await resolveWorkerByIp(ctx.clientIp)

      if (!caller) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Caller is not a managed worker",
        })
      }

      workerOutputs.set(caller.id, input.output)
      return undefined
    }),
  getWorkerOutput: publicProcedure
    .input(
      z.object({
        workerId: z.string(),
      }),
    )
    .output(
      z.object({
        status: workerStatusSchema.nullable(),
        output: z.string().nullable(),
      }),
    )
    .query(async ({ input }) => {
      const { workers } = await listWorkers()
      const worker = workers.find((w) => w.id === input.workerId)

      return {
        status: worker?.status ?? null,
        output: workerOutputs.get(input.workerId) ?? null,
      }
    }),
})

export type AppRouter = typeof appRouter
