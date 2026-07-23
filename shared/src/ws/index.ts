import { z } from "zod"
import {
  messageReactionSchema,
  messageRespSchema,
  roomInvitationRespSchema,
  roomMemberRespSchema,
  roomRespSchema,
  userContractSchema,
  type MessageReaction,
  type MessageResp,
  type RoomInvitationResp,
  type RoomResp,
  type User,
} from "../api/responses"

export const wsRespSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("user_updated"), payload: userContractSchema }),
  z.object({
    type: z.literal("messages_by_user_id_deleted"),
    payload: z.object({ sender_id: z.number() }),
  }),
  z.object({ type: z.literal("new_message"), payload: messageRespSchema }),
  z.object({
    type: z.literal("new_message_notification"),
    payload: z.object({
      room_id: z.number(),
      timestamp: z.number(),
      message: messageRespSchema,
    }),
  }),
  z.object({
    type: z.literal("room_members"),
    payload: z.array(roomMemberRespSchema),
  }),
  z.object({
    type: z.literal("rooms_list"),
    payload: z.object({ rooms: z.array(roomRespSchema) }),
  }),
  z.object({ type: z.literal("message_updated"), payload: messageRespSchema }),
  z.object({
    type: z.literal("reactions_updated"),
    payload: z.object({
      message_id: z.number(),
      reactions: z.array(messageReactionSchema),
    }),
  }),
  z.object({
    type: z.literal("message_by_id_deleted"),
    payload: z.object({ message_id: z.number() }),
  }),
  z.object({
    type: z.literal("room_deleted"),
    payload: z.object({ room_id: z.number() }),
  }),
  z.object({
    type: z.literal("room_invitation_received"),
    payload: roomInvitationRespSchema,
  }),
  z.object({
    type: z.literal("typing"),
    payload: z.object({
      user_id: z.number(),
      username: z.string(),
      timestamp: z.number(),
    }),
  }),
  z.object({
    type: z.literal("call_state"),
    payload: z.object({
      room_id: z.number(),
      status: z.enum(["ringing", "active", "ended"]),
      initiator: userContractSchema.nullable(),
      participants: z.array(userContractSchema),
    }),
  }),
  z.object({
    type: z.literal("error"),
    payload: z.object({
      code: z.string(),
      params: z
        .record(z.string(), z.union([z.string(), z.number()]))
        .optional(),
    }),
  }),
])

export type WsResp = z.infer<typeof wsRespSchema>

// Frontend-facing payload aliases (single source of truth for the web client)
export type MessagesByUserIdDeletedPayload = { sender_id: number }
export type MessageByIdDeletedPayload = { message_id: number }
export type ReactionsUpdatedPayload = {
  message_id: number
  reactions: MessageReaction[]
}
export type RoomsListPayload = { rooms: RoomResp[] }
export type NewMessageNotificationPayload = {
  room_id: number
  timestamp: number
  message: MessageResp
}
export type RoomDeletedPayload = { room_id: number }
export type RoomInvitationReceivedPayload = RoomInvitationResp
export type TypingPayload = {
  user_id: number
  username: string
  timestamp: number
}
export type CallStatePayload = {
  room_id: number
  status: "ringing" | "active" | "ended"
  initiator: User | null
  participants: User[]
}
export type CallStateResp = Extract<WsResp, { type: "call_state" }>
export type WsErrorPayload = {
  code: string
  params?: Record<string, string | number>
}

// Client-to-server messages sent over the chat websocket.
export const wsReqSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("message"),
    payload: z.object({
      text: z.string(),
      parent_id: z.number().nullable().optional(),
      file_ids: z.array(z.string()).default([]),
    }),
  }),
  z.object({
    type: z.literal("edit_message"),
    payload: z.object({
      message_id: z.number(),
      text: z.string(),
      file_ids: z.array(z.string()).optional(),
      remove_file_ids: z.array(z.string()).optional(),
    }),
  }),
  z.object({
    type: z.literal("delete_message"),
    payload: z.object({ message_id: z.number() }),
  }),
  z.object({
    type: z.literal("react"),
    payload: z.object({ message_id: z.number(), emoji: z.string() }),
  }),
  z.object({
    type: z.literal("typing"),
    payload: z.object({}),
  }),
  z.object({
    type: z.literal("call_start"),
    payload: z.object({}),
  }),
  z.object({
    type: z.literal("call_join"),
    payload: z.object({}),
  }),
  z.object({
    type: z.literal("call_leave"),
    payload: z.object({}),
  }),
])

export type WsReq = z.infer<typeof wsReqSchema>
export type MessageReqPayload = Extract<WsReq, { type: "message" }>["payload"]
export type EditMessageReqPayload = Extract<
  WsReq,
  { type: "edit_message" }
>["payload"]
export type DeleteMessageReqPayload = Extract<
  WsReq,
  { type: "delete_message" }
>["payload"]
export type ReactReqPayload = Extract<WsReq, { type: "react" }>["payload"]
export type TypingReqPayload = Extract<WsReq, { type: "typing" }>["payload"]
export type CallStartReqPayload = Extract<
  WsReq,
  { type: "call_start" }
>["payload"]
export type CallJoinReqPayload = Extract<
  WsReq,
  { type: "call_join" }
>["payload"]
export type CallLeaveReqPayload = Extract<
  WsReq,
  { type: "call_leave" }
>["payload"]
