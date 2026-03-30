import { createBunServeHandler } from "trpc-bun-adapter"
import { resolve } from "node:path"
import { port, host, isProduction, frontendDevServer, frontendDist, frontendIndexPath } from "./config"
import { appRouter, type TRPCContext } from "./router"
import { initializeAutoPauseScheduler } from "./auto-pause"
import { getConfiguredAdminToken } from "./secrets"
import { initializeWorkerContainerRuntime, selfIp } from "./worker-container"

const requestIpMap = new WeakMap<Request, string>()

function readAdminTokenFromRequest(request: Request) {
  const authorization = request.headers.get("authorization")?.trim() ?? ""

  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim()
  }

  return request.headers.get("x-agentswarm-token")?.trim() ?? ""
}

function isSpaNavigationRequest(request: Request) {
  if (request.method === "HEAD") {
    return true
  }

  if (request.method !== "GET") {
    return false
  }

  const accept = request.headers.get("accept") ?? ""
  return accept === "" || accept.includes("text/html") || accept.includes("*/*")
}

function toFrontendUrl(request: Request) {
  const incomingUrl = new URL(request.url)
  return new URL(
    `${incomingUrl.pathname}${incomingUrl.search}`,
    frontendDevServer,
  )
}

async function serveFrontendFile(request: Request) {
  const { pathname } = new URL(request.url)
  const relativePath = pathname === "/" ? "/index.html" : pathname
  const filePath = resolve(frontendDist, `.${relativePath}`)
  const isDirectAssetRequest =
    pathname !== "/" && (pathname.split("/").pop()?.includes(".") ?? false)

  if (!filePath.startsWith(frontendDist)) {
    return new Response("Not found", { status: 404 })
  }

  const file = Bun.file(filePath)

  if (await file.exists()) {
    return new Response(file)
  }

  if (isDirectAssetRequest) {
    return new Response("Not found", { status: 404 })
  }

  if (!isSpaNavigationRequest(request)) {
    return new Response("Not found", { status: 404 })
  }

  return new Response(Bun.file(frontendIndexPath))
}

async function handleFallback(request: Request) {
  const url = new URL(request.url)

  if (url.pathname === "/api/health") {
    return Response.json({
      ok: true,
      mode: isProduction ? "production" : "development",
    })
  }

  if (url.pathname.startsWith("/api/")) {
    return new Response("Not found", { status: 404 })
  }

  if (isProduction) {
    return serveFrontendFile(request)
  }

  return fetch(new Request(toFrontendUrl(request).toString(), request))
}

await initializeWorkerContainerRuntime()
initializeAutoPauseScheduler()

const handler = createBunServeHandler(
  {
    endpoint: "/api/trpc",
    router: appRouter,
    createContext: ({ req }: { req: Request }): TRPCContext => {
      const configuredAdminToken = getConfiguredAdminToken().token

      return {
        clientIp: requestIpMap.get(req),
        isAdminAuthed:
          configuredAdminToken.length > 0 &&
          readAdminTokenFromRequest(req) === configuredAdminToken,
      }
    },
  },
  {
    port,
    hostname: host,
    fetch: handleFallback,
  },
)

// eslint-disable-next-line @typescript-eslint/unbound-method
const originalFetch = handler.fetch
handler.fetch = async (req: Request, server: Parameters<typeof originalFetch>[1]) => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const socketAddress = server.requestIP(req)
  if (socketAddress) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
    requestIpMap.set(req, socketAddress.address)
  }
  return originalFetch(req, server)
}

Bun.serve(handler)

if (selfIp === undefined) {
  console.log(`[backend] not running in a container, ORCHESTRATOR_ADDRESS will not be set`)
} else {
  console.log(`[backend] detected container IP ${selfIp}, workers will receive ORCHESTRATOR_ADDRESS and ORCHESTRATOR_PORT=${port}`)
}
console.log(
  `[backend] listening on http://${host}:${port} (${isProduction ? "prod" : "dev"})`,
)
