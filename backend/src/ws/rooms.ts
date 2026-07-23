import type { DB } from "@/db/index"
import { getDmPeerId } from "@/db/queries"
import { roomMembers, roomMessages, rooms, users, type Room } from "@/db/schema"
import {
  broadcastToRoom,
  chatConnections,
  roomsListeners,
  sendToSockets,
  updateListeners,
  type SocketLike,
} from "@/ws/manager"
import type {
  MessageResp,
  RoomMemberResp,
  RoomResp,
} from "@eggplant/shared/api"
import type { WsResp } from "@eggplant/shared/ws"
import { and, count, eq, gt, inArray, ne } from "drizzle-orm"

export async function broadcastRoomsListToUser(
  db: DB,
  userId: number,
): Promise<void> {
  const sockets = roomsListeners.socketsForUser(userId)
  if (sockets.length === 0) return
  await sendToSockets(sockets, await buildRoomsListPayload(db, userId))
}

export async function sendRoomsList(
  db: DB,
  ws: SocketLike,
  userId: number,
): Promise<void> {
  const payload = await buildRoomsListPayload(db, userId)
  ws.send(JSON.stringify(payload))
}

async function buildRoomsListPayload(
  db: DB,
  userId: number,
): Promise<WsResp & { type: "rooms_list" }> {
  const roomsForUser = await db
    .select()
    .from(rooms)
    .innerJoin(roomMembers, eq(roomMembers.room_id, rooms.id))
    .where(and(eq(roomMembers.user_id, userId), eq(roomMembers.hidden, false)))

  const memberships = await db
    .select()
    .from(roomMembers)
    .where(eq(roomMembers.user_id, userId))
  const lastReadMap = new Map<number, number | null>()
  for (const m of memberships)
    lastReadMap.set(m.room_id, m.last_read_message_id)

  const peerMap = await buildDmPeerUsernameMap(
    db,
    roomsForUser.map((r) => r.rooms),
    userId,
  )

  const respList: RoomResp[] = []
  for (const { rooms: room } of roomsForUser) {
    const peerId = getDmPeerId(room, userId)
    const isDm = peerId !== null
    const displayName = isDm ? (peerMap.get(peerId) ?? room.name) : room.name

    let lastRead = lastReadMap.get(room.id) ?? null

    const userIsConnected = chatConnections.isUserConnectedToRoom(
      room.id,
      userId,
    )
    if (userIsConnected) lastRead = null

    let unreadCount = 0
    if (!userIsConnected) {
      const counts = await db
        .select({ value: count() })
        .from(roomMessages)
        .where(
          and(
            eq(roomMessages.room_id, room.id),
            eq(roomMessages.deleted, false),
            ne(roomMessages.sender_id, userId),
            lastRead !== null ? gt(roomMessages.id, lastRead) : undefined,
          ),
        )
      unreadCount = counts[0]?.value ?? 0
    }

    respList.push({
      id: room.id,
      name: displayName,
      is_general: room.is_general,
      is_dm: isDm,
      is_private: room.is_private,
      owner_id: room.owner_id,
      unread_count: unreadCount,
      last_read_message_id: lastRead,
      avatar_url: room.avatar_url,
    })
  }

  return { type: "rooms_list", payload: { rooms: respList } }
}

async function buildDmPeerUsernameMap(
  db: DB,
  roomsForUser: Room[],
  userId: number,
): Promise<Map<number, string>> {
  const peerIds = new Set<number>()
  for (const room of roomsForUser) {
    const peerId = getDmPeerId(room, userId)
    if (peerId !== null) peerIds.add(peerId)
  }
  const peers = await db
    .select()
    .from(users)
    .where(inArray(users.id, Array.from(peerIds)))
  const map = new Map<number, string>()
  for (const peer of peers) map.set(peer.id, peer.username)
  return map
}

export async function sendRoomMembers(db: DB, roomId: number): Promise<void> {
  const members = await db
    .select({
      id: users.id,
      username: users.username,
      avatar_url: users.avatar_url,
      role: roomMembers.role,
      status: roomMembers.status,
    })
    .from(roomMembers)
    .innerJoin(users, eq(users.id, roomMembers.user_id))
    .where(eq(roomMembers.room_id, roomId))

  const onlineUserIds = updateListeners.onlineUserIds()

  const payload: RoomMemberResp[] = members.map((m) => ({
    id: m.id,
    username: m.username,
    avatar_url: m.avatar_url,
    online: onlineUserIds.has(m.id),
    role: m.role,
    status: m.status,
  }))

  await broadcastToRoom(roomId, { type: "room_members", payload })
}

export async function broadcastRoomMembersForUserRooms(
  db: DB,
  userId: number,
): Promise<void> {
  const userMemberships = await db
    .select()
    .from(roomMembers)
    .where(eq(roomMembers.user_id, userId))
  await Promise.all(userMemberships.map((m) => sendRoomMembers(db, m.room_id)))
}

export async function unhideRoomMembers(
  db: DB,
  roomId: number,
): Promise<number[]> {
  const hiddenRows = await db
    .select()
    .from(roomMembers)
    .where(and(eq(roomMembers.room_id, roomId), eq(roomMembers.hidden, true)))
  if (hiddenRows.length === 0) return []
  await db
    .update(roomMembers)
    .set({ hidden: false })
    .where(and(eq(roomMembers.room_id, roomId), eq(roomMembers.hidden, true)))
  return hiddenRows.map((row) => row.user_id)
}

export async function notifyRoomMembers(
  db: DB,
  roomId: number,
  senderId: number,
  message: MessageResp,
): Promise<void> {
  const members = await db
    .select()
    .from(roomMembers)
    .where(eq(roomMembers.room_id, roomId))

  await unhideRoomMembers(db, roomId)

  const notification: WsResp = {
    type: "new_message_notification",
    payload: {
      room_id: roomId,
      timestamp: Date.now() / 1000,
      message,
    },
  }

  const tasks: Promise<void>[] = []
  for (const member of members) {
    if (member.user_id === senderId) continue
    tasks.push(
      sendToSockets(
        updateListeners.socketsForUser(member.user_id),
        notification,
      ),
    )
    tasks.push(broadcastRoomsListToUser(db, member.user_id))
  }
  await Promise.all(tasks)
}

export async function broadcastTyping(
  roomId: number,
  user: { id: number; username: string },
): Promise<void> {
  await broadcastToRoom(roomId, {
    type: "typing",
    payload: {
      user_id: user.id,
      username: user.username,
      timestamp: Date.now(),
    },
  })
}
