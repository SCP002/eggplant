import type { DB } from "@/db/index"
import { rooms } from "@/db/schema"
import type { Room } from "@/db/schema"
import { eq } from "drizzle-orm"

export async function getOrCreateGeneralRoom(db: DB): Promise<Room> {
  const rows = await db
    .select()
    .from(rooms)
    .where(eq(rooms.is_general, true))
    .limit(1)
  const existing = rows[0] as Room | undefined
  if (existing) return existing

  const created = await db
    .insert(rooms)
    .values({
      name: "General",
      is_private: false,
      is_general: true,
      owner_id: null,
    })
    .returning()
  return created[0] as Room
}

export function isDm(room: Room): boolean {
  return room.dm_user_low_id !== null && room.dm_user_high_id !== null
}

export function getDmPeerId(room: Room, userId: number): number | null {
  if (room.dm_user_low_id === null || room.dm_user_high_id === null) return null
  if (userId === room.dm_user_low_id) return room.dm_user_high_id
  if (userId === room.dm_user_high_id) return room.dm_user_low_id
  return null
}

export function dmRoomName(lowId: number, highId: number): string {
  return `dm:${lowId}:${highId}`
}
