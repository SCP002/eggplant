import { randomBytes } from "crypto"
import { once } from "events"
import { createWriteStream, mkdirSync, rmSync } from "fs"
import path from "path"
import { getDb } from "@/db/index"
import { fileAttachments, roomMembers, users } from "@/db/schema"
import { FILES_DIR, MAX_UPLOAD_BYTES, USER_AVATAR_DIR } from "@/lib/constants"
import { rewriteFileFaststart } from "@/lib/faststart"
import {
  collectUserMessageFiles,
  deleteFileAttachmentRows,
  deleteFilesOnDisk,
} from "@/lib/files"
import { httpError } from "@/lib/httpError"
import { hashPassword, verifyPassword } from "@/lib/password"
import { extractBearerToken } from "@/lib/requestAuth"
import { httpGetUser } from "@/lib/validate"
import { parseOrThrow } from "@/routes/helpers"
import { broadcastToRoom, broadcastUserUpdate } from "@/ws/manager"
import {
  changePasswordFormSchema,
  changeUsernameFormSchema,
} from "@eggplant/shared/api"
import type {
  MeResp,
  UploadFileResp,
  UserSearchResult,
} from "@eggplant/shared/api"
import { eq, like } from "drizzle-orm"
import type { FastifyInstance } from "fastify"
import { fileTypeFromFile } from "file-type"
import sharp from "sharp"

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true })
}

function safeExt(filename: string | undefined): string {
  if (!filename) return ""
  const dot = filename.lastIndexOf(".")
  if (dot <= 0) return ""
  return filename.slice(dot).toLowerCase()
}

function randomHex(byteCount: number): string {
  return randomBytes(byteCount).toString("hex")
}

async function writeStreamToFile(
  input: NodeJS.ReadableStream,
  filePath: string,
  maxBytes: number,
): Promise<number> {
  const output = createWriteStream(filePath)
  let total = 0
  try {
    for await (const chunk of input as AsyncIterable<Buffer>) {
      total += chunk.length
      if (total > maxBytes) {
        throw new Error("File size exceeds the 2GB upload limit")
      }
      if (!output.write(chunk)) await once(output, "drain")
    }
    output.end()
  } catch (err) {
    output.destroy()
    throw err
  }
  await once(output, "close")
  return total
}

