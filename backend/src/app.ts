import { mkdirSync } from "fs"
import fastifyCookie from "@fastify/cookie"
import cors from "@fastify/cors"
import formbody from "@fastify/formbody"
import multipart from "@fastify/multipart"
import fastifyStatic from "@fastify/static"
import fastifyWebsocket from "@fastify/websocket"
import Fastify, { type FastifyInstance } from "fastify"
import { MAX_UPLOAD_BYTES } from "./lib/constants.js"
import { HttpError } from "./lib/httpError.js"

export interface BuildAppOptions {
  testing?: boolean
}

export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env["LOG_LEVEL"] ?? "info" },
    bodyLimit: MAX_UPLOAD_BYTES,
  })

  app.setErrorHandler((error, request, reply) => {
    const genericError = error as { statusCode?: unknown }
    const status =
      typeof genericError.statusCode === "number"
        ? genericError.statusCode
        : 500

    if (status >= 500) {
      request.log.error({ err: error }, "request failed")
    } else {
      request.log.info({ err: error }, "request failed")
    }

    const payload: {
      code: string
      params?: Record<string, string | number>
    } = { code: "internal_server_error" }
    if (error instanceof HttpError) {
      payload.code = error.code
      if (error.params) payload.params = error.params
    }
    reply.status(status).send(payload)
  })

  await app.register(cors, {
    origin:
      process.env["ENV"] === "prod"
        ? splitOrigins(process.env["PROD_ALLOW_ORIGINS"])
        : true,
    credentials: true,
  })
  await app.register(fastifyCookie)
  await app.register(multipart, {
    limits: { fileSize: MAX_UPLOAD_BYTES },
    throwFileSizeLimit: true,
  })
  await app.register(formbody)

  const uploadsRoot = process.env["UPLOADS_DIR"] ?? "/opt/uploads"
  mkdirSync(uploadsRoot, { recursive: true })
  await app.register(fastifyStatic, {
    root: uploadsRoot,
    prefix: "/uploads/",
  })
  await app.register(fastifyWebsocket, {
    options: {
      handleProtocols: (protocols: Set<string>) => {
        if (protocols.has("Authorization")) return "Authorization"
        return false
      },
    },
  })

  // Bootstrap default room
  const { getDb } = await import("./db/index.js")
  const { getOrCreateGeneralRoom } = await import("./db/queries.js")

  app.addHook("onReady", async () => {
    if (!options.testing && !isTestingEnv()) {
      await getOrCreateGeneralRoom(getDb())
    }
  })

  // Register routes
  const { registerAuthRoutes } = await import("./routes/auth.js")
  const { registerMeRoutes } = await import("./routes/me.js")
  const { registerMessagesRoutes } = await import("./routes/messages.js")
  const { registerNotificationsRoutes } =
    await import("./routes/notifications.js")
  const { registerRoomsRoutes } = await import("./routes/rooms.js")
  const { registerCallsRoutes } = await import("./routes/calls.js")
  const { registerWsRoutes } = await import("./routes/ws.js")

  await app.register(
    async (sub) => {
      await registerAuthRoutes(sub)
      await registerMeRoutes(sub)
      await registerMessagesRoutes(sub)
      await registerNotificationsRoutes(sub)
      await registerRoomsRoutes(sub)
      await registerCallsRoutes(sub)
      await registerWsRoutes(sub)
    },
    { prefix: "" },
  )

  app.get("/", async () => ({ status: "Server is running" }))

  return app
}

function splitOrigins(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

function isTestingEnv(): boolean {
  return process.env["TESTING"] === "true" || process.env["TESTING"] === "1"
}
