import * as schema from "@/db/schema"
import { PGlite } from "@electric-sql/pglite"
import { sql } from "drizzle-orm"
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite"

let _client: PGlite | undefined

export function getTestClient(): PGlite {
  if (!_client) {
    _client = new PGlite()
  }
  return _client
}

export function createTestDb(): PgliteDatabase<typeof schema> {
  const db = drizzle(getTestClient(), { schema })
  return db as PgliteDatabase<typeof schema>
}

export async function resetTestDb(
  db: PgliteDatabase<typeof schema>,
): Promise<void> {
  await db.execute(sql`DROP SCHEMA public CASCADE`)
  await db.execute(sql`CREATE SCHEMA public`)
}
