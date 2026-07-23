import type { DB } from "@/db/index"
import { roomMembers, users, type RoomMember, type User } from "@/db/schema"
import { USER_JWT_SECRET } from "@/lib/config"
import { httpError } from "@/lib/httpError"
import { decodeTokenPayload } from "@/lib/token"
import { and, eq } from "drizzle-orm"

export async function getUserByEmail(
  db: DB,
  email: string,
): Promise<User | undefined> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1)
  return rows[0] as User | undefined
}

export async function httpGetUser(db: DB, token: string | null): Promise<User> {
  if (!token) throw httpError(401, "missing_token")

  let email: unknown
  try {
    email = (await decodeTokenPayload(USER_JWT_SECRET, token))?.sub
  } catch {
    throw httpError(401, "invalid_token")
  }
  if (!email) throw httpError(401, "invalid_token_subject")

  const user = await getUserByEmail(db, String(email))
  if (!user) throw httpError(404, "user_not_found")
  return user
}

export async function wsGetUser(db: DB, token: string | null): Promise<User> {
  if (!token) {
    throw new Error("Missing token")
  }

  let email: unknown
  try {
    email = (await decodeTokenPayload(USER_JWT_SECRET, token))?.sub
  } catch {
    throw new Error("Invalid token")
  }
  if (!email) throw new Error("Missing subject")

  const user = await getUserByEmail(db, String(email))
  if (!user) throw new Error("User not found")
  return user
}

export async function httpGetMembership(
  db: DB,
  userId: number,
  roomId: number,
  requiredStatus: "active" | "pending" | "banned" = "active",
): Promise<RoomMember> {
  const rows = await db
    .select()
    .from(roomMembers)
    .where(
      and(
        eq(roomMembers.room_id, roomId),
        eq(roomMembers.user_id, userId),
        eq(roomMembers.status, requiredStatus),
      ),
    )
    .limit(1)
  const membership = rows[0] as RoomMember | undefined
  if (!membership) throw httpError(403, "room_not_authorized")
  return membership
}

export async function wsGetMembership(
  db: DB,
  roomId: number,
  userId: number,
): Promise<RoomMember> {
  const rows = await db
    .select()
    .from(roomMembers)
    .where(
      and(eq(roomMembers.room_id, roomId), eq(roomMembers.user_id, userId)),
    )
    .limit(1)
  const membership = rows[0] as RoomMember | undefined
  if (!membership) {
    throw new Error("Not authorized for this room")
  }
  return membership
}

export async function ownerOrAdminGuard(
  db: DB,
  userId: number,
  roomId: number,
): Promise<RoomMember> {
  const membership = await httpGetMembership(db, userId, roomId)
  if (membership.role !== "owner" && membership.role !== "admin") {
    throw httpError(403, "room_owner_or_admin_required")
  }
  return membership
}
