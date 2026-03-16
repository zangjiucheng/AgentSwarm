import { createBunServeHandler } from "trpc-bun-adapter"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { config } from "./config"
import { appRouter } from "./router"
import { initializeWorkerContainerRuntime } from "./worker-container"

function readEnv(name: string, fallback?: string) {
  return process.env[name] ?? fallback
}

const nodeEnv = readEnv("NODE_ENV", "development")
const isProduction = nodeEnv === "production"
const port = Number(readEnv("PORT", "3000"))
const host = readEnv("HOST", "0.0.0.0")
const frontendDevServer = readEnv(
  "FRONTEND_DEV_SERVER",
  "http://127.0.0.1:4100",
)

const currentDir = dirname(fileURLToPath(import.meta.url))
const frontendDist =
  readEnv("FRONTEND_DIST") ?? resolve(currentDir, "../../frontend/dist")
const frontendIndexPath = resolve(frontendDist, "index.html")

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

const renderDeviceGroupId = await initializeWorkerContainerRuntime()

Bun.serve(
  createBunServeHandler(
    {
      endpoint: "/api/trpc",
      router: appRouter,
    },
    {
      port,
      hostname: host,
      fetch: handleFallback,
    },
  ),
)

if (renderDeviceGroupId === undefined) {
  console.log(
    `[backend] no dri device group detected for ${config.drinode}, using software rendering`,
  )
} else {
  console.log(
    `[backend] detected dri device on ${config.drinode}, worker hardware acceleration is enabled`,
  )
}
console.log(
  `[backend] listening on http://${host}:${port} (${isProduction ? "prod" : "dev"})`,
)
