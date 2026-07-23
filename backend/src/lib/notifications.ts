import type { DB } from "@/db/index"
import { notifications } from "@/db/schema"

export type NotificationImportance = "high" | "normal" | "low"

export interface CreateNotificationInput {
  userId: number
  invitationId?: number | null
  type: string
  params?: Record<string, string | number> | null
  title?: string | null
  description?: string | null
  importance: NotificationImportance
  actionLabel?: string | null
  actionToken?: string | null
}

export async function createNotification(
  db: DB,
  input: CreateNotificationInput,
): Promise<void> {
  await db.insert(notifications).values({
    user_id: input.userId,
    invitation_id: input.invitationId ?? null,
    type: input.type,
    params: input.params ?? null,
    title: input.title ?? "",
    description: input.description ?? null,
    importance: input.importance,
    action_label: input.actionLabel ?? null,
    action_token: input.actionToken ?? null,
  })
}
