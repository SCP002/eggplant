import { TOKEN_ALGORITHM } from "@/lib/config"
import { jwtVerify, SignJWT } from "jose"

export type AccessTokenPayload = { sub: string; typ: "access" | "refresh" }

const encoder = new TextEncoder()

function getKey(secret: string): Uint8Array {
  return encoder.encode(secret)
}

export async function createAccessToken(
  secret: string,
  subject: string,
  expiresInMs: number,
): Promise<string> {
  return new SignJWT({ typ: "access" })
    .setProtectedHeader({ alg: TOKEN_ALGORITHM })
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000 + expiresInMs / 1000))
    .sign(getKey(secret))
}

export async function createRefreshToken(
  secret: string,
  subject: string,
  expiresInMs: number,
): Promise<string> {
  return new SignJWT({ typ: "refresh" })
    .setProtectedHeader({ alg: TOKEN_ALGORITHM })
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000 + expiresInMs / 1000))
    .sign(getKey(secret))
}

export async function verifyToken<T extends string>(
  secret: string,
  token: string,
): Promise<T | null> {
  try {
    const { payload } = await jwtVerify(token, getKey(secret), {
      algorithms: [TOKEN_ALGORITHM],
    })
    return (payload as { typ?: T }).typ ?? null
  } catch {
    return null
  }
}

export async function decodeTokenPayload(
  secret: string,
  token: string,
): Promise<Record<string, unknown> | null> {
  try {
    const { payload } = await jwtVerify(token, getKey(secret), {
      algorithms: [TOKEN_ALGORITHM],
    })
    return { ...payload }
  } catch {
    return null
  }
}
