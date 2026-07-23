import { getDb } from "@/db/index"
import {
  fileAttachments,
  messageReactions,
  roomMembers,
  roomMessages,
  rooms,
  users,
} from "@/db/schema"
import { deleteFileAttachmentRows, deleteFilesOnDisk } from "@/lib/files"
import {
  attachmentsForMessage,
  buildMessageResp,
  resolveAttachmentsByFileIds,
  resolveReactionsForMessage,
} from "@/lib/messages"
import { extractWsToken } from "@/lib/requestAuth"
import { wsGetMembership, wsGetUser } from "@/lib/validate"
import {
  handleDisconnect as callsHandleDisconnect,
  callStateResp,
  getCall,
  joinCall,
  leaveCall,
  startCall,
} from "@/ws/calls"
import {
  broadcastToRoom,
  chatConnections,
  roomConnections,
  roomsListeners,
  updateListeners,
  type SocketLike,
} from "@/ws/manager"
import {
  broadcastRoomMembersForUserRooms,
  broadcastRoomsListToUser,
  broadcastTyping,
  notifyRoomMembers,
  sendRoomMembers,
  sendRoomsList,
} from "@/ws/rooms"
import { wsReqSchema } from "@eggplant/shared/ws"
import { and, eq, inArray, isNull, max } from "drizzle-orm"
import { decodeHTML } from "entities"
import type { FastifyInstance } from "fastify"

export interface WsContext {
  db: ReturnType<typeof getDb>
  token: string | null
}

// Heartbeat for WebSocket connections to detect dead connections on network loss or hard poweroff.
const HEARTBEAT_INTERVAL_MS = 10_000

// Minimum delay between forwarded typing indicators from a single socket.
const TYPING_MIN_INTERVAL_MS = 2_000

export function isTypingThrottled(
  socket: { lastTypingAt?: number },
  now: number,
): boolean {
  return (
    socket.lastTypingAt !== undefined &&
    now - socket.lastTypingAt < TYPING_MIN_INTERVAL_MS
  )
}

type HeartbeatSocket = SocketLike & {
  isAlive?: boolean
  on?: (event: string, listener: (...args: unknown[]) => void) => unknown
  ping?: () => void
  terminate?: () => void
}

function attachHeartbeat(socket: HeartbeatSocket): void {
  socket.isAlive = true
  socket.on?.("pong", () => {
    socket.isAlive = true
  })
}

let heartbeatStarted = false

function startHeartbeat(): void {
  if (heartbeatStarted) return
  heartbeatStarted = true
  const interval = setInterval(() => {
    heartbeatSweep()
  }, HEARTBEAT_INTERVAL_MS)
  if (interval.unref) interval.unref()
}

export function heartbeatSweep(): void {
  const sockets = new Set<SocketLike>([
    ...updateListeners.allSockets(),
    ...roomsListeners.allSockets(),
    ...roomConnections.allSockets(),
    ...chatConnections.allSockets(),
  ])
  for (const ws of sockets) {
    const socket = ws as HeartbeatSocket
    try {
      if (socket.isAlive === false) {
        socket.terminate?.()
      } else {
        socket.isAlive = false
        socket.ping?.()
      }
    } catch {
      // Individual socket errors must not break the sweep.
    }
  }
}

function errorCode(code: string): void {
  const err = new Error(code) as Error & { wsErrorCode?: string }
  err.wsErrorCode = code
  throw err
}

function messageTextEmpty(value: unknown): boolean {
  if (typeof value !== "string") return true
  const decoded = decodeHTML(value)
    .replaceAll("\u200b", "")
    .replaceAll("\\ ", " ")
    .replaceAll("<br>", "\n")
    .replaceAll("<br/>", "\n")
    .replaceAll("<br />", "\n")
  return decoded.trim().length === 0
}

// Number of rows affected by a write.
function affectedRowCount(result: unknown): number {
  const r = result as { rowCount?: number | null; affectedRows?: number }
  return r.rowCount ?? r.affectedRows ?? 0
}

