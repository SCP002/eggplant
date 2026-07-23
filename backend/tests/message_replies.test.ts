import { and, eq } from "drizzle-orm"
import type { FastifyInstance } from "fastify"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import WebSocket from "ws"
import type { DB } from "../src/db/index.js"
import { roomMembers, roomMessages, users } from "../src/db/schema.js"
import { USER_JWT_SECRET } from "../src/lib/config.js"
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

describe("message replies over websocket", () => {
  let client: Ctx

  beforeAll(async () => {
    const ctx = await buildTestApp()
    const url = await listenApp(ctx.app)
    client = { app: ctx.app, url, db: ctx.db }
  })

  afterAll(async () => {
    await closeTestApp(client.app)
  })

  it("rejects reply to deleted parent", async () => {
    const u = await createUser(
      client,
      "reply-deleted@example.com",
      "replydeleted",
    )
    const token = await makeAccessToken("reply-deleted@example.com")
    const roomId = u.room_id

    const parent = await client.db
      .insert(roomMessages)
      .values({
        room_id: roomId,
        sender_id: null,
        text: "parent",
        deleted: true,
      })
      .returning()

    const ws = await openWs(client, `/ws/chat/${roomId}`, token)
    ws.send(
      JSON.stringify({
        type: "message",
        payload: { text: "reply", parent_id: parent[0].id },
      }),
    )
    const raw = await receive(ws)
    const data = JSON.parse(raw)
    expect(data.type).toBe("error")
    expect(data.payload.code).toBe("reply_to_deleted_message")
    ws.close()
  })

  it("rejects reply to system message", async () => {
    const u = await createUser(
      client,
      "reply-system@example.com",
      "replysystem",
    )
    const token = await makeAccessToken("reply-system@example.com")
    const roomId = u.room_id

    const parent = await client.db
      .insert(roomMessages)
      .values({ room_id: roomId, sender_id: null, text: "system" })
      .returning()

    const ws = await openWs(client, `/ws/chat/${roomId}`, token)
    ws.send(
      JSON.stringify({
        type: "message",
        payload: { text: "reply", parent_id: parent[0].id },
      }),
    )
    const raw = await receive(ws)
    const data = JSON.parse(raw)
    expect(data.type).toBe("error")
    expect(data.payload.code).toBe("reply_to_system_message")
    ws.close()
  })

  it("returns parent preview on successful reply", async () => {
    const u = await createUser(client, "reply-ok@example.com", "replyok")
    const token = await makeAccessToken("reply-ok@example.com")
    const roomId = u.room_id
    const senderId = await userIdOf(client, "reply-ok@example.com")

    const parent = await client.db
      .insert(roomMessages)
      .values({ room_id: roomId, sender_id: senderId, text: "parent text" })
      .returning()

    const ws = await openWs(client, `/ws/chat/${roomId}`, token)
    ws.send(
      JSON.stringify({
        type: "message",
        payload: { text: "reply", parent_id: parent[0].id },
      }),
    )
    const raw = await receive(ws)
    const data = JSON.parse(raw)
    expect(data.type).toBe("new_message")
    expect(data.payload.parent_id).toBe(parent[0].id)
    expect(data.payload.parent.id).toBe(parent[0].id)
    ws.close()
  })

  it("reopens a hidden DM for the recipient on a new message", async () => {
    const a = await createUser(client, "unhide-a@example.com", "unhideatest")
    const b = await createUser(client, "unhide-b@example.com", "unhidebtest")
    const userB = await userIdOf(client, "unhide-b@example.com")

    const dmRes = await client.app.inject({
      method: "POST",
      url: `/api/dms/${userB}`,
      headers: { authorization: `Bearer ${a.access_token}` },
    })
    expect(dmRes.statusCode).toBe(200)
    const dmId = (dmRes.json() as { id: number }).id
    const userA = await userIdOf(client, "unhide-a@example.com")

    // A hides the DM
    const hideRes = await client.app.inject({
      method: "DELETE",
      url: `/api/rooms/${dmId}/members/${userA}`,
      headers: { authorization: `Bearer ${a.access_token}` },
    })
    expect(hideRes.statusCode).toBe(200)
    const hiddenRow = await client.db
      .select()
      .from(roomMembers)
      .where(and(eq(roomMembers.room_id, dmId), eq(roomMembers.user_id, userA)))
    expect(hiddenRow[0].hidden).toBe(true)

    // B sends a message in the DM
    const ws = await openWs(client, `/ws/chat/${dmId}`, b.access_token)
    ws.send(
      JSON.stringify({
        type: "message",
        payload: { text: "hello again" },
      }),
    )
    const raw = await receive(ws)
    expect(JSON.parse(raw).type).toBe("new_message")

    // A's membership is un-hidden so the DM reappears in their list
    await waitForHidden(client, dmId, userA, false)
    ws.close()
  })
})

async function userIdOf(client: Ctx, email: string): Promise<number> {
  const rows = await client.db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1)
  return rows[0].id
}

async function waitForHidden(
  client: Ctx,
  roomId: number,
  userId: number,
  expected: boolean,
): Promise<void> {
  for (let i = 0; i < 40; i++) {
    const rows = await client.db
      .select()
      .from(roomMembers)
      .where(
        and(eq(roomMembers.room_id, roomId), eq(roomMembers.user_id, userId)),
      )
    if (rows.length > 0 && rows[0].hidden === expected) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error("timed out waiting for hidden flag")
}
