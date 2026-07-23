import { getDb } from "@/db/index"
import { getOrCreateGeneralRoom } from "@/db/queries"
import { roomMembers, users, verificationCodes } from "@/db/schema"
import { isEmailAllowed } from "@/lib/allowlist"
import { USER_JWT_SECRET } from "@/lib/config"
import { isTesting } from "@/lib/env"
import { httpError } from "@/lib/httpError"
import { getRequestLocale } from "@/lib/locale"
import { sendEmailCode, sendPasswordReset } from "@/lib/mail"
import { hashPassword, verifyPassword } from "@/lib/password"
import { createAccessToken, createRefreshToken } from "@/lib/token"
import { getUserByEmail, httpGetUser } from "@/lib/validate"
import {
  decodeJwtPayload,
  parseBody,
  parseOrThrow,
  randomDigits,
} from "@/routes/helpers"
import { sendRoomMembers } from "@/ws/rooms"
import type { TokenResp } from "@eggplant/shared/api"
import {
  passwordResetConfirmFormSchema,
  passwordResetSendFormSchema,
  registerSendCodeFormSchema,
  registerVerifyFormSchema,
} from "@eggplant/shared/api"
import { eq } from "drizzle-orm"
import type { FastifyInstance, FastifyReply } from "fastify"

const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 3600 * 1000
const CODE_TTL_MS = 10 * 60 * 1000
const CODE_COOLDOWN_MS = 60 * 1000
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000

function isProduction(): boolean {
  return process.env["ENV"] === "prod"
}

function setRefreshCookie(reply: FastifyReply, refreshToken: string): void {
  reply.setCookie("refresh_token", refreshToken, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    maxAge: 7 * 24 * 3600,
    path: "/",
  })
}

function clearRefreshCookie(reply: FastifyReply): void {
  reply.clearCookie("refresh_token", { path: "/" })
}

async function issueAccessRefresh(
  reply: FastifyReply,
  userEmail: string,
): Promise<TokenResp> {
  const accessToken = await createAccessToken(
    USER_JWT_SECRET,
    userEmail,
    ACCESS_TOKEN_TTL_MS,
  )
  const refreshToken = await createRefreshToken(
    USER_JWT_SECRET,
    userEmail,
    REFRESH_TOKEN_TTL_MS,
  )
  setRefreshCookie(reply, refreshToken)
  return { access_token: accessToken, token_type: "bearer" }
}

