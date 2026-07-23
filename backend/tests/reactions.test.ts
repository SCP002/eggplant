import { eq } from "drizzle-orm"
import type { FastifyInstance } from "fastify"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import WebSocket from "ws"
import type { DB } from "../src/db/index.js"
import { users } from "../src/db/schema.js"
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

async function createUser(client: Ctx, email: string, username: string) {
  const res = await client.app.inject({
    method: "POST",
    url: "/api/test/create_user",
    payload: { email, username, password: "password12345" },
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

describe("message reactions over websocket", () => {
  let client: Ctx

  beforeAll(async () => {
    const ctx = await buildTestApp()
    const url = await listenApp(ctx.app)
    client = { app: ctx.app, url, db: ctx.db }
  })

  afterAll(async () => {
    await closeTestApp(client.app)
  })

  async function sendMessage(
    ws: WebSocket,
    text: string,
  ): Promise<{ id: number }> {
    ws.send(JSON.stringify({ type: "message", payload: { text } }))
    const raw = await receive(ws)
    const data = JSON.parse(raw)
    expect(data.type).toBe("new_message")
    return data.payload as { id: number }
  }

  it("toggles a single user reaction on and off", async () => {
    const u = await createUser(client, "reaction1@example.com", "reaction1")
    const token = await makeAccessToken("reaction1@example.com")
    const roomId = u.room_id
    const userId = await userIdOf(client, "reaction1@example.com")

    const ws = await openWs(client, `/ws/chat/${roomId}`, token)
    const message = await sendMessage(ws, "react me")

    ws.send(
      JSON.stringify({
        type: "react",
        payload: { message_id: message.id, emoji: "👍" },
      }),
    )
    const added = JSON.parse(await receive(ws))
    expect(added.type).toBe("reactions_updated")
    expect(added.payload.message_id).toBe(message.id)
    expect(added.payload.reactions).toHaveLength(1)
    expect(added.payload.reactions[0].emoji).toBe("👍")
    expect(added.payload.reactions[0].users).toEqual([
      expect.objectContaining({ id: userId, username: "reaction1" }),
    ])

    ws.send(
      JSON.stringify({
        type: "react",
        payload: { message_id: message.id, emoji: "👍" },
      }),
    )
    const removed = JSON.parse(await receive(ws))
    expect(removed.type).toBe("reactions_updated")
    expect(removed.payload.message_id).toBe(message.id)
    expect(removed.payload.reactions).toHaveLength(0)

    ws.close()
  })

  it("tracks multiple users and only removes the toggling user's reaction", async () => {
    const uA = await createUser(client, "reaction2a@example.com", "reaction2a")
    await createUser(client, "reaction2b@example.com", "reaction2b")
    const roomId = uA.room_id
    const userAId = await userIdOf(client, "reaction2a@example.com")
    const userBId = await userIdOf(client, "reaction2b@example.com")

    const tokenA = await makeAccessToken("reaction2a@example.com")
    const tokenB = await makeAccessToken("reaction2b@example.com")
    const wsA = await openWs(client, `/ws/chat/${roomId}`, tokenA)
    const wsB = await openWs(client, `/ws/chat/${roomId}`, tokenB)

    const message = await sendMessage(wsA, "react for two")

    const react = (ws: WebSocket, emoji: string) =>
      ws.send(
        JSON.stringify({
          type: "react",
          payload: { message_id: message.id, emoji },
        }),
      )

    react(wsA, "🎉")
    const first = JSON.parse(await receive(wsA))
    expect(first.type).toBe("reactions_updated")
    expect(first.payload.reactions).toHaveLength(1)

    react(wsB, "🎉")
    // B receives the update; A also receives it since the broadcast goes to
    // everyone in the room.
    const bAdded = JSON.parse(await receive(wsB))
    expect(bAdded.payload.reactions).toHaveLength(1)
    const aAdded = JSON.parse(await receive(wsA))
    expect(
      aAdded.payload.reactions[0].users.map((u: { id: number }) => u.id).sort(),
    ).toEqual([userAId, userBId].sort())

    react(wsA, "🎉")
    const aRemoved = JSON.parse(await receive(wsA))
    expect(aRemoved.payload.reactions).toHaveLength(1)
    expect(aRemoved.payload.reactions[0].users).toEqual([
      expect.objectContaining({ id: userBId, username: "reaction2b" }),
    ])

    wsA.close()
    wsB.close()
  })

  it("rejects reactions to messages that do not exist", async () => {
    const u = await createUser(client, "reaction3@example.com", "reaction3")
    const token = await makeAccessToken("reaction3@example.com")
    const roomId = u.room_id

    const ws = await openWs(client, `/ws/chat/${roomId}`, token)
    ws.send(
      JSON.stringify({
        type: "react",
        payload: { message_id: 999999, emoji: "👍" },
      }),
    )
    const raw = await receive(ws)
    const data = JSON.parse(raw)
    expect(data.type).toBe("error")
    expect(data.payload.code).toBe("message_not_found")
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
