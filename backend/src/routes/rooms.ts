import { randomUUID } from "crypto"
import { mkdirSync, rmSync } from "fs"
import path from "path"
import { getDb } from "@/db/index"
import { dmRoomName, isDm } from "@/db/queries"
import {
  roomInvitations,
  roomMembers,
  roomMessages,
  rooms,
  users,
  type Room as RoomRow,
} from "@/db/schema"
import { ROOM_AVATAR_DIR } from "@/lib/constants"
import {
  collectRoomMessageFiles,
  deleteFileAttachmentRows,
  deleteFilesOnDisk,
} from "@/lib/files"
import { httpError } from "@/lib/httpError"
import { buildMessageResp } from "@/lib/messages"
import { createNotification } from "@/lib/notifications"
import { extractBearerToken } from "@/lib/requestAuth"
import { systemMessage } from "@/lib/systemMessages"
import {
  httpGetMembership,
  httpGetUser,
  ownerOrAdminGuard,
} from "@/lib/validate"
import { parseOrThrow } from "@/routes/helpers"
import { broadcastToRoom, broadcastToUserSockets } from "@/ws/manager"
import { broadcastRoomsListToUser, sendRoomMembers } from "@/ws/rooms"
import {
  changeMemberRoleFormSchema,
  createInvitationFormSchema,
  createRoomFormSchema,
  updateRoomFormSchema,
} from "@eggplant/shared/api"
import type { RoomInvitationResp, RoomResp } from "@eggplant/shared/api"
import { and, eq, inArray, isNull } from "drizzle-orm"
import type { FastifyInstance } from "fastify"
import sharp from "sharp"

