import { USER_JWT_SECRET } from "@/lib/config"
import { httpError } from "@/lib/httpError"
import { decodeTokenPayload } from "@/lib/token"
import type { FastifyRequest } from "fastify"
import { z } from "zod"

export function randomDigits(length: number): string {
  let out = ""
  for (let i = 0; i < length; i++) {
    out += Math.floor(Math.random() * 10).toString()
  }
  return out
}

export interface ParsedBody {
  [key: string]: unknown
}

export function parseBody(request: FastifyRequest): ParsedBody {
  const body = request.body
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as ParsedBody
  }
  return {}
}

export function parseOrThrow<T extends z.ZodTypeAny>(
  schema: T,
  body: unknown,
): z.infer<T> {
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw httpError(422, "invalid_request")
  }
  return parsed.data
}

export async function decodeJwtPayload(
  token: string,
): Promise<{ sub?: string; typ?: string } | null> {
  const payload = await decodeTokenPayload(USER_JWT_SECRET, token)
  if (!payload) return null
  return {
    sub: payload.sub as string | undefined,
    typ: payload.typ as string | undefined,
  }
}
