import { existsSync, mkdirSync, writeFileSync } from "fs"
import path from "path"
import { eq } from "drizzle-orm"
import type { FastifyInstance } from "fastify"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import WebSocket from "ws"
import type { DB } from "../src/db/index.js"
import {
  fileAttachments,
  roomMessages,
  rooms,
  users,
} from "../src/db/schema.js"
import { USER_JWT_SECRET } from "../src/lib/config.js"
import {
  FILES_DIR,
  ROOM_AVATAR_DIR,
  USER_AVATAR_DIR,
} from "../src/lib/constants.js"
import { createAccessToken } from "../src/lib/token.js"
import { buildTestApp, closeTestApp } from "./setup.js"

const SERVER_URL = "http://127.0.0.1"

interface Ctx {
  app: FastifyInstance
  url: string
  db: DB
}

async function listenApp(app: FastifyInstance): Promise<string> {
  await app.listen({ host: "127.0.0.1", port: 0 })
  const address = app.server.address()
  if (typeof address === "object" && address) {
    return `${SERVER_URL}:${address.port}`
  }
  return `${SERVER_URL}:8000`
}

async function createUser(
  client: Ctx,
  email: string,
  username: string,
  password = "password12345",
) {
  const res = await client.app.inject({
    method: "POST",
    url: "/api/test/create_user",
    payload: { email, username, password },
  })
  return res.json() as {
    access_token: string
    token_type: string
    room_id: number
  }
}

async function makeAccessToken(email: string): Promise<string> {
  return createAccessToken(USER_JWT_SECRET, email, 60 * 60 * 1000)
}

function createDiskFile(directory: string, basename: string): void {
  mkdirSync(directory, { recursive: true })
  writeFileSync(path.join(directory, basename), "file-bytes")
}

const diskFileExists = (directory: string, basename: string): boolean =>
  existsSync(path.join(directory, basename))

async function createRoom(client: Ctx, token: string): Promise<number> {
  const res = await client.app.inject({
    method: "POST",
    url: "/api/rooms",
    headers: { authorization: `Bearer ${token}` },
    payload: { name: "cleanup-room" },
  })
  expect(res.statusCode).toBe(200)
  return res.json().id as number
}

async function setRoomAvatar(
  client: Ctx,
  roomId: number,
  basename: string,
): Promise<void> {
  createDiskFile(ROOM_AVATAR_DIR, basename)
  await client.db
    .update(rooms)
    .set({ avatar_url: `/uploads/avatars/rooms/${basename}` })
    .where(eq(rooms.id, roomId))
}

async function setUserAvatar(
  client: Ctx,
  userId: number,
  basename: string,
): Promise<void> {
  createDiskFile(USER_AVATAR_DIR, basename)
  await client.db
    .update(users)
    .set({ avatar_url: `/uploads/avatars/users/${basename}` })
    .where(eq(users.id, userId))
}

async function attachMessageFile(
  client: Ctx,
  roomId: number,
  senderId: number,
): Promise<{ basename: string; messageId: number }> {
  const basename = `cleanup_${Math.random().toString(36).slice(2)}.txt`
  createDiskFile(FILES_DIR, basename)
  const message = await client.db
    .insert(roomMessages)
    .values({
      room_id: roomId,
      sender_id: senderId,
      text: "with file",
      file_ids: [basename],
    })
    .returning()
  await client.db.insert(fileAttachments).values({
    basename,
    original_filename: basename,
    size: "attachment-bytes".length,
    content_type: "text/plain",
    uploader_id: senderId,
    message_id: message[0].id,
  })
  return { basename, messageId: message[0].id }
}

async function countFileAttachments(
  client: Ctx,
  basename: string,
): Promise<number> {
  const rows = await client.db
    .select()
    .from(fileAttachments)
    .where(eq(fileAttachments.basename, basename))
  return rows.length
}

function openWs(client: Ctx, path: string, token?: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `${client.url.replace(/^http/, "ws")}${path}`,
      token ? ["Authorization", token] : undefined,
    )
    ws.once("open", () => resolve(ws))
    ws.once("error", reject)
  })
}

