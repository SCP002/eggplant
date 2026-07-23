import { z } from "zod"

export const meRespSchema = z.object({
  id: z.number(),
  email: z.string(),
  username: z.string(),
  avatar_url: z.string().nullable(),
})
export type MeResp = z.infer<typeof meRespSchema>

export const userContractSchema = z.object({
  id: z.number(),
  username: z.string(),
  email: z.string().optional(),
  avatar_url: z.string().nullable().optional(),
})
export type User = z.infer<typeof userContractSchema>

export const roomRespSchema = z.object({
  id: z.number(),
  name: z.string(),
  is_general: z.boolean(),
  is_dm: z.boolean(),
  is_private: z.boolean(),
  owner_id: z.number().nullable(),
  unread_count: z.number(),
  last_read_message_id: z.number().nullable(),
  avatar_url: z.string().nullable(),
})
export type RoomResp = z.infer<typeof roomRespSchema>

export const roomMemberRespSchema = z.object({
  id: z.number(),
  username: z.string(),
  avatar_url: z.string().nullable(),
  role: z.enum(["owner", "admin", "member", "guest"]),
  status: z.enum(["active", "pending", "banned"]),
  online: z.boolean(),
})
export type RoomMemberResp = z.infer<typeof roomMemberRespSchema>

export const roomInvitationRespSchema = z.object({
  id: z.number(),
  room_id: z.number(),
  room_name: z.string(),
  inviter_id: z.number(),
  inviter_username: z.string(),
  inviter_avatar_url: z.string().nullable(),
  invitee_id: z.number().nullable(),
  invitee_username: z.string().nullable(),
  token: z.string(),
  is_global: z.boolean(),
  created_at: z.string(),
})
export type RoomInvitationResp = z.infer<typeof roomInvitationRespSchema>

export const userSearchResultSchema = z.object({
  id: z.number(),
  username: z.string(),
  avatar_url: z.string().nullable(),
})
export type UserSearchResult = z.infer<typeof userSearchResultSchema>

export const notificationRespSchema = z.object({
  id: z.number(),
  invitation_id: z.number().nullable(),
  type: z.string(),
  params: z.record(z.string(), z.union([z.string(), z.number()])).nullable(),
  title: z.string(),
  description: z.string().nullable(),
  importance: z.enum(["high", "normal", "low"]),
  action_label: z.string().nullable(),
  action_token: z.string().nullable(),
  created_at: z.string(),
})
export type NotificationResp = z.infer<typeof notificationRespSchema>

export const messageReplyPreviewSchema = z.object({
  id: z.number(),
  text: z.string().nullable(),
  sender: z.string().nullable(),
  sender_id: z.number().nullable(),
  created_at: z.string(),
  avatar_url: z.string().nullable().optional(),
  deleted: z.boolean(),
})
export type MessageReplyPreview = z.infer<typeof messageReplyPreviewSchema>

export const messageAttachmentSchema = z.object({
  name: z.string().nullable(),
  size: z.number().nullable(),
  type: z.string().nullable(),
  file_id: z.string(),
  has_preview: z.boolean(),
})
export type MessageAttachment = z.infer<typeof messageAttachmentSchema>

export const messageReactionSchema = z.object({
  emoji: z.string(),
  users: z.array(userContractSchema),
})
export type MessageReaction = z.infer<typeof messageReactionSchema>

export const messageRespSchema = z.object({
  id: z.number(),
  text: z.string(),
  sender: z.string().nullable(),
  sender_id: z.number().nullable(),
  created_at: z.string(),
  edited_at: z.string().nullable().optional(),
  avatar_url: z.string().nullable().optional(),
  deleted: z.boolean(),
  parent_id: z.number().nullable().optional(),
  parent: messageReplyPreviewSchema.nullable().optional(),
  system_user_id: z.number().nullable().optional(),
  system_username: z.string().nullable().optional(),
  system_avatar_url: z.string().nullable().optional(),
  attachments: z.array(messageAttachmentSchema).optional().default([]),
  reactions: z.array(messageReactionSchema).optional().default([]),
})
export type MessageResp = z.infer<typeof messageRespSchema>

export const tokenRespSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
})
export type TokenResp = z.infer<typeof tokenRespSchema>

export const uploadFileRespSchema = z.object({
  name: z.string().nullable(),
  size: z.number(),
  type: z.string().nullable(),
  file_id: z.string(),
  has_preview: z.boolean(),
})
export type UploadFileResp = z.infer<typeof uploadFileRespSchema>

export const apiErrorSchema = z.object({
  code: z.string(),
  params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
})
export type ApiError = z.infer<typeof apiErrorSchema>
