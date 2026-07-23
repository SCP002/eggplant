import { getDb } from "@/db/index"
import { roomMembers, roomMessages, users } from "@/db/schema"
import { httpError } from "@/lib/httpError"
import {
  attachmentsForMessage,
  buildMessageResp,
  resolveAttachmentsByFileIds,
  resolveReactionsByMessageIds,
} from "@/lib/messages"
import { extractBearerToken } from "@/lib/requestAuth"
import { httpGetMembership, httpGetUser } from "@/lib/validate"
import { broadcastRoomsListToUser } from "@/ws/rooms"
import type { MessageResp } from "@eggplant/shared/api"
import { and, asc, desc, eq, gt, inArray, lt, max } from "drizzle-orm"
import type { FastifyInstance } from "fastify"

export async function registerMessagesRoutes(
  router: FastifyInstance,
): Promise<void> {
  const db = getDb()

  router.get("/api/rooms/:roomId/messages", async (request) => {
    const { roomId } = request.params as { roomId: string }
    const rid = Number(roomId)
    const user = await httpGetUser(db, extractBearerToken(request))
    const membership = await httpGetMembership(db, user.id, rid)

    const query = request.query as Record<string, string | undefined>
    const limit = query.limit ? Number(query.limit) : 20
    const beforeId = query.before_id ? Number(query.before_id) : undefined
    const afterId = query.after_id ? Number(query.after_id) : undefined
    const aroundId = query.around_id ? Number(query.around_id) : undefined

    let rows: (typeof roomMessages.$inferSelect)[]

    if (aroundId !== undefined) {
      const around = await db
        .select()
        .from(roomMessages)
        .where(
          and(
            eq(roomMessages.id, aroundId),
            eq(roomMessages.room_id, rid),
            eq(roomMessages.deleted, false),
          ),
        )
        .limit(1)
      if (around.length === 0) throw httpError(404, "message_not_found")

      const limitBefore = limit ? Math.floor(limit / 2) : 5
      const limitAfter = limit ? limit - limitBefore - 1 : 4

      const older = await db
        .select()
        .from(roomMessages)
        .where(
          and(
            eq(roomMessages.room_id, rid),
            eq(roomMessages.deleted, false),
            lt(roomMessages.id, aroundId),
          ),
        )
        .orderBy(desc(roomMessages.id))
        .limit(limitBefore)
      const newer = await db
        .select()
        .from(roomMessages)
        .where(
          and(
            eq(roomMessages.room_id, rid),
            eq(roomMessages.deleted, false),
            gt(roomMessages.id, aroundId),
          ),
        )
        .orderBy(asc(roomMessages.id))
        .limit(limitAfter)
      rows = [...older.reverse(), around[0], ...newer]
    } else if (beforeId !== undefined) {
      const exists = await db
        .select()
        .from(roomMessages)
        .where(
          and(eq(roomMessages.id, beforeId), eq(roomMessages.room_id, rid)),
        )
        .limit(1)
      if (exists.length === 0) throw httpError(404, "message_not_found")
      const older = await db
        .select()
        .from(roomMessages)
        .where(
          and(
            eq(roomMessages.room_id, rid),
            eq(roomMessages.deleted, false),
            lt(roomMessages.id, beforeId),
          ),
        )
        .orderBy(desc(roomMessages.id))
        .limit(limit)
      rows = older.reverse()
    } else if (afterId !== undefined) {
      const exists = await db
        .select()
        .from(roomMessages)
        .where(and(eq(roomMessages.id, afterId), eq(roomMessages.room_id, rid)))
        .limit(1)
      if (exists.length === 0) throw httpError(404, "message_not_found")
      rows = await db
        .select()
        .from(roomMessages)
        .where(
          and(
            eq(roomMessages.room_id, rid),
            eq(roomMessages.deleted, false),
            gt(roomMessages.id, afterId),
          ),
        )
        .orderBy(asc(roomMessages.id))
        .limit(limit)
    } else {
      rows = await db
        .select()
        .from(roomMessages)
        .where(
          and(eq(roomMessages.room_id, rid), eq(roomMessages.deleted, false)),
        )
        .orderBy(desc(roomMessages.id))
        .limit(limit)
      rows = rows.reverse()

      const maxRow = await db
        .select({ value: max(roomMessages.id) })
        .from(roomMessages)
        .where(eq(roomMessages.room_id, rid))
      const maxMsg = maxRow[0]?.value ?? null
      if (
        maxMsg !== null &&
        (membership.last_read_message_id === null ||
          maxMsg > membership.last_read_message_id)
      ) {
        await db
          .update(roomMembers)
          .set({ last_read_message_id: maxMsg })
          .where(
            and(eq(roomMembers.room_id, rid), eq(roomMembers.user_id, user.id)),
          )
        await broadcastRoomsListToUser(db, user.id)
      }
    }

    // Resolve senders and parents in batch
    const userIds = new Set<number>()
    const parentIds = new Set<number>()
    const systemUserIds = new Set<number>()
    for (const r of rows) {
      if (r.sender_id !== null) userIds.add(r.sender_id)
      if (r.system_user_id !== null) systemUserIds.add(r.system_user_id)
      if (r.parent_id !== null) parentIds.add(r.parent_id)
    }

    const allUserIds = new Set([...userIds, ...systemUserIds])
    const userMap = new Map<number, typeof users.$inferSelect>()
    if (allUserIds.size > 0) {
      const found = await db
        .select()
        .from(users)
        .where(inArray(users.id, Array.from(allUserIds)))
      for (const u of found) userMap.set(u.id, u)
    }

    const parentMap = new Map<number, typeof roomMessages.$inferSelect>()
    if (parentIds.size > 0) {
      const found = await db
        .select()
        .from(roomMessages)
        .where(inArray(roomMessages.id, Array.from(parentIds)))
      for (const p of found) parentMap.set(p.id, p)
    }

    const allFileIds = new Set<string>()
    for (const r of rows) for (const id of r.file_ids ?? []) allFileIds.add(id)
    const attachmentMap = await resolveAttachmentsByFileIds(
      db,
      Array.from(allFileIds),
    )

    const reactionMap = await resolveReactionsByMessageIds(
      db,
      rows.map((r) => r.id),
    )

    const messages: MessageResp[] = rows.map((r) => {
      const parent =
        r.parent_id !== null ? parentMap.get(r.parent_id) : undefined
      const parentSender =
        parent && parent.sender_id !== null
          ? userMap.get(parent.sender_id)
          : undefined
      return buildMessageResp(r, {
        sender: r.sender_id !== null ? userMap.get(r.sender_id) : undefined,
        systemUser:
          r.system_user_id !== null ? userMap.get(r.system_user_id) : undefined,
        parent,
        parentSender,
        attachments: attachmentsForMessage(r.file_ids, attachmentMap),
        reactions: reactionMap.get(r.id) ?? [],
      })
    })

    return messages
  })
}
