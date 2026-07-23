import { rmSync } from "fs"
import path from "path"
import type { DB } from "@/db/index"
import { fileAttachments, roomMessages } from "@/db/schema"
import { FILES_DIR } from "@/lib/constants"
import { and, eq, inArray, isNull } from "drizzle-orm"

export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0]

export function deleteFilesOnDisk(fileNames: string[]): void {
  for (const filename of fileNames) {
    try {
      rmSync(path.join(FILES_DIR, filename), { force: true })
    } catch {
      // ignore
    }
    try {
      rmSync(path.join(FILES_DIR, `preview_${filename}`), { force: true })
    } catch {
      // ignore
    }
  }
}

export async function deleteFileAttachmentRows(
  tx: DB | Tx,
  basenames: string[],
): Promise<void> {
  if (basenames.length === 0) return
  await tx
    .delete(fileAttachments)
    .where(inArray(fileAttachments.basename, basenames))
}

export async function collectRoomMessageFiles(
  db: DB,
  roomId: number,
): Promise<string[]> {
  const result = await db
    .select({ file_ids: roomMessages.file_ids })
    .from(roomMessages)
    .where(eq(roomMessages.room_id, roomId))
  return result.flatMap((m) => m.file_ids ?? [])
}

export async function collectUserMessageFiles(
  db: DB,
  userId: number,
): Promise<string[]> {
  const result = await db
    .select({ file_ids: roomMessages.file_ids })
    .from(roomMessages)
    .where(eq(roomMessages.sender_id, userId))
  const messageFileIds = result.flatMap((m) => m.file_ids ?? [])
  const unattached = await db
    .select({ basename: fileAttachments.basename })
    .from(fileAttachments)
    .where(
      and(
        eq(fileAttachments.uploader_id, userId),
        isNull(fileAttachments.message_id),
      ),
    )
  return [...messageFileIds, ...unattached.map((a) => a.basename)]
}

export async function collectFilesByMessageIds(
  db: DB,
  messageIds: number[],
): Promise<string[]> {
  if (messageIds.length === 0) return []
  const result = await db
    .select({ file_ids: roomMessages.file_ids })
    .from(roomMessages)
    .where(inArray(roomMessages.id, messageIds))
  return result.flatMap((m) => m.file_ids ?? [])
}
