import * as schema from "@/db/schema"
import { getEnvVar, isTesting } from "@/lib/env"
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres"
import type { PgliteDatabase } from "drizzle-orm/pglite"
import pg from "pg"
import { pino } from "pino"

export type DB = NodePgDatabase<typeof schema> | PgliteDatabase<typeof schema>

let _db: DB | undefined

const logger = pino()

export function getDb(): DB {
  if (_db) return _db

  if (isTesting()) {
    throw new Error("No database configured for testing. Call setDb() first.")
  }

  const pool = new pg.Pool({
    connectionString: getEnvVar("DATABASE_URL"),
    max: 10,
  })
  pool.on("error", (err) => {
    logger.error({ err }, "Unexpected error on idle database client")
  })
  _db = drizzle(pool, { schema })
  return _db
}

export function setDb(db: DB): void {
  _db = db
}

export function resetDbInstance(): void {
  _db = undefined
}
