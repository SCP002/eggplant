import { execSync } from "node:child_process"
import { getDb, resetDbInstance } from "@/db"
import { sql } from "drizzle-orm"

async function resetDb(): Promise<void> {
  const db = getDb()
  await db.execute(sql`DROP SCHEMA public CASCADE`)
  await db.execute(sql`CREATE SCHEMA public`)
  resetDbInstance()
  console.log("Dropped all tables")
  execSync("npx drizzle-kit migrate", { stdio: "inherit", cwd: process.cwd() })
  console.log("Created all tables")
}

resetDb()