export async function registerRoomsRoutes(
  router: FastifyInstance,
): Promise<void> {
  const db = getDb()

  router.post("/api/dms/:recipientId", async (request) => {
    const { recipientId } = request.params as { recipientId: string }
    const recipientIdNum = Number(recipientId)
    const user = await httpGetUser(db, extractBearerToken(request))

    if (recipientIdNum === user.id) throw httpError(400, "dm_with_self")

    const recipientRows = await db
      .select()
      .from(users)
      .where(eq(users.id, recipientIdNum))
      .limit(1)
    if (recipientRows.length === 0) throw httpError(404, "recipient_not_found")
    const recipient = recipientRows[0]

    const lowId = Math.min(user.id, recipientIdNum)
    const highId = Math.max(user.id, recipientIdNum)

    const roomRows = await db
      .select()
      .from(rooms)
      .where(
        and(eq(rooms.dm_user_low_id, lowId), eq(rooms.dm_user_high_id, highId)),
      )
      .limit(1)
    let room = roomRows[0] as RoomRow | undefined

    if (!room) {
      const created = await db
        .insert(rooms)
        .values({
          name: dmRoomName(lowId, highId),
          is_private: true,
          is_general: false,
          owner_id: null,
          dm_user_low_id: lowId,
          dm_user_high_id: highId,
        })
        .returning()
      room = created[0] as RoomRow
    }

    for (const uid of [user.id, recipientIdNum]) {
      const existing = await db
        .select()
        .from(roomMembers)
        .where(
          and(eq(roomMembers.room_id, room.id), eq(roomMembers.user_id, uid)),
        )
        .limit(1)
      if (existing.length === 0) {
        await db.insert(roomMembers).values({
          room_id: room.id,
          user_id: uid,
          role: "member",
          status: "active",
        })
      }
    }

    await db
      .update(roomMembers)
      .set({ hidden: false })
      .where(
        and(eq(roomMembers.room_id, room.id), eq(roomMembers.user_id, user.id)),
      )

    await broadcastRoomsListToUser(db, user.id)
    await broadcastRoomsListToUser(db, recipientIdNum)

    const resp: RoomResp = {
      id: room.id,
      name: recipient.username,
      is_general: room.is_general,
      is_dm: isDm(room),
      is_private: room.is_private,
      owner_id: room.owner_id,
      unread_count: 0,
      last_read_message_id: null,
      avatar_url: room.avatar_url,
    }
    return resp
  })

  router.post("/api/rooms", async (request, reply) => {
    const user = await httpGetUser(db, extractBearerToken(request))

    let name: string
    let file: Awaited<ReturnType<typeof request.file>> | null = null
    const isMultipart = request.isMultipart()
    if (isMultipart) {
      const fields = await request.parts()
      let nameValue: string | null = null
      let avatarFile: Awaited<ReturnType<typeof request.file>> | null = null
      for await (const part of fields) {
        if (part.type === "field" && part.fieldname === "name") {
          nameValue = typeof part.value === "string" ? part.value : ""
        } else if (part.type === "file") {
          avatarFile = part
          await part.toBuffer()
        }
      }
      name = nameValue ?? ""
      file = avatarFile
    } else {
      const body = (request.body ?? {}) as Record<string, unknown>
      name = String(body.name ?? "")
    }

    name = name.trim()
    parseOrThrow(createRoomFormSchema, { name })

    let avatarUrl: string | null = null
    if (file && file.filename) {
      try {
        mkdirSync(ROOM_AVATAR_DIR, { recursive: true })
        const dot = file.filename.lastIndexOf(".")
        const ext = dot > 0 ? file.filename.slice(dot).toLowerCase() : ""
        const destName = `${Math.floor(Date.now() / 1000)}_${randomHex(8)}${ext}`
        const destPath = path.join(ROOM_AVATAR_DIR, destName)
        const buf = Buffer.from(await file.toBuffer())
        await sharp(buf)
          .resize(512, 512, { fit: "inside", withoutEnlargement: true })
          .toFile(destPath)
        avatarUrl = `/uploads/avatars/rooms/${destName}`
      } finally {
        // multipart file already consumed
      }
    }

    const createdRoom = await db
      .insert(rooms)
      .values({
        name,
        is_private: true,
        is_general: false,
        owner_id: user.id,
        avatar_url: avatarUrl,
      })
      .returning()
    const room = createdRoom[0] as RoomRow

    await db.insert(roomMembers).values({
      room_id: room.id,
      user_id: user.id,
      role: "owner",
      status: "active",
    })

    await broadcastRoomsListToUser(db, user.id)

    const resp: RoomResp = {
      id: room.id,
      name: room.name,
      is_general: room.is_general,
      is_dm: false,
      is_private: room.is_private,
      owner_id: room.owner_id,
      unread_count: 0,
      last_read_message_id: null,
      avatar_url: room.avatar_url,
    }
    return reply.send(resp)
  })

  router.put("/api/rooms/:roomId", async (request) => {
    const { roomId } = request.params as { roomId: string }
    const rid = Number(roomId)
    const user = await httpGetUser(db, extractBearerToken(request))
    await ownerOrAdminGuard(db, user.id, rid)

    const roomRows = await db
      .select()
      .from(rooms)
      .where(eq(rooms.id, rid))
      .limit(1)
    if (roomRows.length === 0) throw httpError(404, "room_not_found")
    const room = roomRows[0] as RoomRow
    if (room.is_general) throw httpError(400, "general_room_not_editable")

    let nameField: string | undefined
    let avatarFile: Awaited<ReturnType<typeof request.file>> | null = null

    if (request.isMultipart()) {
      for await (const part of request.parts()) {
        if (part.type === "field" && part.fieldname === "name") {
          nameField = typeof part.value === "string" ? part.value : ""
        } else if (part.type === "file") {
          avatarFile = part
          await part.toBuffer()
        }
      }
    } else {
      const body = (request.body ?? {}) as Record<string, unknown>
      if (body.name !== undefined && body.name !== null)
        nameField = String(body.name)
    }

    if (nameField !== undefined) {
      nameField = nameField.trim()
      parseOrThrow(updateRoomFormSchema, { name: nameField })
      if (nameField !== room.name) {
        const renamed = await db
          .update(rooms)
          .set({ name: nameField })
          .where(eq(rooms.id, rid))
          .returning()
        const updatedRoom = renamed[0] as RoomRow
        const systemMsg = await db
          .insert(roomMessages)
          .values({
            room_id: rid,
            sender_id: null,
            text: systemMessage("renamed", { name: updatedRoom.name }),
            system_user_id: user.id,
          })
          .returning()
        const msg = systemMsg[0]
        await broadcastToRoom(rid, {
          type: "new_message",
          payload: buildMessageResp(msg, {
            systemUser: user,
          }),
        })
      }
    }

    if (avatarFile && avatarFile.filename) {
      try {
        if (room.avatar_url) {
          rmSync(path.join(ROOM_AVATAR_DIR, path.basename(room.avatar_url)), {
            force: true,
          })
        }
        mkdirSync(ROOM_AVATAR_DIR, { recursive: true })
        const dot = avatarFile.filename.lastIndexOf(".")
        const ext = dot > 0 ? avatarFile.filename.slice(dot).toLowerCase() : ""
        const destName = `${Math.floor(Date.now() / 1000)}_${randomHex(8)}${ext}`
        const destPath = path.join(ROOM_AVATAR_DIR, destName)
        const buf = Buffer.from(await avatarFile.toBuffer())
        await sharp(buf)
          .resize(512, 512, { fit: "inside", withoutEnlargement: true })
          .toFile(destPath)
        await db
          .update(rooms)
          .set({ avatar_url: `/uploads/avatars/rooms/${destName}` })
          .where(eq(rooms.id, rid))
        const systemMsg = await db
          .insert(roomMessages)
          .values({
            room_id: rid,
            sender_id: null,
            text: systemMessage("avatar"),
            system_user_id: user.id,
          })
          .returning()
        await broadcastToRoom(rid, {
          type: "new_message",
          payload: buildMessageResp(systemMsg[0], { systemUser: user }),
        })
      } finally {
        // consumed
      }
    }

    const finalRoom = (
      await db.select().from(rooms).where(eq(rooms.id, rid)).limit(1)
    )[0] as RoomRow

    const memberRows = await db
      .select()
      .from(roomMembers)
      .where(eq(roomMembers.room_id, rid))
    for (const member of memberRows) {
      await broadcastRoomsListToUser(db, member.user_id)
    }

    const resp: RoomResp = {
      id: finalRoom.id,
      name: finalRoom.name,
      is_general: finalRoom.is_general,
      is_dm: false,
      is_private: finalRoom.is_private,
      owner_id: finalRoom.owner_id,
      unread_count: 0,
      last_read_message_id: null,
      avatar_url: finalRoom.avatar_url,
    }
    return resp
  })

  router.delete("/api/rooms/:roomId", async (request) => {
    const { roomId } = request.params as { roomId: string }
    const rid = Number(roomId)
    const user = await httpGetUser(db, extractBearerToken(request))
    await ownerOrAdminGuard(db, user.id, rid)

    const roomRows = await db
      .select()
      .from(rooms)
      .where(eq(rooms.id, rid))
      .limit(1)
    if (roomRows.length === 0) throw httpError(404, "room_not_found")
    const room = roomRows[0] as RoomRow
    if (room.is_general) throw httpError(400, "general_room_not_deletable")

    const memberRows = await db
      .select()
      .from(roomMembers)
      .where(eq(roomMembers.room_id, rid))
    const memberIds = memberRows.map((m) => m.user_id)

    const avatarFile = room.avatar_url
      ? path.join(ROOM_AVATAR_DIR, path.basename(room.avatar_url))
      : null

    const messageFiles = await collectRoomMessageFiles(db, rid)
    await db.transaction(async (tx) => {
      await deleteFileAttachmentRows(tx, messageFiles)
      await tx.delete(rooms).where(eq(rooms.id, rid))
    })
    deleteFilesOnDisk(messageFiles)
    if (avatarFile) {
      rmSync(avatarFile, { force: true })
    }

    const payload = { room_id: rid }
    await broadcastToRoom(rid, { type: "room_deleted", payload })

    await db.delete(rooms).where(eq(rooms.id, rid))

    for (const uid of memberIds) {
      await broadcastRoomsListToUser(db, uid)
    }
    return undefined
  })

  router.delete("/api/rooms/:roomId/members/:userId", async (request) => {
    const { roomId, userId } = request.params as {
      roomId: string
      userId: string
    }
    const rid = Number(roomId)
    const targetUid = Number(userId)
    const actor = await httpGetUser(db, extractBearerToken(request))

    if (actor.id !== targetUid) {
      await ownerOrAdminGuard(db, actor.id, rid)
    }

    const targetRows = await db
      .select()
      .from(roomMembers)
      .where(
        and(eq(roomMembers.room_id, rid), eq(roomMembers.user_id, targetUid)),
      )
      .limit(1)
    if (targetRows.length === 0) throw httpError(404, "member_not_found")

    const roomRows = await db
      .select()
      .from(rooms)
      .where(eq(rooms.id, rid))
      .limit(1)
    if (roomRows.length > 0 && roomRows[0].is_general) {
      throw httpError(400, "general_room_remove_forbidden")
    }

    const isSelfLeave = actor.id === targetUid
    const roomIsDm = roomRows.length > 0 && isDm(roomRows[0])

    if (roomIsDm && isSelfLeave) {
      await db
        .update(roomMembers)
        .set({ hidden: true })
        .where(
          and(eq(roomMembers.room_id, rid), eq(roomMembers.user_id, targetUid)),
        )
      await broadcastRoomsListToUser(db, targetUid)
      return undefined
    }

    const targetUser = (
      await db.select().from(users).where(eq(users.id, targetUid)).limit(1)
    )[0]
    await db
      .delete(roomMembers)
      .where(
        and(eq(roomMembers.room_id, rid), eq(roomMembers.user_id, targetUid)),
      )

    const systemMsg = await db
      .insert(roomMessages)
      .values({
        room_id: rid,
        sender_id: null,
        text: systemMessage(isSelfLeave ? "left" : "removed"),
        system_user_id: targetUid,
      })
      .returning()

    await broadcastToRoom(rid, {
      type: "new_message",
      payload: buildMessageResp(systemMsg[0], { systemUser: targetUser }),
    })
    await broadcastRoomsListToUser(db, targetUid)
    await broadcastRoomsListToUser(db, actor.id)
    await sendRoomMembers(db, rid)
    return undefined
  })

  router.put("/api/rooms/:roomId/members/:userId/role", async (request) => {
    const { roomId, userId } = request.params as {
      roomId: string
      userId: string
    }
    const rid = Number(roomId)
    const targetUid = Number(userId)
    const actor = await httpGetUser(db, extractBearerToken(request))
    const membership = await httpGetMembership(db, actor.id, rid)

    if (membership.role !== "owner") {
      throw httpError(403, "role_change_owner_only")
    }

    const { role } = parseOrThrow(changeMemberRoleFormSchema, request.body)

    const targetRows = await db
      .select()
      .from(roomMembers)
      .where(
        and(eq(roomMembers.room_id, rid), eq(roomMembers.user_id, targetUid)),
      )
      .limit(1)
    if (targetRows.length === 0) throw httpError(404, "member_not_found")

    await db
      .update(roomMembers)
      .set({ role })
      .where(
        and(eq(roomMembers.room_id, rid), eq(roomMembers.user_id, targetUid)),
      )

    const targetUser = (
      await db.select().from(users).where(eq(users.id, targetUid)).limit(1)
    )[0]
    const systemMsg = await db
      .insert(roomMessages)
      .values({
        room_id: rid,
        sender_id: null,
        text: systemMessage("role", { role }),
        system_user_id: targetUid,
      })
      .returning()

    await broadcastToRoom(rid, {
      type: "new_message",
      payload: buildMessageResp(systemMsg[0], { systemUser: targetUser }),
    })
    await sendRoomMembers(db, rid)
    return undefined
  })

  router.post("/api/rooms/:roomId/invitations", async (request) => {
    const { roomId } = request.params as { roomId: string }
    const rid = Number(roomId)
    const user = await httpGetUser(db, extractBearerToken(request))
    await ownerOrAdminGuard(db, user.id, rid)

    const { invitee_id } = parseOrThrow(
      createInvitationFormSchema,
      request.body,
    )
    const inviteeId = invitee_id ?? null
    const isGlobal = inviteeId === null

    const roomRows = await db
      .select()
      .from(rooms)
      .where(eq(rooms.id, rid))
      .limit(1)
    if (roomRows.length === 0) throw httpError(404, "room_not_found")
    const room = roomRows[0] as RoomRow

    let invitee: typeof users.$inferSelect | undefined
    if (inviteeId !== null) {
      const inviteeRows = await db
        .select()
        .from(users)
        .where(eq(users.id, inviteeId))
        .limit(1)
      if (inviteeRows.length === 0) throw httpError(404, "user_not_found")
      invitee = inviteeRows[0]
      const existingMember = await db
        .select()
        .from(roomMembers)
        .where(
          and(
            eq(roomMembers.room_id, rid),
            eq(roomMembers.user_id, inviteeId),
            eq(roomMembers.status, "active"),
          ),
        )
        .limit(1)
      if (existingMember.length > 0) {
        throw httpError(400, "user_already_member")
      }
    }

    const existingInv = await db
      .select()
      .from(roomInvitations)
      .where(
        and(
          eq(roomInvitations.room_id, rid),
          inviteeId !== null
            ? eq(roomInvitations.invitee_id, inviteeId)
            : isNull(roomInvitations.invitee_id),
          eq(roomInvitations.is_global, isGlobal),
        ),
      )
      .limit(1)
    if (existingInv.length > 0) {
      await db
        .delete(roomInvitations)
        .where(eq(roomInvitations.id, existingInv[0].id))
    }

    const token = randomUUID().replace(/-/g, "")
    const created = await db
      .insert(roomInvitations)
      .values({
        room_id: rid,
        inviter_id: user.id,
        invitee_id: inviteeId,
        token,
        is_global: isGlobal,
      })
      .returning()
    const invitation = created[0]

    if (inviteeId !== null) {
      await createNotification(db, {
        userId: inviteeId,
        invitationId: invitation.id,
        type: "room_invitation",
        params: { username: user.username, roomName: room.name },
        importance: "normal",
        actionToken: token,
      })
      await broadcastToUserSockets(inviteeId, {
        type: "room_invitation_received",
        payload: {
          id: invitation.id,
          room_id: rid,
          room_name: room.name,
          inviter_id: user.id,
          inviter_username: user.username,
          inviter_avatar_url: user.avatar_url,
          invitee_id: inviteeId,
          invitee_username: invitee?.username ?? null,
          token,
          is_global: isGlobal,
          created_at: invitation.created_at.toISOString(),
        },
      })
    }

    const resp: RoomInvitationResp = {
      id: invitation.id,
      room_id: rid,
      room_name: room.name,
      inviter_id: user.id,
      inviter_username: user.username,
      inviter_avatar_url: user.avatar_url,
      invitee_id: inviteeId,
      invitee_username: invitee?.username ?? null,
      token,
      is_global: isGlobal,
      created_at: invitation.created_at.toISOString(),
    }
    return resp
  })

  router.post("/api/invitations/:token/accept", async (request) => {
    const { token } = request.params as { token: string }
    const user = await httpGetUser(db, extractBearerToken(request))

    const invRows = await db
      .select()
      .from(roomInvitations)
      .where(eq(roomInvitations.token, token))
      .limit(1)
    if (invRows.length === 0) throw httpError(404, "invitation_not_found")
    const invitation = invRows[0]

    if (!invitation.is_global && invitation.invitee_id !== user.id) {
      throw httpError(403, "invitation_wrong_user")
    }

    const roomRows = await db
      .select()
      .from(rooms)
      .where(eq(rooms.id, invitation.room_id))
      .limit(1)
    if (roomRows.length === 0) {
      await db
        .delete(roomInvitations)
        .where(eq(roomInvitations.id, invitation.id))
      throw httpError(404, "room_deleted")
    }
    const room = roomRows[0] as RoomRow

    const existingMember = await db
      .select()
      .from(roomMembers)
      .where(
        and(eq(roomMembers.room_id, room.id), eq(roomMembers.user_id, user.id)),
      )
      .limit(1)

    if (existingMember.length > 0) {
      if (existingMember[0].status === "banned") {
        await db
          .delete(roomInvitations)
          .where(eq(roomInvitations.id, invitation.id))
        throw httpError(403, "banned_from_room")
      }
      await db
        .delete(roomInvitations)
        .where(eq(roomInvitations.id, invitation.id))
    } else {
      await db.insert(roomMembers).values({
        room_id: room.id,
        user_id: user.id,
        role: "member",
        status: "active",
      })
      await db
        .delete(roomInvitations)
        .where(eq(roomInvitations.id, invitation.id))
    }

    if (!(existingMember.length > 0 && existingMember[0].status === "banned")) {
      const systemMsg = await db
        .insert(roomMessages)
        .values({
          room_id: room.id,
          sender_id: null,
          text: systemMessage("joined"),
          system_user_id: user.id,
        })
        .returning()
      await broadcastToRoom(room.id, {
        type: "new_message",
        payload: buildMessageResp(systemMsg[0], { systemUser: user }),
      })
    }

    await broadcastRoomsListToUser(db, user.id)
    await sendRoomMembers(db, room.id)

    const resp: RoomResp = {
      id: room.id,
      name: room.name,
      is_general: room.is_general,
      is_dm: isDm(room),
      is_private: room.is_private,
      owner_id: room.owner_id,
      unread_count: 0,
      last_read_message_id: null,
      avatar_url: room.avatar_url,
    }
    return resp
  })

  router.get("/api/rooms/:roomId/invitations", async (request) => {
    const { roomId } = request.params as { roomId: string }
    const rid = Number(roomId)
    const user = await httpGetUser(db, extractBearerToken(request))
    await ownerOrAdminGuard(db, user.id, rid)

    const roomRows = await db
      .select()
      .from(rooms)
      .where(eq(rooms.id, rid))
      .limit(1)
    if (roomRows.length === 0) throw httpError(404, "room_not_found")
    const room = roomRows[0] as RoomRow

    const invs = await db
      .select()
      .from(roomInvitations)
      .where(eq(roomInvitations.room_id, rid))

    const inviterIds = invs.map((i) => i.inviter_id)
    const inviteeIds = invs
      .filter((i) => i.invitee_id !== null)
      .map((i) => i.invitee_id as number)
    const userMap = new Map<number, typeof users.$inferSelect>()
    if (inviterIds.length > 0 || inviteeIds.length > 0) {
      const ids = Array.from(new Set([...inviterIds, ...inviteeIds]))
      const found = await db.select().from(users).where(inArray(users.id, ids))
      for (const u of found) userMap.set(u.id, u)
    }

    const resp: RoomInvitationResp[] = invs.map((inv) => {
      const inviter = userMap.get(inv.inviter_id)
      const invitee =
        inv.invitee_id !== null ? userMap.get(inv.invitee_id) : undefined
      return {
        id: inv.id,
        room_id: rid,
        room_name: room.name,
        inviter_id: inv.inviter_id,
        inviter_username: inviter?.username ?? "Unknown",
        inviter_avatar_url: inviter?.avatar_url ?? null,
        invitee_id: inv.invitee_id,
        invitee_username: invitee?.username ?? null,
        token: inv.token,
        is_global: inv.is_global,
        created_at: inv.created_at.toISOString(),
      }
    })
    return resp
  })

  router.delete(
    "/api/rooms/:roomId/invitations/:invitationId",
    async (request) => {
      const { roomId, invitationId } = request.params as {
        roomId: string
        invitationId: string
      }
      const rid = Number(roomId)
      const invId = Number(invitationId)
      const user = await httpGetUser(db, extractBearerToken(request))
      await ownerOrAdminGuard(db, user.id, rid)

      const invRows = await db
        .select()
        .from(roomInvitations)
        .where(
          and(eq(roomInvitations.id, invId), eq(roomInvitations.room_id, rid)),
        )
        .limit(1)
      if (invRows.length === 0) throw httpError(404, "invitation_not_found")

      await db.delete(roomInvitations).where(eq(roomInvitations.id, invId))
      return undefined
    },
  )
}

function randomHex(byteCount: number): string {
  const arr = new Uint8Array(byteCount)
  ;(globalThis.crypto as Crypto).getRandomValues(arr)
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("")
}
