import { TRPCError, initTRPC } from "@trpc/server"
import { z } from "zod"
import {
  renameManagedWorkerContainer,
  replaceManagedWorkerContainer,
  startManagedWorkerContainer,
  stopManagedWorkerContainer,
} from "./control-worker"
import { destroyWorkerContainer } from "./destroy-worker"
import { clearWorkersCache, listWorkers } from "./list-workers"
import { startWorkerContainer } from "./start-worker"
import { adminToken, config } from "./config"
import {
  assignWorkerGithubAccount,
  deleteGithubAccount,
  deleteSshPublicKey,
  getGlobalSettings,
  getStoredGithubAccountIdForWorker,
  saveGithubAccount,
  saveGlobalSettings,
  saveSshPublicKey,
  setDefaultGithubAccount,
} from "./secrets"
import {
  findManagedContainerById,
  getContainerEnv,
  readPublishedPort,
  resolveWorkerByIp,
  WORKER_PARENT_LABEL,
  WORKER_SSH_PORT,
  WORKER_VNC_PORT,
} from "./worker-container"
import {
  applyGithubAccountToWorker,
  applyGithubAccountsToRunningWorkers,
} from "./worker-github"
import { readComputerUseState } from "./computer-use"
import {
  getWorkerOutput,
  setWorkerOutput,
} from "./worker-output-store"

export type TRPCContext = {
  clientIp: string | undefined
  isAdminAuthed: boolean
  workerCaller?: {
    id: string
    parentId?: string
    preset?: string
  }
}

const t = initTRPC.context<TRPCContext>().create()

export const router = t.router
export const publicProcedure = t.procedure
export const authedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!adminToken) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Admin token auth is not configured on the server",
    })
  }

  if (!ctx.isAdminAuthed) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid or missing admin token",
    })
  }

  return next()
})
export const workerProcedure = t.procedure.use(async ({ ctx, next }) => {
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

  return next({
    ctx: {
      ...ctx,
      workerCaller: caller,
    },
  })
})
export const authedOrWorkerProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (ctx.isAdminAuthed) {
    return next()
  }

  if (!ctx.clientIp) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Unable to determine caller IP",
    })
  }

  const caller = await resolveWorkerByIp(ctx.clientIp)

  if (!caller) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid or missing admin token",
    })
  }

  return next({
    ctx: {
      ...ctx,
      workerCaller: caller,
    },
  })
})

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
  sshEnabled: z.boolean(),
  sshPort: z.number(),
  computerUseEnabled: z.boolean(),
  computerUseStatus: z.enum(["disabled", "preparing", "ready", "error"]),
  vncPort: z.number(),
  createdWithVersion: z.string(),
  currentAgentSwarmVersion: z.string(),
  workerImageTag: z.string(),
  githubAccountId: z.string().optional(),
  githubAccountName: z.string().optional(),
  githubConfigured: z.boolean(),
  githubUsername: z.string(),
  usesDefaultGithubAccount: z.boolean(),
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
    privileged: z.boolean().optional(),
    requiredEnv: z.array(z.string()),
  }),
)