// Basenames from a set of candidate ids that the user uploaded and has not
// attached to any message yet.
async function resolveAllowedUploadedIds(
  db: ReturnType<typeof getDb>,
  userId: number,
  candidateIds: string[],
): Promise<string[]> {
  if (candidateIds.length === 0) return []
  const rows = await db
    .select()
    .from(fileAttachments)
    .where(inArray(fileAttachments.basename, candidateIds))
  return rows
    .filter((fa) => fa.uploader_id === userId && fa.message_id === null)
    .map((fa) => fa.basename)
}

export async function registerWsRoutes(router: FastifyInstance): Promise<void> {
  const db = getDb()
  startHeartbeat()

  router.get(
    "/ws/chat/:roomId",
    { websocket: true },
    async (socket, request) => {
      attachHeartbeat(socket)
      const { roomId } = request.params as { roomId: string }
      const rid = Number(roomId)

      let user
      try {
        const token = extractWsToken(request)
        user = await wsGetUser(db, token)
        await wsGetMembership(db, rid, user.id)
      } catch (e) {
        socket.close(1008, (e as Error).message)
        return
      }

      roomConnections.add(rid, socket, user.id)
      chatConnections.add(rid, socket, user.id)

      const activeCall = getCall(rid)
      if (activeCall) {
        socket.send(JSON.stringify(callStateResp(activeCall)))
      }

      const maxRow = await db
        .select({ value: max(roomMessages.id) })
        .from(roomMessages)
        .where(eq(roomMessages.room_id, rid))
      const maxMsg = maxRow[0]?.value ?? null
      if (maxMsg !== null) {
        const membership = await db
          .select()
          .from(roomMembers)
          .where(
            and(eq(roomMembers.room_id, rid), eq(roomMembers.user_id, user.id)),
          )
          .limit(1)
        if (
          membership.length > 0 &&
          (membership[0].last_read_message_id === null ||
            maxMsg > membership[0].last_read_message_id)
        ) {
          await db
            .update(roomMembers)
            .set({ last_read_message_id: maxMsg })
            .where(
              and(
                eq(roomMembers.room_id, rid),
                eq(roomMembers.user_id, user.id),
              ),
            )
          await broadcastRoomsListToUser(db, user.id)
        }
      }

      socket.on("message", async (raw: Buffer) => {
        try {
          const parsed = wsReqSchema.safeParse(JSON.parse(raw.toString()))
          if (!parsed.success) return errorCode("invalid_message")
          const data = parsed.data
          if (data.type === "message") {
            const text = data.payload.text
            const requestedFileIds = data.payload.file_ids
            // A message may be purely attachments; require text only when no
            // files are being attached.
            if (messageTextEmpty(text) && requestedFileIds.length === 0) return
            // Notification previews fall back to the attachment count.
            const storedText = messageTextEmpty(text) ? "" : text
            const parentId = data.payload.parent_id ?? null
            let parentMsg = undefined
            let parentSenderUser = undefined
            if (parentId !== null) {
              const parentRows = await db
                .select()
                .from(roomMessages)
                .where(
                  and(
                    eq(roomMessages.id, parentId),
                    eq(roomMessages.room_id, rid),
                  ),
                )
                .limit(1)
              if (parentRows.length === 0) {
                return errorCode("parent_message_not_found")
              }
              const parent = parentRows[0]
              if (parent.deleted) return errorCode("reply_to_deleted_message")
              if (parent.sender_id === null)
                return errorCode("reply_to_system_message")
              parentSenderUser = (
                await db
                  .select()
                  .from(users)
                  .where(eq(users.id, parent.sender_id))
                  .limit(1)
              )[0]
              parentMsg = parent
            }

            const inserted = await db
              .insert(roomMessages)
              .values({
                room_id: rid,
                sender_id: user.id,
                text: storedText,
                parent_id: parentId,
              })
              .returning()
            const roomMessage = inserted[0]

            const attachments = await db
              .select()
              .from(fileAttachments)
              .where(
                and(
                  eq(fileAttachments.uploader_id, user.id),
                  isNull(fileAttachments.message_id),
                ),
              )
            const targeted = attachments.filter((fa) =>
              requestedFileIds.includes(fa.basename),
            )
            if (targeted.length > 0) {
              const basenames = targeted.map((fa) => fa.basename)
              for (const fa of targeted) {
                await db
                  .update(fileAttachments)
                  .set({ message_id: roomMessage.id })
                  .where(eq(fileAttachments.id, fa.id))
              }
              await db
                .update(roomMessages)
                .set({ file_ids: basenames })
                .where(eq(roomMessages.id, roomMessage.id))
              roomMessage.file_ids = basenames
            }

            const attachmentMap = await resolveAttachmentsByFileIds(
              db,
              roomMessage.file_ids ?? [],
            )

            const message = buildMessageResp(roomMessage, {
              sender: user,
              parent: parentMsg,
              parentSender: parentSenderUser,
              attachments: attachmentsForMessage(
                roomMessage.file_ids,
                attachmentMap,
              ),
            })
            await broadcastToRoom(rid, {
              type: "new_message",
              payload: message,
            })
            await notifyRoomMembers(db, rid, user.id, message)
          } else if (data.type === "edit_message") {
            const messageId = data.payload.message_id
            const text = data.payload.text
            const hasFileIds = data.payload.file_ids !== undefined
            const requestedFileIds = data.payload.file_ids ?? []
            const removeFileIds = data.payload.remove_file_ids ?? []

            const existingRows = await db
              .select()
              .from(roomMessages)
              .where(
                and(
                  eq(roomMessages.id, messageId),
                  eq(roomMessages.room_id, rid),
                ),
              )
              .limit(1)
            if (existingRows.length === 0) return errorCode("message_not_found")
            const existing = existingRows[0]
            if (existing.sender_id !== user.id)
              return errorCode("edit_others_message_forbidden")
            if (existing.deleted) return errorCode("edit_deleted_message")

            const existingFileIds = existing.file_ids ?? []
            // When file_ids is absent the attachment set is left unchanged
            // except for explicit removals.
            const keptFileIds = hasFileIds ? requestedFileIds : existingFileIds
            const removedFromMessage = existingFileIds.filter((id) =>
              removeFileIds.includes(id),
            )
            const finalFileIds = keptFileIds.filter(
              (id) => !removedFromMessage.includes(id),
            )
            const addedFileIds = finalFileIds.filter(
              (id) => !existingFileIds.includes(id),
            )
            const storedText = messageTextEmpty(text) ? "" : text
            const noChange =
              !hasFileIds &&
              addedFileIds.length === 0 &&
              removedFromMessage.length === 0 &&
              storedText === (existing.text ?? "")
            if (noChange) return

            // Removing the last attachment and clearing the text would leave an
            // empty message; delete it instead (also purges the files).
            if (messageTextEmpty(text) && finalFileIds.length === 0) {
              const deleteFileIds = existing.file_ids ?? []
              await db.transaction(async (tx) => {
                await deleteFileAttachmentRows(tx, deleteFileIds)
                await tx
                  .update(roomMessages)
                  .set({ deleted: true, edited_at: new Date() })
                  .where(eq(roomMessages.id, existing.id))
              })
              deleteFilesOnDisk(deleteFileIds)
              await broadcastToRoom(rid, {
                type: "message_by_id_deleted",
                payload: { message_id: existing.id },
              })
            } else {
              // The final attachment set must only contain files already on this
              // message or files this user uploaded and has not attached yet.
              const allowedFileIds = new Set([
                ...existingFileIds.filter(
                  (id) => !removedFromMessage.includes(id),
                ),
                ...(await resolveAllowedUploadedIds(db, user.id, addedFileIds)),
              ])
              if (finalFileIds.some((id) => !allowedFileIds.has(id)))
                return errorCode("attach_unknown_file")

              const editedAt = new Date()
              await db.transaction(async (tx) => {
                await tx
                  .update(roomMessages)
                  .set({
                    text: storedText,
                    file_ids: finalFileIds,
                    edited_at: editedAt,
                  })
                  .where(eq(roomMessages.id, existing.id))
                if (addedFileIds.length > 0) {
                  await tx
                    .update(fileAttachments)
                    .set({ message_id: existing.id })
                    .where(inArray(fileAttachments.basename, addedFileIds))
                }
                if (removedFromMessage.length > 0) {
                  await deleteFileAttachmentRows(tx, removedFromMessage)
                }
              })
              if (removedFromMessage.length > 0) {
                deleteFilesOnDisk(removedFromMessage)
              }

              let parentMsg = undefined
              let parentSenderUser = undefined
              if (existing.parent_id !== null) {
                const parentRows = await db
                  .select()
                  .from(roomMessages)
                  .where(
                    and(
                      eq(roomMessages.id, existing.parent_id),
                      eq(roomMessages.room_id, rid),
                    ),
                  )
                  .limit(1)
                if (parentRows.length > 0) {
                  parentMsg = parentRows[0]
                  if (parentMsg.sender_id !== null) {
                    const senderRows = await db
                      .select()
                      .from(users)
                      .where(eq(users.id, parentMsg.sender_id))
                      .limit(1)
                    parentSenderUser = senderRows[0]
                  }
                }
              }

              const attachmentMap = await resolveAttachmentsByFileIds(
                db,
                finalFileIds,
              )
              const updated = buildMessageResp(
                {
                  ...existing,
                  text: storedText,
                  file_ids: finalFileIds,
                  edited_at: editedAt,
                },
                {
                  sender: user,
                  parent: parentMsg,
                  parentSender: parentSenderUser,
                  attachments: attachmentsForMessage(
                    finalFileIds,
                    attachmentMap,
                  ),
                  reactions: await resolveReactionsForMessage(db, existing.id),
                },
              )
              await broadcastToRoom(rid, {
                type: "message_updated",
                payload: updated,
              })
            }
          } else if (data.type === "delete_message") {
            const messageId = data.payload.message_id
            const existingRows = await db
              .select()
              .from(roomMessages)
              .where(
                and(
                  eq(roomMessages.id, messageId),
                  eq(roomMessages.room_id, rid),
                ),
              )
              .limit(1)
            if (existingRows.length === 0) return errorCode("message_not_found")
            const existing = existingRows[0]
            if (existing.sender_id !== user.id)
              return errorCode("delete_others_message_forbidden")
            if (existing.deleted) return errorCode("message_already_deleted")
            const fileIds = existing.file_ids ?? []
            await db.transaction(async (tx) => {
              await deleteFileAttachmentRows(tx, fileIds)
              await tx
                .update(roomMessages)
                .set({ deleted: true, edited_at: new Date() })
                .where(eq(roomMessages.id, existing.id))
            })
            deleteFilesOnDisk(fileIds)
            await broadcastToRoom(rid, {
              type: "message_by_id_deleted",
              payload: { message_id: existing.id },
            })
          } else if (data.type === "react") {
            const messageId = data.payload.message_id
            const emoji = data.payload.emoji
            if (emoji.trim().length === 0 || emoji.length > 64) {
              return errorCode("invalid_emoji")
            }
            const messageRows = await db
              .select()
              .from(roomMessages)
              .where(
                and(
                  eq(roomMessages.id, messageId),
                  eq(roomMessages.room_id, rid),
                  eq(roomMessages.deleted, false),
                ),
              )
              .limit(1)
            if (messageRows.length === 0) return errorCode("message_not_found")

            // Toggle: an existing reaction of the same emoji.
            const inserted = await db
              .insert(messageReactions)
              .values({
                message_id: messageId,
                user_id: user.id,
                emoji,
              })
              .onConflictDoNothing()
            if (affectedRowCount(inserted) === 0) {
              await db
                .delete(messageReactions)
                .where(
                  and(
                    eq(messageReactions.message_id, messageId),
                    eq(messageReactions.user_id, user.id),
                    eq(messageReactions.emoji, emoji),
                  ),
                )
            }

            const reactions = await resolveReactionsForMessage(db, messageId)
            await broadcastToRoom(rid, {
              type: "reactions_updated",
              payload: { message_id: messageId, reactions },
            })
          } else if (data.type === "typing") {
            const now = Date.now()

            const typedSocket = socket as HeartbeatSocket & {
              lastTypingAt?: number
            }
            if (isTypingThrottled(typedSocket, now)) return
            typedSocket.lastTypingAt = now
            await broadcastTyping(rid, user)
          } else if (data.type === "call_start") {
            const roomRows = await db
              .select()
              .from(rooms)
              .where(eq(rooms.id, rid))
              .limit(1)
            const room = roomRows[0]
            if (!room) return errorCode("room_not_found")
            await startCall(db, rid, user, room)
          } else if (data.type === "call_join") {
            await joinCall(db, rid, user)
          } else if (data.type === "call_leave") {
            await leaveCall(db, rid, user)
          }
        } catch (e) {
          const wsErrorCode = (e as Error & { wsErrorCode?: string })
            .wsErrorCode
          socket.send(
            JSON.stringify({
              type: "error",
              payload: { code: wsErrorCode ?? "unknown_error" },
            }),
          )
        }
      })

      socket.on("close", async () => {
        roomConnections.remove(rid, socket, user.id)
        chatConnections.remove(rid, socket, user.id)
        await callsHandleDisconnect(db, rid, user.id)
        const maxCloseRow = await db
          .select({ value: max(roomMessages.id) })
          .from(roomMessages)
          .where(eq(roomMessages.room_id, rid))
        const maxClose = maxCloseRow[0]?.value ?? null
        if (maxClose !== null) {
          const membership = await db
            .select()
            .from(roomMembers)
            .where(
              and(
                eq(roomMembers.room_id, rid),
                eq(roomMembers.user_id, user.id),
              ),
            )
            .limit(1)
          if (
            membership.length > 0 &&
            (membership[0].last_read_message_id === null ||
              maxClose > membership[0].last_read_message_id)
          ) {
            await db
              .update(roomMembers)
              .set({ last_read_message_id: maxClose })
              .where(
                and(
                  eq(roomMembers.room_id, rid),
                  eq(roomMembers.user_id, user.id),
                ),
              )
          }
        }
      })
    },
  )

  router.get(
    "/ws/room_members/:roomId",
    { websocket: true },
    async (socket, request) => {
      attachHeartbeat(socket)
      const { roomId } = request.params as { roomId: string }
      const rid = Number(roomId)
      let user
      try {
        const token = extractWsToken(request)
        user = await wsGetUser(db, token)
        await wsGetMembership(db, rid, user.id)
      } catch (e) {
        socket.close(1008, (e as Error).message)
        return
      }
      roomConnections.add(rid, socket, user.id)
      await sendRoomMembers(db, rid)
      socket.on("message", () => {})
      socket.on("close", async () => {
        roomConnections.remove(rid, socket, user.id)
        await callsHandleDisconnect(db, rid, user.id)
      })
    },
  )

  router.get("/ws/updates", { websocket: true }, async (socket, request) => {
    attachHeartbeat(socket)
    let user
    try {
      const token = extractWsToken(request)
      user = await wsGetUser(db, token)
    } catch (e) {
      socket.close(1008, (e as Error).message)
      return
    }
    updateListeners.add(user.id, socket)
    await broadcastRoomMembersForUserRooms(db, user.id)
    socket.on("message", () => {})
    socket.on("close", async () => {
      updateListeners.remove(user.id, socket)
      await broadcastRoomMembersForUserRooms(db, user.id)
    })
  })

  router.get("/ws/rooms", { websocket: true }, async (socket, request) => {
    attachHeartbeat(socket)
    let user
    try {
      const token = extractWsToken(request)
      user = await wsGetUser(db, token)
    } catch (e) {
      socket.close(1008, (e as Error).message)
      return
    }
    roomsListeners.add(user.id, socket)
    await sendRoomsList(db, socket, user.id)
    socket.on("message", () => {})
    socket.on("close", () => {
      roomsListeners.remove(user.id, socket)
    })
  })
}
