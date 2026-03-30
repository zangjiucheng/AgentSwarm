import { QueryClient } from "@tanstack/react-query"
import { httpBatchLink } from "@trpc/client"
import { createTRPCReact } from "@trpc/react-query"
import type { AppRouter } from "@repo/backend/router"

export const trpc = createTRPCReact<AppRouter>()

export const queryClient = new QueryClient()

const ADMIN_TOKEN_STORAGE_KEY = "agentswarm.admin-token"

export function getAdminToken() {
  if (typeof window === "undefined") {
    return import.meta.env.VITE_AGENTSWARM_ADMIN_TOKEN?.trim() ?? ""
  }

  return (
    window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY)?.trim() ||
    import.meta.env.VITE_AGENTSWARM_ADMIN_TOKEN?.trim() ||
    ""
  )
}

export function setAdminToken(token: string) {
  window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token.trim())
}

export function clearAdminToken() {
  window.localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY)
}

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      headers() {
        const token = getAdminToken()

        return token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {}
      },
    }),
  ],
})
