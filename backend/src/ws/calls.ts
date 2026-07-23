import type { DB } from "@/db/index"
import { roomMembers, roomMessages, type Room, type User } from "@/db/schema"
import { buildMessageResp } from "@/lib/messages"
import { systemMessage } from "@/lib/systemMessages"
import {
  broadcastToRoom,
  roomConnections,
  sendToSockets,
  updateListeners,
} from "@/ws/manager"
import { broadcastRoomsListToUser, unhideRoomMembers } from "@/ws/rooms"
import type { User as UserContract } from "@eggplant/shared/api"
import type { CallStatePayload, CallStateResp } from "@eggplant/shared/ws"
import { eq } from "drizzle-orm"

export const RING_TIMEOUT_MS = 60_000

export interface CallState {
  room_id: number
  status: "ringing" | "active"
  initiator_id: number
  participants: Map<number, User>
  started_at: number
  ringTimer: NodeJS.Timeout | null
}

const calls = new Map<number, CallState>()

function callError(code: string): never {
  const err = new Error(code) as Error & { wsErrorCode?: string }
  err.wsErrorCode = code
  throw err
}

function toContractUser(user: User): UserContract {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    avatar_url: user.avatar_url,
  }
}

export function callStateResp(
  call: CallState,
  status: CallStatePayload["status"] = call.status,
): CallStateResp {
  const participants = Array.from(call.participants.values()).map(
    toContractUser,
  )
  const initiator = call.participants.get(call.initiator_id)
  return {
    type: "call_state",
    payload: {
      room_id: call.room_id,
      status,
      initiator: initiator ? toContractUser(initiator) : null,
      participants,
    },
  }
}

export function getCall(roomId: number): CallState | undefined {
  return calls.get(roomId)
}

async function insertSystemMessage(
  db: DB,
  roomId: number,
  key: Parameters<typeof systemMessage>[0],
  user: User,
): Promise<void> {
  const inserted = await db
    .insert(roomMessages)
    .values({
      room_id: roomId,
      sender_id: null,
      text: systemMessage(key, { username: user.username }),
      system_user_id: user.id,
    })
    .returning()
  await broadcastToRoom(roomId, {
    type: "new_message",
    payload: buildMessageResp(inserted[0], { systemUser: user }),
  })
}

/**
 * Delivers a call_state snapshot to everyone who needs it: users connected to
 * the room's chat websocket plus room members on their per-user updates socket
 * (skipped for members already viewing the room to avoid duplicate updates).
 */
async function publishCallState(
  db: DB,
  call: CallState,
  status: CallStatePayload["status"] = call.status,
): Promise<void> {
  const payload = callStateResp(call, status).payload
  await broadcastToRoom(call.room_id, { type: "call_state", payload })

  const members = await db
    .select()
    .from(roomMembers)
    .where(eq(roomMembers.room_id, call.room_id))
  const tasks: Promise<void>[] = []
  for (const member of members) {
    if (roomConnections.isUserConnectedToRoom(call.room_id, member.user_id))
      continue
    tasks.push(
      sendToSockets(updateListeners.socketsForUser(member.user_id), {
        type: "call_state",
        payload,
      }),
    )
  }
  await Promise.all(tasks)
}

async function handleRingTimeout(db: DB, roomId: number): Promise<void> {
  const call = calls.get(roomId)
  if (!call || call.status !== "ringing") return
  if (call.participants.size === 1) {
    const initiator = call.participants.get(call.initiator_id)
    calls.delete(roomId)
    if (initiator) {
      await insertSystemMessage(db, roomId, "call_missed", initiator)
    }
    await publishCallState(db, call, "ended")
    return
  }
  call.status = "active"
  call.ringTimer = null
  await publishCallState(db, call)
}

export async function startCall(
  db: DB,
  roomId: number,
  user: User,
  room: Room,
): Promise<void> {
  if (room.is_general) callError("calls_disabled_in_general")
  if (calls.has(roomId)) callError("call_already_active")

  const call: CallState = {
    room_id: roomId,
    status: "ringing",
    initiator_id: user.id,
    participants: new Map([[user.id, user]]),
    started_at: Date.now(),
    ringTimer: null,
  }
  call.ringTimer = setTimeout(
    () => handleRingTimeout(db, roomId),
    RING_TIMEOUT_MS,
  )
  calls.set(roomId, call)

  await insertSystemMessage(db, roomId, "call_started", user)

  for (const uid of await unhideRoomMembers(db, roomId)) {
    await broadcastRoomsListToUser(db, uid)
  }

  await publishCallState(db, call)
}

export async function joinCall(
  db: DB,
  roomId: number,
  user: User,
): Promise<void> {
  const call = calls.get(roomId)
  if (!call) callError("call_not_found")
  if (call.participants.has(user.id)) return

  call.participants.set(user.id, user)
  if (call.status === "ringing" && call.participants.size >= 2) {
    call.status = "active"
    if (call.ringTimer) {
      clearTimeout(call.ringTimer)
      call.ringTimer = null
    }
  }
  await insertSystemMessage(db, roomId, "call_joined", user)
  await publishCallState(db, call)
}

export async function leaveCall(
  db: DB,
  roomId: number,
  user: User,
): Promise<void> {
  const call = calls.get(roomId)
  if (!call) return
  if (!call.participants.has(user.id)) return

  call.participants.delete(user.id)

  if (call.status === "ringing" && user.id === call.initiator_id) {
    calls.delete(roomId)
    await insertSystemMessage(db, roomId, "call_cancelled", user)
    await publishCallState(db, call, "ended")
    return
  }

  if (call.status === "active" && call.participants.size === 0) {
    calls.delete(roomId)
    await insertSystemMessage(db, roomId, "call_ended", user)
    await publishCallState(db, call, "ended")
    return
  }

  await publishCallState(db, call)
}

/**
 * Called when a user's socket to a room closes. Only acts when the user no
 * longer has any connection to the room (e.g. all devices navigated away or
 * the room websocket dropped); otherwise the user stays in the call.
 */
export async function handleDisconnect(
  db: DB,
  roomId: number,
  userId: number,
): Promise<void> {
  const call = calls.get(roomId)
  if (!call) return
  if (roomConnections.isUserConnectedToRoom(roomId, userId)) return
  const user = call.participants.get(userId)
  if (!user) return
  await leaveCall(db, roomId, user)
}