export async function registerAuthRoutes(
  router: FastifyInstance,
): Promise<void> {
  const db = getDb()

  router.post("/auth/token", async (request, reply) => {
    const body = parseBody(request)
    const email = String(body.email ?? "")
    const password = String(body.password ?? "")

    const user = await getUserByEmail(db, email)
    if (!user || !(await verifyPassword(user.hashed_password, password))) {
      throw httpError(400, "invalid_credentials")
    }

    return reply.send(await issueAccessRefresh(reply, user.email))
  })

  router.post("/auth/refresh", async (request, reply) => {
    const refreshToken = request.cookies["refresh_token"]
    if (!refreshToken) throw httpError(401, "missing_refresh_token")

    const decoded = await decodeJwtPayload(refreshToken)
    if (!decoded) throw httpError(401, "invalid_refresh_token")
    if (decoded.typ !== "refresh") throw httpError(401, "invalid_token_type")
    const email = decoded.sub
    if (!email) throw httpError(401, "invalid_token_payload")

    return reply.send(await issueAccessRefresh(reply, email))
  })

  router.post("/auth/logout", async (_request, reply) => {
    clearRefreshCookie(reply)
    return undefined
  })

  router.post("/auth/register/send_code", async (request) => {
    const { email, password, username } = parseOrThrow(
      registerSendCodeFormSchema,
      request.body,
    )

    if (!(await isEmailAllowed(db, email))) {
      throw httpError(403, "registration_closed")
    }

    if (await getUserByEmail(db, email)) {
      throw httpError(400, "email_exists")
    }
    const existingUsername = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1)
    if (existingUsername.length > 0) {
      throw httpError(400, "username_exists")
    }

    const now = Date.now()
    const existingVc = await db
      .select()
      .from(verificationCodes)
      .where(eq(verificationCodes.email, email))
      .limit(1)
    if (existingVc.length > 0) {
      const secondsSince = (now - existingVc[0].created_at.getTime()) / 1000
      if (secondsSince < CODE_COOLDOWN_MS / 1000) {
        const remaining = Math.ceil(CODE_COOLDOWN_MS / 1000 - secondsSince)
        throw httpError(400, "code_sent_recently", { seconds: remaining })
      }
    }

    await db.delete(verificationCodes).where(eq(verificationCodes.email, email))

    const code = randomDigits(6)
    const hashedPassword = await hashPassword(password)

    await db.insert(verificationCodes).values({
      email,
      username,
      hashed_password: hashedPassword,
      code,
    })

    try {
      await sendEmailCode(email, code, getRequestLocale(request))
    } catch (error) {
      request.log.error({ err: error }, "failed to send verification email")
      throw httpError(500, "email_send_failed")
    }
    return undefined
  })

  router.post("/auth/register/verify", async (request) => {
    const { email, code } = parseOrThrow(registerVerifyFormSchema, request.body)

    const vcRows = await db
      .select()
      .from(verificationCodes)
      .where(eq(verificationCodes.email, email))
      .limit(1)
    if (vcRows.length === 0) {
      throw httpError(400, "code_not_found")
    }
    const vc = vcRows[0]
    if (Date.now() - vc.created_at.getTime() > CODE_TTL_MS) {
      await db.delete(verificationCodes).where(eq(verificationCodes.id, vc.id))
      throw httpError(400, "code_expired")
    }

    if (vc.code !== code) {
      throw httpError(400, "code_invalid")
    }

    const inserted = await db
      .insert(users)
      .values({
        email: vc.email,
        username: vc.username,
        hashed_password: vc.hashed_password,
      })
      .returning()
    const newUser = inserted[0]

    const generalRoom = await getOrCreateGeneralRoom(db)
    await db.insert(roomMembers).values({
      room_id: generalRoom.id,
      user_id: newUser.id,
      role: "member",
      status: "active",
    })

    await db.delete(verificationCodes).where(eq(verificationCodes.id, vc.id))

    await sendRoomMembers(db, generalRoom.id)

    return undefined
  })

  router.post("/auth/password_reset/send", async (request) => {
    const { email } = parseOrThrow(passwordResetSendFormSchema, request.body)
    const user = await getUserByEmail(db, email)
    if (user) {
      const token = await createAccessToken(
        USER_JWT_SECRET,
        user.email,
        RESET_TOKEN_TTL_MS,
      )
      const origin = (request.headers["origin"] as string | undefined) ?? ""
      const resetLink = `${origin}/reset-password?token=${token}`
      try {
        await sendPasswordReset(
          user.email,
          resetLink,
          getRequestLocale(request),
        )
      } catch (error) {
        request.log.error({ err: error }, "failed to send password reset email")
        throw httpError(500, "reset_email_send_failed")
      }
    }
    return undefined
  })

  router.post("/auth/password_reset/confirm", async (request) => {
    const { new_password: newPassword, token } = parseOrThrow(
      passwordResetConfirmFormSchema,
      request.body,
    )
    const user = await httpGetUser(db, token)
    await db
      .update(users)
      .set({ hashed_password: await hashPassword(newPassword) })
      .where(eq(users.id, user.id))
    return undefined
  })

  if (isTesting()) {
    router.post("/api/test/create_user", async (request) => {
      const body = parseBody(request)
      const email = String(body.email ?? "")
      const username = String(body.username ?? "")
      const password = String(body.password ?? "")
      if (!email || !username || !password)
        throw httpError(422, "missing_fields")

      const hashed = await hashPassword(password)
      const inserted = await db
        .insert(users)
        .values({ email, username, hashed_password: hashed })
        .returning()
      const user = inserted[0]

      const generalRoom = await getOrCreateGeneralRoom(db)
      await db
        .insert(roomMembers)
        .values({ room_id: generalRoom.id, user_id: user.id })

      const token = await createAccessToken(
        USER_JWT_SECRET,
        user.email,
        ACCESS_TOKEN_TTL_MS,
      )
      return {
        access_token: token,
        token_type: "bearer",
        room_id: generalRoom.id,
      }
    })
  }
}
