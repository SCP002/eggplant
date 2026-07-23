import { eq } from "drizzle-orm"
import type { FastifyInstance } from "fastify"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { DB } from "../src/db/index.js"
import { notifications, users } from "../src/db/schema.js"
import { buildTestApp, closeTestApp } from "./setup.js"

describe("room invitation notifications", () => {
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
    return res.json() as {
      access_token: string
      room_id: number
    }
  }

  async function userIdOf(email: string): Promise<number> {
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1)
    return rows[0].id
  }

  it("delivers an invitation notification to an offline user via the API", async () => {
    const owner = await createUser("notifyowner@example.com", "notifyowner")
    const invitee = await createUser(
      "notifyinvitee@example.com",
      "notifyinvitee",
    )

    const roomRes = await app.inject({
      method: "POST",
      url: "/api/rooms",
      headers: { authorization: `Bearer ${owner.access_token}` },
      payload: { name: "Notification Room" },
    })
    expect(roomRes.statusCode).toBe(200)
    const room = roomRes.json() as { id: number; name: string }

    const inviteeId = await userIdOf("notifyinvitee@example.com")
    const inviteRes = await app.inject({
      method: "POST",
      url: `/api/rooms/${room.id}/invitations`,
      headers: { authorization: `Bearer ${owner.access_token}` },
      payload: { invitee_id: inviteeId },
    })
    expect(inviteRes.statusCode).toBe(200)
    const invitation = inviteRes.json() as { id: number; token: string }

    const listRes = await app.inject({
      method: "GET",
      url: "/api/notifications",
      headers: { authorization: `Bearer ${invitee.access_token}` },
    })
    expect(listRes.statusCode).toBe(200)
    const list = listRes.json() as {
      title: string
      type: string
      params: Record<string, unknown> | null
      action_token: string
      invitation_id: number
      importance: string
    }[]
    expect(list).toHaveLength(1)
    expect(list[0].type).toBe("room_invitation")
    expect(list[0].params).toEqual({
      username: "notifyowner",
      roomName: "Notification Room",
    })
    expect(list[0].action_token).toBe(invitation.token)
    expect(list[0].importance).toBe("normal")

    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.user_id, inviteeId))
    expect(rows).toHaveLength(1)
    expect(rows[0].invitation_id).toBe(invitation.id)
  })

  it("dismisses a notification by token", async () => {
    const owner = await createUser("notifyowner2@example.com", "notifyowner2")
    const invitee = await createUser(
      "notifyinvitee2@example.com",
      "notifyinvitee2",
    )

    const roomRes = await app.inject({
      method: "POST",
      url: "/api/rooms",
      headers: { authorization: `Bearer ${owner.access_token}` },
      payload: { name: "Dismiss Room" },
    })
    const room = roomRes.json() as { id: number }

    const inviteeId = await userIdOf("notifyinvitee2@example.com")
    const inviteRes = await app.inject({
      method: "POST",
      url: `/api/rooms/${room.id}/invitations`,
      headers: { authorization: `Bearer ${owner.access_token}` },
      payload: { invitee_id: inviteeId },
    })
    const invitation = inviteRes.json() as { token: string }

    const delRes = await app.inject({
      method: "DELETE",
      url: `/api/notifications/token/${invitation.token}`,
      headers: { authorization: `Bearer ${invitee.access_token}` },
    })
    expect(delRes.statusCode).toBe(200)

    const listRes = await app.inject({
      method: "GET",
      url: "/api/notifications",
      headers: { authorization: `Bearer ${invitee.access_token}` },
    })
    expect(listRes.json()).toEqual([])
  })

  it("clears the notification when the invitation is accepted", async () => {
    const owner = await createUser("notifyowner3@example.com", "notifyowner3")
    const invitee = await createUser(
      "notifyinvitee3@example.com",
      "notifyinvitee3",
    )

    const roomRes = await app.inject({
      method: "POST",
      url: "/api/rooms",
      headers: { authorization: `Bearer ${owner.access_token}` },
      payload: { name: "Accept Room" },
    })
    const room = roomRes.json() as { id: number }

    const inviteeId = await userIdOf("notifyinvitee3@example.com")
    const inviteRes = await app.inject({
      method: "POST",
      url: `/api/rooms/${room.id}/invitations`,
      headers: { authorization: `Bearer ${owner.access_token}` },
      payload: { invitee_id: inviteeId },
    })
    const invitation = inviteRes.json() as { token: string }

    const acceptRes = await app.inject({
      method: "POST",
      url: `/api/invitations/${invitation.token}/accept`,
      headers: { authorization: `Bearer ${invitee.access_token}` },
    })
    expect(acceptRes.statusCode).toBe(200)

    const listRes = await app.inject({
      method: "GET",
      url: "/api/notifications",
      headers: { authorization: `Bearer ${invitee.access_token}` },
    })
    expect(listRes.json()).toEqual([])
  })

  it("does not create a notification for global invitations", async () => {
    const owner = await createUser("notifyowner4@example.com", "notifyowner4")
    const invitee = await createUser(
      "notifyinvitee4@example.com",
      "notifyinvitee4",
    )

    const roomRes = await app.inject({
      method: "POST",
      url: "/api/rooms",
      headers: { authorization: `Bearer ${owner.access_token}` },
      payload: { name: "Global Room" },
    })
    const room = roomRes.json() as { id: number }

    const inviteRes = await app.inject({
      method: "POST",
      url: `/api/rooms/${room.id}/invitations`,
      headers: { authorization: `Bearer ${owner.access_token}` },
      payload: {},
    })
    expect(inviteRes.statusCode).toBe(200)

    const listRes = await app.inject({
      method: "GET",
      url: "/api/notifications",
      headers: { authorization: `Bearer ${invitee.access_token}` },
    })
    expect(listRes.json()).toEqual([])
  })
})
