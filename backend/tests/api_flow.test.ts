import { and, eq, isNull } from "drizzle-orm"
import type { FastifyInstance } from "fastify"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { DB } from "../src/db/index.js"
import { roomMembers, roomMessages, users } from "../src/db/schema.js"
import { buildTestApp, closeTestApp } from "./setup.js"

describe("api flows", () => {
  let app: FastifyInstance
  let db: DB

  beforeAll(async () => {
    const ctx = await buildTestApp()
    app = ctx.app
    db = ctx.db
  })

  afterAll(async () => {
    await closeTestApp(app)
  })

  async function createUser(email: string, username: string) {
    const res = await app.inject({
      method: "POST",
      url: "/api/test/create_user",
      payload: { email, username, password: "password12345" },
    })
    return res.json() as { access_token: string; room_id: number }
  }

  it("gets /api/me with a valid token", async () => {
    const { access_token: token } = await createUser("me@example.com", "metest")
    const res = await app.inject({
      method: "GET",
      url: "/api/me",
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.email).toBe("me@example.com")
    expect(body.username).toBe("metest")
  })

  it("changes username", async () => {
    const { access_token: token } = await createUser(
      "rename@example.com",
      "renametest",
    )
    const res = await app.inject({
      method: "POST",
      url: "/api/me/username",
      headers: { authorization: `Bearer ${token}` },
      payload: { username: "newname1" },
    })
    expect(res.statusCode).toBe(200)
    const me = await app.inject({
      method: "GET",
      url: "/api/me",
      headers: { authorization: `Bearer ${token}` },
    })
    expect(me.json().username).toBe("newname1")
  })

  it("creates a room and lists it as owner", async () => {
    const { access_token: token } = await createUser(
      "roomowner@example.com",
      "roomowner",
    )
    const res = await app.inject({
      method: "POST",
      url: "/api/rooms",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Test Room" },
    })
    expect(res.statusCode).toBe(200)
    const room = res.json()
    expect(room.name).toBe("Test Room")
    expect(room.is_private).toBe(true)

    // owner membership created
    const memberships = await db
      .select()
      .from(roomMembers)
      .where(
        and(
          eq(roomMembers.room_id, room.id),
          eq(roomMembers.user_id, await roomownerId(db)),
        ),
      )
    expect(memberships.length).toBe(1)
    expect(memberships[0].role).toBe("owner")
  })

  it("fetches empty messages list for the default room", async () => {
    const { access_token: token, room_id: roomId } = await createUser(
      "msg@example.com",
      "msgtest",
    )
    const res = await app.inject({
      method: "GET",
      url: `/api/rooms/${roomId}/messages`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual([])
  })

  it("creates a DM room between two users", async () => {
    const { access_token: tokenA } = await createUser(
      "dma@example.com",
      "dmatest",
    )
    const { access_token: tokenB } = await createUser(
      "dmb@example.com",
      "dmbtest",
    )

    // need user ids
    const userARows = await db
      .select()
      .from(users)
      .where(eq(users.email, "dma@example.com"))
      .limit(1)
    const userBRows = await db
      .select()
      .from(users)
      .where(eq(users.email, "dmb@example.com"))
      .limit(1)

    const res = await app.inject({
      method: "POST",
      url: `/api/dms/${userBRows[0].id}`,
      headers: { authorization: `Bearer ${tokenA}` },
    })
    expect(res.statusCode).toBe(200)
    const dm = res.json()
    expect(dm.is_dm).toBe(true)
    expect(dm.name).toBe("dmbtest")

    // both users are members
    const memberships = await db
      .select()
      .from(roomMembers)
      .where(eq(roomMembers.room_id, dm.id))
    expect(memberships.length).toBe(2)

    // tokenB can view the dm too
    const msgsB = await app.inject({
      method: "GET",
      url: `/api/rooms/${dm.id}/messages`,
      headers: { authorization: `Bearer ${tokenB}` },
    })
    expect(msgsB.statusCode).toBe(200)

    void userARows[0]
  })

  it("hides a DM instead of leaving it", async () => {
    const { access_token: tokenA } = await createUser(
      "hidea@example.com",
      "hideatest",
    )
    const { access_token: tokenB } = await createUser(
      "hideb@example.com",
      "hidebtest",
    )
    const userARows = await db
      .select()
      .from(users)
      .where(eq(users.email, "hidea@example.com"))
      .limit(1)
    const userBRows = await db
      .select()
      .from(users)
      .where(eq(users.email, "hideb@example.com"))
      .limit(1)
    const userA = userARows[0]
    const userB = userBRows[0]

    const dmRes = await app.inject({
      method: "POST",
      url: `/api/dms/${userB.id}`,
      headers: { authorization: `Bearer ${tokenA}` },
    })
    expect(dmRes.statusCode).toBe(200)
    const dm = dmRes.json() as { id: number }

    const leaveRes = await app.inject({
      method: "DELETE",
      url: `/api/rooms/${dm.id}/members/${userA.id}`,
      headers: { authorization: `Bearer ${tokenA}` },
    })
    expect(leaveRes.statusCode).toBe(200)

    // membership is kept, but flagged as hidden for user A
    const membership = await db
      .select()
      .from(roomMembers)
      .where(
        and(eq(roomMembers.room_id, dm.id), eq(roomMembers.user_id, userA.id)),
      )
    expect(membership.length).toBe(1)
    expect(membership[0].hidden).toBe(true)

    // no "left" system message is broadcast to the peer
    const sysMsgs = await db
      .select()
      .from(roomMessages)
      .where(
        and(eq(roomMessages.room_id, dm.id), isNull(roomMessages.sender_id)),
      )
    expect(sysMsgs.length).toBe(0)

    // user B still sees the DM
    const msgsB = await app.inject({
      method: "GET",
      url: `/api/rooms/${dm.id}/messages`,
      headers: { authorization: `Bearer ${tokenB}` },
    })
    expect(msgsB.statusCode).toBe(200)

    // reopening the DM clears the hidden flag
    const reopenRes = await app.inject({
      method: "POST",
      url: `/api/dms/${userB.id}`,
      headers: { authorization: `Bearer ${tokenA}` },
    })
    expect(reopenRes.statusCode).toBe(200)
    const afterReopen = await db
      .select()
      .from(roomMembers)
      .where(
        and(eq(roomMembers.room_id, dm.id), eq(roomMembers.user_id, userA.id)),
      )
    expect(afterReopen[0].hidden).toBe(false)
  })

  it("searches users by username", async () => {
    const { access_token: token } = await createUser(
      "search@example.com",
      "searchuser",
    )
    const res = await app.inject({
      method: "GET",
      url: "/api/users/search?q=searc",
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const results = res.json() as { username: string }[]
    expect(results.some((r) => r.username === "searchuser")).toBe(true)
  })
})

async function roomownerId(db: DB): Promise<number> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, "roomowner@example.com"))
    .limit(1)
  return rows[0].id
}