function receiveOnce(ws: WebSocket, timeoutMs = 3000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("timed out waiting for ws message")),
      timeoutMs,
    )
    ws.once("message", (data: WebSocket.RawData) => {
      clearTimeout(timer)
      resolve(data.toString())
    })
    ws.once("close", () => {
      clearTimeout(timer)
      reject(new Error("connection closed"))
    })
    ws.once("error", (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

describe("attachment cleanup on deletion", () => {
  let client: Ctx

  beforeAll(async () => {
    const ctx = await buildTestApp()
    const url = await listenApp(ctx.app)
    client = { app: ctx.app, url, db: ctx.db }
  })

  afterAll(async () => {
    await closeTestApp(client.app)
  })

  it("removes attachment files when a user deletes a message", async () => {
    const u = await createUser(client, "cleanup-msg@example.com", "cleanupmsg")
    const token = await makeAccessToken("cleanup-msg@example.com")
    const senderIdNumeric = (
      await client.app.inject({
        method: "GET",
        url: "/api/me",
        headers: { authorization: `Bearer ${token}` },
      })
    ).json().id
    const roomId = u.room_id
    const { basename, messageId } = await attachMessageFile(
      client,
      roomId,
      senderIdNumeric,
    )

    expect(diskFileExists(FILES_DIR, basename)).toBe(true)
    expect(await countFileAttachments(client, basename)).toBe(1)

    const ws = await openWs(client, `/ws/chat/${roomId}`, token)
    ws.send(
      JSON.stringify({
        type: "delete_message",
        payload: { message_id: messageId },
      }),
    )
    const raw = await receiveOnce(ws)
    const data = JSON.parse(raw)
    expect(data.type).toBe("message_by_id_deleted")
    ws.close()
    await new Promise((r) => setTimeout(r, 100))

    expect(diskFileExists(FILES_DIR, basename)).toBe(false)
    expect(await countFileAttachments(client, basename)).toBe(0)
  })

  it("removes attachment files when a room is deleted", async () => {
    await createUser(client, "cleanup-roomu@example.com", "cleanuproomu")
    const token = await makeAccessToken("cleanup-roomu@example.com")
    const meRes = await client.app.inject({
      method: "GET",
      url: "/api/me",
      headers: { authorization: `Bearer ${token}` },
    })
    const senderIdNumeric = meRes.json().id
    const roomId = await createRoom(client, token)
    const { basename } = await attachMessageFile(
      client,
      roomId,
      senderIdNumeric,
    )
    const avatarName = `room_avatar_${Math.random().toString(36).slice(2)}.png`
    await setRoomAvatar(client, roomId, avatarName)

    expect(diskFileExists(FILES_DIR, basename)).toBe(true)
    expect(await countFileAttachments(client, basename)).toBe(1)
    expect(diskFileExists(ROOM_AVATAR_DIR, avatarName)).toBe(true)

    const res = await client.app.inject({
      method: "DELETE",
      url: `/api/rooms/${roomId}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)

    expect(diskFileExists(FILES_DIR, basename)).toBe(false)
    expect(await countFileAttachments(client, basename)).toBe(0)
    expect(diskFileExists(ROOM_AVATAR_DIR, avatarName)).toBe(false)
  })

  it("removes attachment files when a user deletes their own account", async () => {
    const email = "cleanup-acct@example.com"
    await createUser(client, email, "cleanupacct")
    const token = await makeAccessToken(email)
    const meRes = await client.app.inject({
      method: "GET",
      url: "/api/me",
      headers: { authorization: `Bearer ${token}` },
    })
    const senderIdNumeric = meRes.json().id
    const roomId = await createRoom(client, token)
    const { basename } = await attachMessageFile(
      client,
      roomId,
      senderIdNumeric,
    )
    const avatarName = `user_avatar_${Math.random().toString(36).slice(2)}.png`
    await setUserAvatar(client, senderIdNumeric, avatarName)

    expect(diskFileExists(FILES_DIR, basename)).toBe(true)
    expect(await countFileAttachments(client, basename)).toBe(1)
    expect(diskFileExists(USER_AVATAR_DIR, avatarName)).toBe(true)

    const res = await client.app.inject({
      method: "POST",
      url: "/api/me/delete",
      headers: { authorization: `Bearer ${token}` },
      payload: { password: "password12345" },
    })
    expect(res.statusCode).toBe(200)

    expect(diskFileExists(FILES_DIR, basename)).toBe(false)
    expect(await countFileAttachments(client, basename)).toBe(0)
    expect(diskFileExists(USER_AVATAR_DIR, avatarName)).toBe(false)
  })

  it("does not delete rows or disk files when the transaction rolls back", async () => {
    await createUser(client, "cleanup-rollback@example.com", "cleanuprollback")
    const token = await makeAccessToken("cleanup-rollback@example.com")
    const senderIdNumeric = (
      await client.app.inject({
        method: "GET",
        url: "/api/me",
        headers: { authorization: `Bearer ${token}` },
      })
    ).json().id
    const roomId = await createRoom(client, token)
    const { basename } = await attachMessageFile(
      client,
      roomId,
      senderIdNumeric,
    )

    const { deleteFileAttachmentRows } = await import("../src/lib/files.js")

    await expect(
      client.db.transaction(async (tx) => {
        await deleteFileAttachmentRows(tx, [basename])
        throw new Error("simulate failure after row deletion")
      }),
    ).rejects.toThrow("simulate failure after row deletion")

    // DB rows rolled back -> still present, and disk file still present
    expect(await countFileAttachments(client, basename)).toBe(1)
    expect(diskFileExists(FILES_DIR, basename)).toBe(true)
  })
})
