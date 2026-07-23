import { existsSync, mkdirSync, writeFileSync } from "fs"
import path from "path"
import { eq } from "drizzle-orm"
import type { FastifyInstance } from "fastify"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import WebSocket from "ws"
import type { DB } from "../src/db/index.js"
import { fileAttachments, roomMessages } from "../src/db/schema.js"
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
  edited_at: string | null
  attachments: Array<{
    file_id: string
    name: string | null
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

function receive(ws: WebSocket, timeoutMs = 3000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("timed out waiting for message")),
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

describe("editing messages with attachments over websocket", () => {
  let client: Ctx

  beforeAll(async () => {
    const ctx = await buildTestApp()
    const url = await listenApp(ctx.app)
    client = { app: ctx.app, url, db: ctx.db }
  }, 30000)

  afterAll(async () => {
    await closeTestApp(client.app)
  }, 30000)

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

  async function sendMessage(
    ws: WebSocket,
    text: string,
    fileIds: string[] = [],
  ): Promise<TestMessage> {
    ws.send(
      JSON.stringify({
        type: "message",
        payload: { text, parent_id: null, file_ids: fileIds },
      }),
    )
    const raw = await receive(ws)
    const data = JSON.parse(raw)
    expect(data.type).toBe("new_message")
    return data.payload as TestMessage
  }

  async function editMessage(
    ws: WebSocket,
    messageId: number,
    text: string,
    fileIds?: string[],
    removeFileIds?: string[],
  ): Promise<TestMessage> {
    ws.send(
      JSON.stringify({
        type: "edit_message",
        payload: {
          message_id: messageId,
          text,
          file_ids: fileIds,
          remove_file_ids: removeFileIds,
        },
      }),
    )
    const raw = await receive(ws)
    const data = JSON.parse(raw)
    expect(data.type).toBe("message_updated")
    return data.payload as TestMessage
  }

  it("keeps attachments when only the text is edited", async () => {
    const u = await createUser(client, "edit-keep@example.com", "editkeep")
    const token = await makeAccessToken("edit-keep@example.com")
    const roomId = u.room_id
    const senderId = (
      await client.app.inject({
        method: "GET",
        url: "/api/me",
        headers: { authorization: `Bearer ${token}` },
      })
    ).json().id
    const basename = `edit_keep_${Math.random().toString(36).slice(2)}.txt`
    await seedUnattachedFile(senderId, basename)

    const ws = await openWs(client, `/ws/chat/${roomId}`, token)
    const sent = await sendMessage(ws, "original", [basename])
    expect(sent.attachments).toHaveLength(1)

    ws.send(
      JSON.stringify({
        type: "edit_message",
        payload: { message_id: sent.id, text: "edited text" },
      }),
    )
    const raw = await receive(ws)
    const data = JSON.parse(raw)
    expect(data.type).toBe("message_updated")
    const updated = data.payload as TestMessage
    expect(updated.text).toBe("edited text")
    expect(updated.attachments).toHaveLength(1)
    expect(updated.attachments![0].file_id).toBe(basename)
    expect(updated.edited_at).not.toBeNull()

    const rows = await client.db
      .select()
      .from(fileAttachments)
      .where(eq(fileAttachments.basename, basename))
    expect(rows).toHaveLength(1)
    expect(rows[0].message_id).toBe(sent.id)

    ws.close()
  })

  it("deletes a text-only message when its text is cleared to empty", async () => {
    const u = await createUser(
      client,
      "edit-textempty@example.com",
      "edittextempty",
    )
    const token = await makeAccessToken("edit-textempty@example.com")
    const roomId = u.room_id

    const ws = await openWs(client, `/ws/chat/${roomId}`, token)
    const sent = await sendMessage(ws, "just text")
    expect(sent.text).toBe("just text")

    ws.send(
      JSON.stringify({
        type: "edit_message",
        payload: { message_id: sent.id, text: "" },
      }),
    )
    const raw = await receive(ws)
    const data = JSON.parse(raw)
    expect(data.type).toBe("message_by_id_deleted")
    expect(data.payload.message_id).toBe(sent.id)

    const msgRows = await client.db
      .select()
      .from(roomMessages)
      .where(eq(roomMessages.id, sent.id))
    expect(msgRows[0].deleted).toBe(true)

    ws.close()
  })

  it("keeps a text-only message when an identical edit is sent (no-op)", async () => {
    const u = await createUser(client, "edit-noop@example.com", "editnoop")
    const token = await makeAccessToken("edit-noop@example.com")
    const roomId = u.room_id

    const ws = await openWs(client, `/ws/chat/${roomId}`, token)
    const sent = await sendMessage(ws, "same text")
    expect(sent.text).toBe("same text")

    ws.send(
      JSON.stringify({
        type: "edit_message",
        payload: { message_id: sent.id, text: "same text" },
      }),
    )
    // A no-op edit must not produce any broadcast.
    await expect(receive(ws, 1500)).rejects.toThrow()

    const msgRows = await client.db
      .select()
      .from(roomMessages)
      .where(eq(roomMessages.id, sent.id))
    expect(msgRows[0].deleted).toBe(false)
    expect(msgRows[0].text).toBe("same text")

    ws.close()
  })

  it("adds new attachments and removes removed ones (deletes file)", async () => {
    const u = await createUser(client, "edit-mix@example.com", "editmix")
    const token = await makeAccessToken("edit-mix@example.com")
    const roomId = u.room_id
    const senderId = (
      await client.app.inject({
        method: "GET",
        url: "/api/me",
        headers: { authorization: `Bearer ${token}` },
      })
    ).json().id

    const keepBasename = `edit_mix_keep_${Math.random().toString(36).slice(2)}.txt`
    const dropBasename = `edit_mix_drop_${Math.random().toString(36).slice(2)}.txt`
    const addBasename = `edit_mix_add_${Math.random().toString(36).slice(2)}.txt`
    for (const b of [keepBasename, dropBasename]) {
      await seedUnattachedFile(senderId, b)
    }

    const ws = await openWs(client, `/ws/chat/${roomId}`, token)
    const sent = await sendMessage(ws, "two files", [
      keepBasename,
      dropBasename,
    ])
    expect(sent.attachments).toHaveLength(2)

    await seedUnattachedFile(senderId, addBasename)

    const updated = await editMessage(
      ws,
      sent.id,
      "edited with changes",
      [keepBasename, addBasename],
      [dropBasename],
    )
    expect(updated.text).toBe("edited with changes")
    expect(updated.attachments.map((a) => a.file_id).sort()).toEqual(
      [keepBasename, addBasename].sort(),
    )

    const droppedRows = await client.db
      .select()
      .from(fileAttachments)
      .where(eq(fileAttachments.basename, dropBasename))
    expect(droppedRows).toHaveLength(0)
    expect(existsSync(path.join(FILES_DIR, dropBasename))).toBe(false)

    const keptRows = await client.db
      .select()
      .from(fileAttachments)
      .where(eq(fileAttachments.basename, keepBasename))
    expect(keptRows[0].message_id).toBe(sent.id)

    const addedRows = await client.db
      .select()
      .from(fileAttachments)
      .where(eq(fileAttachments.basename, addBasename))
    expect(addedRows[0].message_id).toBe(sent.id)

    ws.close()
  })

  it("deletes an attachment-only message when its last attachment is removed", async () => {
    const u = await createUser(
      client,
      "edit-removeall@example.com",
      "editremoveall",
    )
    const token = await makeAccessToken("edit-removeall@example.com")
    const roomId = u.room_id
    const senderId = (
      await client.app.inject({
        method: "GET",
        url: "/api/me",
        headers: { authorization: `Bearer ${token}` },
      })
    ).json().id
    const basename = `edit_removeall_${Math.random().toString(36).slice(2)}.txt`
    await seedUnattachedFile(senderId, basename)

    const ws = await openWs(client, `/ws/chat/${roomId}`, token)
    const sent = await sendMessage(ws, "", [basename])
    expect(sent.text).toBe("")

    ws.send(
      JSON.stringify({
        type: "edit_message",
        payload: {
          message_id: sent.id,
          text: "",
          file_ids: [],
          remove_file_ids: [basename],
        },
      }),
    )
    const raw = await receive(ws)
    const data = JSON.parse(raw)
    expect(data.type).toBe("message_by_id_deleted")
    expect(data.payload.message_id).toBe(sent.id)
    expect(existsSync(path.join(FILES_DIR, basename))).toBe(false)

    const msgRows = await client.db
      .select()
      .from(roomMessages)
      .where(eq(roomMessages.id, sent.id))
    expect(msgRows[0].deleted).toBe(true)

    ws.close()
  })

  it("deletes the message when both text and attachments are removed", async () => {
    const u = await createUser(client, "edit-empty@example.com", "editempty")
    const token = await makeAccessToken("edit-empty@example.com")
    const roomId = u.room_id
    const senderId = (
      await client.app.inject({
        method: "GET",
        url: "/api/me",
        headers: { authorization: `Bearer ${token}` },
      })
    ).json().id
    const basename = `edit_empty_${Math.random().toString(36).slice(2)}.txt`
    await seedUnattachedFile(senderId, basename)

    const ws = await openWs(client, `/ws/chat/${roomId}`, token)
    const sent = await sendMessage(ws, "text and file", [basename])

    ws.send(
      JSON.stringify({
        type: "edit_message",
        payload: {
          message_id: sent.id,
          text: "",
          file_ids: [],
          remove_file_ids: [basename],
        },
      }),
    )
    const raw = await receive(ws)
    const data = JSON.parse(raw)
    expect(data.type).toBe("message_by_id_deleted")
    expect(data.payload.message_id).toBe(sent.id)

    const msgRows = await client.db
      .select()
      .from(roomMessages)
      .where(eq(roomMessages.id, sent.id))
    expect(msgRows[0].deleted).toBe(true)

    const rows = await client.db
      .select()
      .from(fileAttachments)
      .where(eq(fileAttachments.basename, basename))
    expect(rows).toHaveLength(0)
    expect(existsSync(path.join(FILES_DIR, basename))).toBe(false)

    ws.close()
  })

  it("rejects editing with another user's file", async () => {
    await createUser(client, "edit-owner@example.com", "editowner")
    const ownerToken = await makeAccessToken("edit-owner@example.com")
    const ownerId = (
      await client.app.inject({
        method: "GET",
        url: "/api/me",
        headers: { authorization: `Bearer ${ownerToken}` },
      })
    ).json().id
    const ownerBasename = `edit_owner_${Math.random().toString(36).slice(2)}.txt`
    await seedUnattachedFile(ownerId, ownerBasename)

    const other = await createUser(
      client,
      "edit-other@example.com",
      "editother",
    )
    const otherToken = await makeAccessToken("edit-other@example.com")
    const roomId = other.room_id
    const otherId = (
      await client.app.inject({
        method: "GET",
        url: "/api/me",
        headers: { authorization: `Bearer ${otherToken}` },
      })
    ).json().id
    const ownBasename = `edit_own_${Math.random().toString(36).slice(2)}.txt`
    await seedUnattachedFile(otherId, ownBasename)

    const ws = await openWs(client, `/ws/chat/${roomId}`, otherToken)
    const sent = await sendMessage(ws, "own file", [ownBasename])

    ws.send(
      JSON.stringify({
        type: "edit_message",
        payload: {
          message_id: sent.id,
          text: "trying to hijack",
          file_ids: [ownBasename, ownerBasename],
        },
      }),
    )
    const raw = await receive(ws)
    const data = JSON.parse(raw)
    expect(data.type).toBe("error")
    expect(data.payload.code).toBe("attach_unknown_file")

    const msgRows = await client.db
      .select()
      .from(roomMessages)
      .where(eq(roomMessages.id, sent.id))
    expect(msgRows[0].file_ids).toEqual([ownBasename])
    expect(msgRows[0].text).toBe("own file")

    ws.close()
  })
})
