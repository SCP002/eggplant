import { getDb } from "@/db/index"
import { rooms } from "@/db/schema"
import { LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL } from "@/lib/config"
import { httpError } from "@/lib/httpError"
import { extractBearerToken } from "@/lib/requestAuth"
import { httpGetMembership, httpGetUser } from "@/lib/validate"
import { getCall } from "@/ws/calls"
import { eq } from "drizzle-orm"
import type { FastifyInstance } from "fastify"
import { AccessToken } from "livekit-server-sdk"

export async function registerCallsRoutes(
  router: FastifyInstance,
): Promise<void> {
  const db = getDb()

  router.get("/api/rooms/:roomId/call/token", async (request) => {
    const { roomId } = request.params as { roomId: string }
    const rid = Number(roomId)
    const user = await httpGetUser(db, extractBearerToken(request))
    await httpGetMembership(db, user.id, rid)

    const roomRows = await db
      .select()
      .from(rooms)
      .where(eq(rooms.id, rid))
      .limit(1)
    if (roomRows.length === 0) throw httpError(404, "room_not_found")
    const room = roomRows[0]
    if (room.is_general) throw httpError(400, "calls_disabled_in_general")

    const call = getCall(rid)
    if (!call) throw httpError(400, "call_not_found")

    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: `user-${user.id}`,
      ttl: "10m",
    })
    at.addGrant({
      roomJoin: true,
      room: `room-${rid}`,
      canPublish: true,
      canSubscribe: true,
    })
    const token = await at.toJwt()
    return { url: LIVEKIT_URL, token }
  })
}