export async function registerMeRoutes(router: FastifyInstance): Promise<void> {
  const db = getDb()

  router.get("/api/me", async (request) => {
    const user = await httpGetUser(db, extractBearerToken(request))
    const resp: MeResp = {
      id: user.id,
      email: user.email,
      username: user.username,
      avatar_url: user.avatar_url,
    }
    return resp
  })

  router.post("/api/me/username", async (request) => {
    const { username } = parseOrThrow(changeUsernameFormSchema, request.body)

    const user = await httpGetUser(db, extractBearerToken(request))

    const existing = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1)
    if (existing.length > 0 && existing[0].id !== user.id) {
      throw httpError(400, "username_exists")
    }

    await db.update(users).set({ username }).where(eq(users.id, user.id))
    const updatedUser = (
      await db.select().from(users).where(eq(users.id, user.id)).limit(1)
    )[0]
    await broadcastUserUpdate({
      type: "user_updated",
      payload: {
        id: updatedUser.id,
        username: updatedUser.username,
        avatar_url: updatedUser.avatar_url,
      },
    })
    return undefined
  })

  router.post("/api/me/avatar", async (request, reply) => {
    const user = await httpGetUser(db, extractBearerToken(request))

    const file = await request.file()
    if (!file) throw httpError(400, "no_file_uploaded")

    ensureDir(USER_AVATAR_DIR)

    if (user.avatar_url) {
      rmSync(path.join(USER_AVATAR_DIR, path.basename(user.avatar_url)), {
        force: true,
      })
    }

    const ext = safeExt(file.filename)
    const destName = `${user.id}_${Math.floor(Date.now() / 1000)}_${randomHex(8)}${ext}`
    const destPath = path.join(USER_AVATAR_DIR, destName)

    const buf = Buffer.from(await file.toBuffer())
    await sharp(buf)
      .resize(512, 512, { fit: "inside", withoutEnlargement: true })
      .toFile(destPath)

    await db
      .update(users)
      .set({ avatar_url: `/uploads/avatars/users/${destName}` })
      .where(eq(users.id, user.id))
    const updatedUser = (
      await db.select().from(users).where(eq(users.id, user.id)).limit(1)
    )[0]
    await broadcastUserUpdate({
      type: "user_updated",
      payload: {
        id: updatedUser.id,
        username: updatedUser.username,
        avatar_url: updatedUser.avatar_url,
      },
    })
    return reply.send(undefined)
  })

  router.post("/api/files/upload", async (request) => {
    const user = await httpGetUser(db, extractBearerToken(request))

    const file = await request.file()
    if (!file) throw httpError(400, "no_file_uploaded")

    ensureDir(FILES_DIR)
    const ext = safeExt(file.filename)
    const destName = `${user.id}_${Math.floor(Date.now() / 1000)}_${randomHex(8)}${ext}`
    const destPath = path.join(FILES_DIR, destName)
    const originalFilename = file.filename

    const size = await writeStreamToFile(file.file, destPath, MAX_UPLOAD_BYTES)

    const filetype = await fileTypeFromFile(destPath).catch(() => undefined)
    const contentType = filetype?.mime ?? file.mimetype

    const videoExts = [".mp4", ".m4v", ".mov"]

    // Rewrite the MP4 so the moov atom sits at the front, so Chromium/Electron
    // don't range-scan the whole file to show a thumbnail.
    if (videoExts.includes(ext)) {
      await rewriteFileFaststart(destPath)
    }

    // Generate a preview thumbnail for images, and record whether one exists.
    let hasPreview = false
    if (contentType.startsWith("image/")) {
      const previewName = `preview_${destName}`
      const previewPath = path.join(FILES_DIR, previewName)
      try {
        await sharp(destPath)
          .resize(400, 400, { fit: "inside", withoutEnlargement: true })
          .toFile(previewPath)
        hasPreview = true
      } catch {
        // keep the original file; just no preview
      }
    }

    await db.insert(fileAttachments).values({
      basename: destName,
      original_filename: originalFilename,
      size,
      content_type: contentType,
      has_preview: hasPreview,
      uploader_id: user.id,
    })

    const resp: UploadFileResp = {
      name: originalFilename,
      size,
      type: contentType,
      file_id: destName,
      has_preview: hasPreview,
    }
    return resp
  })

  router.post("/api/me/delete", async (request) => {
    const body = (request.body ?? {}) as Record<string, unknown>
    const password = String(body.password ?? "")
    const user = await httpGetUser(db, extractBearerToken(request))

    if (!(await verifyPassword(user.hashed_password, password))) {
      throw httpError(401, "invalid_password")
    }

    const userMemberships = await db
      .select()
      .from(roomMembers)
      .where(eq(roomMembers.user_id, user.id))

    const avatarFile = user.avatar_url
      ? path.join(USER_AVATAR_DIR, path.basename(user.avatar_url))
      : null

    const userFiles = await collectUserMessageFiles(db, user.id)
    await db.transaction(async (tx) => {
      await deleteFileAttachmentRows(tx, userFiles)
      await tx.delete(users).where(eq(users.id, user.id))
    })
    deleteFilesOnDisk(userFiles)
    if (avatarFile) {
      rmSync(avatarFile, { force: true })
    }

    const payload = { sender_id: user.id }
    for (const m of userMemberships) {
      await broadcastToRoom(m.room_id, {
        type: "messages_by_user_id_deleted",
        payload,
      })
    }
    return undefined
  })

  router.post("/api/me/password", async (request) => {
    const { old_password: oldPassword, new_password: newPassword } =
      parseOrThrow(changePasswordFormSchema, request.body)
    const user = await httpGetUser(db, extractBearerToken(request))
    if (!(await verifyPassword(user.hashed_password, oldPassword))) {
      throw httpError(401, "invalid_password")
    }
    await db
      .update(users)
      .set({ hashed_password: await hashPassword(newPassword) })
      .where(eq(users.id, user.id))
    return undefined
  })

  router.get("/api/users/search", async (request) => {
    await httpGetUser(db, extractBearerToken(request))
    const params = request.query as Record<string, string>
    const q = params.q ?? ""
    if (!q) return []

    const results = await db
      .select()
      .from(users)
      .where(like(users.username, `%${q}%`))
      .limit(10)
    const resp: UserSearchResult[] = results.map((u) => ({
      id: u.id,
      username: u.username,
      avatar_url: u.avatar_url,
    }))
    return resp
  })
}
