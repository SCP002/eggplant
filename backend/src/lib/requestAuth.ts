import type { FastifyRequest } from "fastify"

export function extractBearerToken(request: FastifyRequest): string | null {
  const auth = request.headers["authorization"]
  if (!auth) return null
  const match = /^Bearer\s+(.+)$/i.exec(auth)
  return match ? match[1] : null
}

export function extractWsToken(request: FastifyRequest): string | null {
  if (!isWsOriginAllowed(request)) {
    throw new Error("Origin not allowed")
  }
  const protocol = request.headers["sec-websocket-protocol"]
  if (typeof protocol !== "string" || protocol.length === 0) return null
  const token = protocol.split(",").pop()?.trim()
  return token && token.length > 0 ? token : null
}

function isWsOriginAllowed(request: FastifyRequest): boolean {
  const origin = request.headers["origin"]
  if (typeof origin !== "string" || origin.length === 0) return true
  if (process.env["ENV"] !== "prod") return true
  const allowed = (process.env["PROD_ALLOW_ORIGINS"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  return allowed.includes(origin)
}
