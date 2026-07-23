import { getDb } from "@/db/index"
import { notifications } from "@/db/schema"
import { extractBearerToken } from "@/lib/requestAuth"
import { httpGetUser } from "@/lib/validate"
import type { NotificationResp } from "@eggplant/shared/api"
import { and, desc, eq } from "drizzle-orm"
import type { FastifyInstance } from "fastify"

function toResp(n: typeof notifications.$inferSelect): NotificationResp {
  return {
    id: n.id,
    invitation_id: n.invitation_id,
    type: n.type,
    params: n.params ?? null,
    title: n.title,
    description: n.description,
    importance: n.importance as NotificationResp["importance"],
    action_label: n.action_label,
    action_token: n.action_token,
    created_at: n.created_at.toISOString(),
  }
}

export async function registerNotificationsRoutes(
  router: FastifyInstance,
): Promise<void> {
  const db = getDb()

  router.get("/api/notifications", async (request) => {
    const user = await httpGetUser(db, extractBearerToken(request))
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.user_id, user.id))
      .orderBy(desc(notifications.created_at), desc(notifications.id))
      .limit(50)
    return rows.map(toResp)
  })

  router.delete("/api/notifications/token/:token", async (request) => {
    const user = await httpGetUser(db, extractBearerToken(request))
    const { token } = request.params as { token: string }
    await db
      .delete(notifications)
      .where(
        and(
          eq(notifications.user_id, user.id),
          eq(notifications.action_token, token),
        ),
      )
    return undefined
  })

  router.delete("/api/notifications", async (request) => {
    const user = await httpGetUser(db, extractBearerToken(request))
    await db.delete(notifications).where(eq(notifications.user_id, user.id))
    return undefined
  })
}
