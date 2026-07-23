import type { PgliteDatabase } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"
import type { FastifyInstance } from "fastify"
import { setDb } from "../src/db/index.js"
import type * as schema from "../src/db/schema.js"
import { createTestDb, resetTestDb } from "../src/db/testDb.js"

const MIGRATIONS_DIR = new URL("../drizzle/", import.meta.url).pathname

export interface TestContext {
  db: PgliteDatabase<typeof schema>
  app: FastifyInstance
}

export async function buildTestApp(): Promise<TestContext> {
  process.env["TESTING"] = "true"

  const db = createTestDb()
  setDb(db)
  await resetTestDb(db)
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR })

  const { buildApp } = await import("../src/app.js")
  const app = await buildApp({ testing: true })

  return { db, app }
}

export async function closeTestApp(app: FastifyInstance): Promise<void> {
  await app.close()
  // reset the singleton so a subsequent buildTestApp gets a fresh one
  const { resetDbInstance } = await import("../src/db/index.js")
  resetDbInstance()
}