const globalSettingsSchema = z.object({
  autoPauseMinutes: z.number().int().positive().nullable(),
  defaultGithubAccountId: z.string().nullable(),
  githubAccounts: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      username: z.string(),
    }),
  ),
  sshPublicKeys: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      publicKey: z.string(),
    }),
  ),
})

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
  presets: authedProcedure.output(presetsSchema).query(() => {
    return config.presets
  }),
  globalSettings: authedProcedure
    .output(globalSettingsSchema)
    .query(() => {
      return getGlobalSettings()
    }),
  saveGlobalSettings: authedProcedure
    .input(
      z.object({
        autoPauseMinutes: z.number().int().positive().nullable().optional(),
      }),
    )
    .output(globalSettingsSchema)
    .mutation(async ({ input }) => {
      return saveGlobalSettings(input)
    }),
  saveGithubAccount: authedProcedure
    .input(
      z.object({
        id: z.string().trim().optional(),
        name: z.string().trim().min(1),
        githubToken: z.string().trim().min(1),
        githubUsername: z.string().trim().min(1),
      }),
    )
    .output(globalSettingsSchema)
    .mutation(async ({ input }) => {
      clearWorkersCache()
      const result = saveGithubAccount({
        id: input.id,
        name: input.name,
        token: input.githubToken,
        username: input.githubUsername,
      })
      await applyGithubAccountsToRunningWorkers()
      return result
    }),
  saveSshPublicKey: authedProcedure
    .input(
      z.object({
        id: z.string().trim().optional(),
        name: z.string().trim().min(1),
        publicKey: z.string().trim().min(1),
      }),
    )
    .output(globalSettingsSchema)
    .mutation(({ input }) => {
      clearWorkersCache()
      return saveSshPublicKey(input)
    }),
  deleteGithubAccount: authedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .output(globalSettingsSchema)
    .mutation(async ({ input }) => {
      clearWorkersCache()
      const result = deleteGithubAccount(input.id)
      await applyGithubAccountsToRunningWorkers()
      return result
    }),
  deleteSshPublicKey: authedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .output(globalSettingsSchema)
    .mutation(({ input }) => {
      clearWorkersCache()
      return deleteSshPublicKey(input.id)
    }),
  setDefaultGithubAccount: authedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .output(globalSettingsSchema)
    .mutation(async ({ input }) => {
      clearWorkersCache()
      const result = setDefaultGithubAccount(input.id)
      await applyGithubAccountsToRunningWorkers()
      return result
    }),
  setWorkerGithubAccount: authedProcedure
    .input(
      z.object({
        accountId: z.string().optional(),
        workerId: z.string(),
      }),
    )
    .output(z.void())
    .mutation(async ({ input }) => {
      assignWorkerGithubAccount(input)
      clearWorkersCache()

      try {
        await applyGithubAccountToWorker(input.workerId)
      } catch (error) {
        console.error("[setWorkerGithubAccount] failed to apply GitHub account", error)
      }

      return undefined
    }),
  renameWorker: authedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().trim().min(1),
      }),
    )
    .output(z.void())
    .mutation(async ({ input }) => {
      try {
        await renameManagedWorkerContainer(input.id, input.title)
        return undefined
      } catch (error) {
        console.error("[renameWorker] failed to rename worker", error)

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error ? error.message : "Failed to rename worker",
          cause: error,
        })
      }
    }),
  workers: authedProcedure.output(workersSchema).query(async () => {
    return listWorkers()
  }),
  workerConnection: authedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .output(
      z.object({
        available: z.boolean(),
        sshAuthMode: z.enum(["password", "publicKey", "unknown"]),
        sshPrivateKey: z.string().nullable(),
        sshPassword: z.string().nullable(),
        sshPort: z.number().nullable(),
        sshUser: z.string().nullable(),
        computerUseError: z.string().nullable(),
        computerUseLog: z.string().nullable(),
        computerUseStatus: z.enum(["disabled", "preparing", "ready", "error"]),
        vncPassword: z.string().nullable(),
        vncPort: z.number().nullable(),
        workspaceDir: z.string().nullable(),
      }),
    )
    .query(async ({ input }) => {
      const container = await findManagedContainerById(input.id)

      if (!container) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No managed worker found for id ${input.id}`,
        })
      }

      const [inspection, env] = await Promise.all([
        container.inspect(),
        getContainerEnv(input.id),
      ])

      const sshAuthorizedKeys =
        env.WORKER_SSH_AUTHORIZED_KEYS?.trim() ||
        env.WORKER_SSH_AUTHORIZED_KEY?.trim() ||
        ""
      const sshPrivateKey = env.WORKER_SSH_PRIVATE_KEY?.trim() || null
      const sshPort = readPublishedPort(inspection, WORKER_SSH_PORT) ?? null
      const vncPort = readPublishedPort(inspection, WORKER_VNC_PORT) ?? null
      const sshEnabled = env.WORKER_SSH_ENABLED === "1"
      const computerUseEnabled = env.WORKER_COMPUTER_USE_ENABLED === "1"
      const computerUseState = await readComputerUseState({
        computerUseEnabled,
        containerId: input.id,
        running: inspection.State.Running,
      })
      const sshPassword = env.WORKER_SSH_PASSWORD?.trim() || null
      const vncPassword = env.WORKER_VNC_PASSWORD?.trim() || null
      const workspaceDir = env.WORKSPACE_DIR?.trim() || "/home/kasm-user/workers"
      const sshAuthMode =
        sshPassword !== null
          ? "password"
          : sshAuthorizedKeys
            ? "publicKey"
            : sshPrivateKey !== null
              ? "publicKey"
              : "unknown"
      const available = sshEnabled && sshPort !== null

      return {
        available,
        computerUseError: computerUseState.error,
        computerUseLog: computerUseState.log,
        computerUseStatus: computerUseState.status,
        sshAuthMode,
        sshPrivateKey,
        sshPassword,
        sshPort,
        sshUser: available ? "kasm-user" : null,
        vncPassword: computerUseState.status === "ready" ? vncPassword : null,
        vncPort: computerUseState.status === "ready" ? vncPort : null,
        workspaceDir: available ? workspaceDir : null,
      }
    }),
  stopWorker: authedProcedure
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
  startExistingWorker: authedProcedure
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
  replaceWorker: authedProcedure
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
        return await replaceManagedWorkerContainer(input.id)
      } catch (error) {
        console.error("[replaceWorker] failed to replace worker", error)

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error ? error.message : "Failed to replace worker",
          cause: error,
        })
      }
    }),
  setWorkerSsh: authedProcedure
    .input(
      z.object({
        enabled: z.boolean(),
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
        return await replaceManagedWorkerContainer(input.id, {
          enableSsh: input.enabled,
        })
      } catch (error) {
        console.error("[setWorkerSsh] failed to update worker SSH", error)

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error ? error.message : "Failed to update worker SSH",
          cause: error,
        })
      }
    }),
  destroyWorker: authedOrWorkerProcedure
    .input(
      z.object({
        id: z.string().optional(),
      }),
    )
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      try {
        if (
          ctx.workerCaller &&
          !ctx.isAdminAuthed &&
          input.id &&
          input.id !== ctx.workerCaller.id
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Workers may only destroy themselves",
          })
        }

        const targetId = input.id ?? ctx.workerCaller?.id

        if (!targetId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No id provided and caller is not a managed worker",
          })
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
  startWorker: authedProcedure
    .input(
      z.object({
        title: z.string(),
        preset: z.string(),
        env: z.record(z.string(), z.string()),
        enableSsh: z.boolean().optional(),
        enableComputerUse: z.boolean().optional(),
        computerUseExtraSetupScript: z.string().trim().min(1).optional(),
        githubAccountId: z.string().trim().optional(),
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
  startSubWorker: workerProcedure
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
        const caller = ctx.workerCaller

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
          githubAccountId: getStoredGithubAccountIdForWorker(caller.id),
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
  setWorkerOutput: workerProcedure
    .input(
      z.object({
        output: z.string(),
      }),
    )
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      if (!ctx.workerCaller) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Caller is not a managed worker",
        })
      }

      setWorkerOutput(ctx.workerCaller.id, input.output)
      return undefined
    }),
  getWorkerOutput: authedOrWorkerProcedure
    .input(
      z.object({
        workerId: z.string(),
      }),
    )
    .output(
      z.object({
        status: workerStatusSchema.nullable(),
        output: z.string().nullable(),
        truncated: z.boolean(),
      }),
    )
    .query(async ({ input }) => {
      const { workers } = await listWorkers()
      const worker = workers.find((w) => w.id === input.workerId)
      const workerOutput = getWorkerOutput(input.workerId)

      return {
        status: worker?.status ?? null,
        output: workerOutput?.output ?? null,
        truncated: workerOutput?.truncated ?? false,
      }
    }),
})

export type AppRouter = typeof appRouter
