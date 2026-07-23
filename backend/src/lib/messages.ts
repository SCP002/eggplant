import type { DB } from "@/db/index"
import {
  fileAttachments,
  messageReactions,
  users,
  type FileAttachment,
  type RoomMessage,
  type User,
} from "@/db/schema"
import type {
  MessageAttachment,
  MessageReaction,
  MessageReplyPreview,
  MessageResp,
} from "@eggplant/shared/api"
import { asc, eq, inArray } from "drizzle-orm"

export function buildAttachmentResp(fa: FileAttachment): MessageAttachment {
  return {
    name: fa.original_filename ?? null,
    size: fa.size ?? 0,
    type: fa.content_type ?? null,
    file_id: fa.basename,
    has_preview: fa.has_preview,
  }
}

// Resolve attachment metadata rows for a set of stored file basenames.
export async function resolveAttachmentsByFileIds(
  db: DB,
  fileIds: string[],
): Promise<Map<string, MessageAttachment>> {
  if (fileIds.length === 0) return new Map()
  const rows = await db
    .select()
    .from(fileAttachments)
    .where(inArray(fileAttachments.basename, fileIds))
  return new Map(rows.map((r) => [r.basename, buildAttachmentResp(r)]))
}

// Map a message's file_ids to a stable ordered attachment array.
export function attachmentsForMessage(
  fileIds: string[] | null | undefined,
  attachmentMap: Map<string, MessageAttachment>,
): MessageAttachment[] {
  if (!fileIds || fileIds.length === 0) return []
  const result: MessageAttachment[] = []
  for (const id of fileIds) {
    const att = attachmentMap.get(id)
    if (att) result.push(att)
  }
  return result
}

export function buildReplyPreview(
  msg: RoomMessage,
  sender?: User | undefined,
): MessageReplyPreview {
  return {
    id: msg.id,
    text: msg.deleted ? null : msg.text,
    sender: sender?.username ?? null,
    sender_id: sender?.id ?? null,
    created_at: msg.created_at.toISOString(),
    avatar_url: sender?.avatar_url ?? null,
    deleted: msg.deleted,
  }
}

export interface MessageContext {
  sender?: User | undefined
  systemUser?: User | undefined
  parent?: RoomMessage | undefined
  parentSender?: User | undefined
  attachments?: MessageAttachment[] | undefined
  reactions?: MessageReaction[] | undefined
}

export function buildMessageResp(
  msg: RoomMessage,
  ctx: MessageContext = {},
): MessageResp {
  let parent: MessageReplyPreview | null = null
  if (ctx.parent) {
    parent = buildReplyPreview(ctx.parent, ctx.parentSender)
  }
  return {
    id: msg.id,
    text: msg.text,
    sender: ctx.sender?.username ?? null,
    sender_id: msg.sender_id,
    created_at: msg.created_at.toISOString(),
    edited_at: msg.edited_at ? msg.edited_at.toISOString() : null,
    avatar_url: ctx.sender?.avatar_url ?? null,
    deleted: msg.deleted,
    parent_id: msg.parent_id,
    parent,
    system_user_id: msg.system_user_id,
    system_username: ctx.systemUser?.username ?? null,
    system_avatar_url: ctx.systemUser?.avatar_url ?? null,
    attachments: ctx.attachments ?? [],
    reactions: ctx.reactions ?? [],
  }
}

// Resolve reactions for a batch of messages, grouped by message id and
// ordered by count (desc) then emoji.
export async function resolveReactionsByMessageIds(
  db: DB,
  messageIds: number[],
): Promise<Map<number, MessageReaction[]>> {
  const result = new Map<number, MessageReaction[]>()
  if (messageIds.length === 0) return result

  const rows = await db
    .select({
      message_id: messageReactions.message_id,
      emoji: messageReactions.emoji,
      user_id: users.id,
      username: users.username,
      avatar_url: users.avatar_url,
      created_at: messageReactions.created_at,
    })
    .from(messageReactions)
    .innerJoin(users, eq(users.id, messageReactions.user_id))
    .where(inArray(messageReactions.message_id, messageIds))
    .orderBy(asc(messageReactions.created_at))

  const grouped = new Map<number, Map<string, MessageReaction>>()
  for (const row of rows) {
    let byEmoji = grouped.get(row.message_id)
    if (!byEmoji) {
      byEmoji = new Map()
      grouped.set(row.message_id, byEmoji)
    }
    let reaction = byEmoji.get(row.emoji)
    if (!reaction) {
      reaction = { emoji: row.emoji, users: [] }
      byEmoji.set(row.emoji, reaction)
    }
    reaction.users.push({
      id: row.user_id,
      username: row.username,
      avatar_url: row.avatar_url,
    })
  }

  for (const [messageId, byEmoji] of grouped) {
    const reactions = Array.from(byEmoji.values())
    reactions.sort(
      (a, b) =>
        b.users.length - a.users.length || a.emoji.localeCompare(b.emoji),
    )
    result.set(messageId, reactions)
  }
  return result
}

export async function resolveReactionsForMessage(
  db: DB,
  messageId: number,
): Promise<MessageReaction[]> {
  const map = await resolveReactionsByMessageIds(db, [messageId])
  return map.get(messageId) ?? []
}
