import { mkdirSync, writeFileSync } from "fs"
import path from "path"
import { eq } from "drizzle-orm"
import type { FastifyInstance } from "fastify"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import WebSocket from "ws"
import type { DB } from "../src/db/index.js"
import { fileAttachments } from "../src/db/schema.js"
import { USER_JWT_SECRET } from "../src/lib/config.js"
import { FILES_DIR } from "../src/lib/constants.js"
import { createAccessToken } from "../src/lib/token.js"
import { buildTestApp, closeTestApp } from "./setup.js"

const SERVER_URL = "http://127.0.0.1"

interface Ctx {
  app: FastifyInstance
  url: string
  db: DB
}

interface TestMessage {
  id: number
  text: string
  attachments: Array<{
    file_id: string
    name: string | null
    has_preview: boolean
  }>
}

async function listenApp(app: FastifyInstance): Promise<string> {
  await app.listen({ host: "127.0.0.1", port: 0 })
  const address = app.server.address()
  if (typeof address === "object" && address) {
    return `${SERVER_URL}:${address.port}`
  }
  return `${SERVER_URL}:8000`
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
    ws.once("error", (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

describe("attachment message flow", () => {
  let client: Ctx

  beforeAll(async () => {
    const ctx = await buildTestApp()
    const url = await listenApp(ctx.app)
    client = { app: ctx.app, url, db: ctx.db }
  })

  afterAll(async () => {
    await closeTestApp(client.app)
  })

  async function createUserAndRoom(
    email: string,
    username: string,
  ): Promise<{ token: string; roomId: number; userId: number }> {
    const res = await client.app.inject({
      method: "POST",
      url: "/api/test/create_user",
      payload: { email, username, password: "password12345" },
    })
    const body = res.json() as { room_id: number }
    const token = await createAccessToken(
      USER_JWT_SECRET,
      email,
      60 * 60 * 1000,
    )
    const meRes = await client.app.inject({
      method: "GET",
      url: "/api/me",
      headers: { authorization: `Bearer ${token}` },
    })
    return { token, roomId: body.room_id, userId: meRes.json().id }
  }

  async function seedUnattachedFile(
    uploaderId: number,
    basename: string,
  ): Promise<void> {
    mkdirSync(FILES_DIR, { recursive: true })
    writeFileSync(path.join(FILES_DIR, basename), "file-bytes")
    await client.db.insert(fileAttachments).values({
      basename,
      original_filename: "report.txt",
      size: "file-bytes".length,
      content_type: "text/plain",
      uploader_id: uploaderId,
    })
  }

  it("attaches uploaded files to a message and returns attachment metadata", async () => {
    const { token, roomId, userId } = await createUserAndRoom(
      "flow-send@example.com",
      "flowsend",
    )
    const basename = `flow_${Math.random().toString(36).slice(2)}.txt`
    await seedUnattachedFile(userId, basename)

    const ws = await openWs(client, `/ws/chat/${roomId}`, token)
    ws.send(
      JSON.stringify({
        type: "message",
        payload: { text: "", parent_id: null, file_ids: [basename] },
      }),
    )
    const raw = await receiveOnce(ws)
    const data = JSON.parse(raw)
    expect(data.type).toBe("new_message")
    const message = data.payload as TestMessage
    expect(message.text).toBe("")
    expect(message.attachments).toHaveLength(1)
    expect(message.attachments![0].file_id).toBe(basename)
    expect(message.attachments![0].name).toBe("report.txt")

    // The uploaded file is now anchored to the message.
    const rows = await client.db
      .select()
      .from(fileAttachments)
      .where(eq(fileAttachments.basename, basename))
    expect(rows).toHaveLength(1)
    expect(rows[0].message_id).not.toBeNull()

    // REST messages list also resolves the attachment.
    const listRes = await client.app.inject({
      method: "GET",
      url: `/api/rooms/${roomId}/messages`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(listRes.statusCode).toBe(200)
    const list = listRes.json() as TestMessage[]
    const listed = list.find((m) => m.id === message.id)
    expect(listed?.attachments).toHaveLength(1)
    expect(listed?.attachments![0].file_id).toBe(basename)

    ws.close()
  })

  it("strips zero-width spaces from attachment-only messages", async () => {
    const { token, roomId, userId } = await createUserAndRoom(
      "flow-zws@example.com",
      "flowzws",
    )
    const basename = `flow_zws_${Math.random().toString(36).slice(2)}.txt`
    await seedUnattachedFile(userId, basename)

    const ws = await openWs(client, `/ws/chat/${roomId}`, token)
    ws.send(
      JSON.stringify({
        type: "message",
        // The web editor serializes an empty paragraph as a zero-width space.
        payload: { text: "\u200b", parent_id: null, file_ids: [basename] },
      }),
    )
    const raw = await receiveOnce(ws)
    const data = JSON.parse(raw)
    expect(data.type).toBe("new_message")
    const message = data.payload as TestMessage
    expect(message.text).toBe("")
    expect(message.attachments).toHaveLength(1)

    ws.close()
  })

  it("does not allow attaching another user's uploaded file", async () => {
    // Owner uploads a file (never attaches it).
    const owner = await createUserAndRoom("flow-owner@example.com", "flowowner")
    const ownerBasename = `flow_owner_${Math.random().toString(36).slice(2)}.txt`
    mkdirSync(FILES_DIR, { recursive: true })
    writeFileSync(path.join(FILES_DIR, ownerBasename), "file-bytes")
    await client.db.insert(fileAttachments).values({
      basename: ownerBasename,
      original_filename: "owner.txt",
      size: 10,
      content_type: "text/plain",
      uploader_id: owner.userId,
    })

    // A second user in their own room tries to hijack that file id.
    const other = await createUserAndRoom("flow-other@example.com", "flowother")
    const ws = await openWs(client, `/ws/chat/${other.roomId}`, other.token)
    ws.send(
      JSON.stringify({
        type: "message",
        payload: {
          text: "hello",
          parent_id: null,
          file_ids: [ownerBasename],
        },
      }),
    )
    const raw = await receiveOnce(ws)
    const data = JSON.parse(raw)
    expect(data.type).toBe("new_message")
    const message = data.payload as TestMessage
    expect(message.attachments ?? []).toHaveLength(0)

    // Owner's file remains unattached (original upload stays intact).
    const rows = await client.db
      .select()
      .from(fileAttachments)
      .where(eq(fileAttachments.basename, ownerBasename))
    expect(rows[0].message_id).toBeNull()

    ws.close()
  })

  it("sends a new_message_notification with the full message to non-connected members", async () => {
    const { token: ownerToken, roomId } = await createUserAndRoom(
      "notif-owner@example.com",
      "notifowner",
    )
    // Both users are members of the shared default room.
    const { token: otherToken } = await createUserAndRoom(
      "notif-other@example.com",
      "notifother",
    )

    // Other user subscribes to /ws/updates but NOT to the chat socket of the room.
    const updatesWs = await openWs(client, `/ws/updates`, otherToken)

    // Owner sends a message while connected to the chat socket.
    const chatWs = await openWs(client, `/ws/chat/${roomId}`, ownerToken)
    chatWs.send(
      JSON.stringify({
        type: "message",
        payload: { text: "hello from notif owner", parent_id: null },
      }),
    )
    const chatRaw = await receiveOnce(chatWs)
    const chatData = JSON.parse(chatRaw)
    expect(chatData.type).toBe("new_message")
    const sentMessage = chatData.payload as TestMessage
    chatWs.close()

    // The updates listener receives a notification carrying the message payload.
    const notifRaw = await receiveOnce(updatesWs)
    const notif = JSON.parse(notifRaw)
    expect(notif.type).toBe("new_message_notification")
    expect(notif.payload.room_id).toBe(roomId)
    expect(notif.payload.message).toMatchObject({
      id: sentMessage.id,
      text: "hello from notif owner",
      sender: "notifowner",
    })

    updatesWs.close()
  })
})
