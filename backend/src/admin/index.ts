import { rmSync } from "fs"
import path from "path"
import { getDb } from "@/db"
import * as schema from "@/db/schema"
import { ADMIN_JWT_SECRET } from "@/lib/config"
import { ROOM_AVATAR_DIR, USER_AVATAR_DIR } from "@/lib/constants"
import {
  collectFilesByMessageIds,
  collectRoomMessageFiles,
  collectUserMessageFiles,
  deleteFileAttachmentRows,
  deleteFilesOnDisk,
} from "@/lib/files"
import { verifyPassword } from "@/lib/password"
import { buildAuthenticatedRouter } from "@adminjs/fastify"
import AdminJS from "adminjs"
import { Database, Resource } from "adminjs-drizzle/pg"
import { eq } from "drizzle-orm"
import type { FastifyInstance } from "fastify"
import Fastify from "fastify"

function adminCleanup(
  db: ReturnType<typeof getDb>,
  collector: (
    db: ReturnType<typeof getDb>,
    ids: number[],
  ) => Promise<{
    files: string[]
    avatars: string[]
  }>,
): {
  before: (
    request: {
      params?: { recordId?: string }
      query?: { recordIds?: string }
    },
    context: Record<string, unknown>,
  ) => unknown
  after: (
    response: unknown,
    request: { method?: string },
    context: Record<string, unknown>,
  ) => unknown
} {
  return {
    before: async (request, context) => {
      const pending = (
        request.params?.recordId
          ? [request.params.recordId]
          : (request.query?.recordIds ?? "").split(",")
      )
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id))
      if (pending.length > 0) {
        context["_cleanupData"] = await collector(db, pending)
      }
      return request
    },
    after: async (response, request, context) => {
      // The GET request loads the confirmation/drawer, files must be cleaned after the delete (POST).
      if (request.method !== "post") return response
      const { files, avatars } = (context["_cleanupData"] as
        { files: string[]; avatars: string[] } | undefined) ?? {
        files: [],
        avatars: [],
      }
      await deleteFileAttachmentRows(db, files)
      deleteFilesOnDisk(files)
      for (const avatar of avatars) {
        try {
          rmSync(avatar, { force: true })
        } catch {
          // ignore
        }
      }
      return response
    },
  }
}

const roomCollector = (db: ReturnType<typeof getDb>, roomIds: number[]) =>
  Promise.all(
    roomIds.map(async (id) => {
      const room = (
        await db
          .select()
          .from(schema.rooms)
          .where(eq(schema.rooms.id, id))
          .limit(1)
      )[0]
      return {
        files: await collectRoomMessageFiles(db, id),
        avatars: room?.avatar_url
          ? [path.join(ROOM_AVATAR_DIR, path.basename(room.avatar_url))]
          : [],
      }
    }),
  ).then((results) => ({
    files: results.flatMap((r) => r.files),
    avatars: results.flatMap((r) => r.avatars),
  }))

const userCollector = (db: ReturnType<typeof getDb>, userIds: number[]) =>
  Promise.all(
    userIds.map(async (id) => {
      const user = (
        await db
          .select()
          .from(schema.users)
          .where(eq(schema.users.id, id))
          .limit(1)
      )[0]
      return {
        files: await collectUserMessageFiles(db, id),
        avatars: user?.avatar_url
          ? [path.join(USER_AVATAR_DIR, path.basename(user.avatar_url))]
          : [],
      }
    }),
  ).then((results) => ({
    files: results.flatMap((r) => r.files),
    avatars: results.flatMap((r) => r.avatars),
  }))

const messageCollector = (db: ReturnType<typeof getDb>, messageIds: number[]) =>
  collectFilesByMessageIds(db, messageIds).then((files) => ({
    files,
    avatars: [],
  }))

export function buildAdminJs(db: ReturnType<typeof getDb>): AdminJS {
  AdminJS.registerAdapter({ Database, Resource })

  const collect = (
    collector: (
      db: ReturnType<typeof getDb>,
      ids: number[],
    ) => Promise<{ files: string[]; avatars: string[] }>,
  ) => adminCleanup(db, collector)

  const cleanupByTableName = new Map<
    string,
    { delete: unknown; bulkDelete: unknown }
  >([
    [
      "room_messages",
      {
        delete: collect(messageCollector),
        bulkDelete: collect(messageCollector),
      },
    ],
    [
      "rooms",
      { delete: collect(roomCollector), bulkDelete: collect(roomCollector) },
    ],
    [
      "users",
      { delete: collect(userCollector), bulkDelete: collect(userCollector) },
    ],
  ])

  const adapterDatabase = new Database({
    db,
    schema,
  } as unknown as ConstructorParameters<typeof Database>[0])
  const resources = adapterDatabase.resources().map((resource) => {
    // AdminJS submits empty form inputs as "" which Postgres rejects for
    // number/date/jsonb/reference columns. Convert them to null before
    // create/update.
    const emptyToNullProperties = new Set(
      resource
        .properties()
        .filter((p) =>
          [
            "number",
            "float",
            "date",
            "datetime",
            "uuid",
            "textarea",
            "reference",
          ].includes(p.type()),
        )
        .map((p) => p.path()),
    )
    const sanitizePayload = (
      request: { payload?: Record<string, unknown> } | undefined,
    ) => {
      const payload = request?.payload
      if (!payload) return request
      for (const key of emptyToNullProperties) {
        if (payload[key] === "") payload[key] = null
      }
      return request
    }
    const actions = cleanupByTableName.get(resource.id())
    const options = {
      actions: {
        new: { before: sanitizePayload },
        edit: { before: sanitizePayload },
        ...(actions ?? {}),
      },
    }
    return { resource, options }
  })

  return new AdminJS({
    rootPath: "/admin",
    resources,
    locale: {
      language: "en",
      availableLanguages: ["en"],
      debug: false,
    },
  })
}

export async function createAdminApp(): Promise<FastifyInstance> {
  const db = getDb()
  const adminJs = buildAdminJs(db)

  const app = Fastify({ logger: false })

  await buildAuthenticatedRouter(
    adminJs,
    {
      cookiePassword: ADMIN_JWT_SECRET,
      cookieName: "adminjs",
      authenticate: async (email: string, password: string) => {
        const rows = await db
          .select()
          .from(schema.adminUsers)
          .where(eq(schema.adminUsers.username, email))
          .limit(1)
        if (rows.length === 0) return null
        const adminUser = rows[0]
        const valid = await verifyPassword(adminUser.hashed_password, password)
        if (!valid) return null
        return { email: adminUser.username }
      },
    },
    app,
  )

  app.get("/admin/", async (_req, reply) => {
    return reply.redirect(adminJs.options.rootPath)
  })

  return app
}
