import { migrate } from "drizzle-orm/pglite/migrator"
import { buildApp } from "./src/app.js"
import { setDb } from "./src/db/index.js"
import { createTestDb, resetTestDb } from "./src/db/testDb.js"

const MIGRATIONS_DIR = new URL("./drizzle/", import.meta.url).pathname

async function main(): Promise<void> {
  process.env["TESTING"] = "true"
  const db = createTestDb()
  setDb(db)
  await resetTestDb(db)
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR })
  const app = await buildApp({ testing: true })
  await app.listen({ host: "0.0.0.0", port: Number(process.env["PORT"] ?? 8000) })
  console.log(`e2e backend listening on ${process.env["PORT"] ?? 8000}`)
}

void main()
