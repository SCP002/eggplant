import { migrate } from "drizzle-orm/pglite/migrator"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { registrationRules } from "../src/db/schema.js"
import { createTestDb, resetTestDb } from "../src/db/testDb.js"
import { isEmailAllowed } from "../src/lib/allowlist.js"

const MIGRATIONS_DIR = new URL("../drizzle/", import.meta.url).pathname

describe("isEmailAllowed", () => {
  let db: ReturnType<typeof createTestDb>

  beforeAll(async () => {
    db = createTestDb()
    await resetTestDb(db)
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR })
  })

  beforeEach(async () => {
    await db.delete(registrationRules)
  })

  afterAll(async () => {
    await db.execute("DROP SCHEMA public CASCADE")
  })

  async function insertRule(email: string, action: "allow" | "deny") {
    await db.insert(registrationRules).values({ email, action })
  }

  it("allows everyone when no rules exist", async () => {
    expect(await isEmailAllowed(db, "anyone@example.com")).toBe(true)
  })

  it("denies emails with a deny rule even when allow rules exist", async () => {
    await insertRule("alice@example.com", "allow")
    await insertRule("mallory@example.com", "deny")
    expect(await isEmailAllowed(db, "alice@example.com")).toBe(true)
    expect(await isEmailAllowed(db, "mallory@example.com")).toBe(false)
  })

  it("blocks unlisted emails in whitelist mode", async () => {
    await insertRule("alice@example.com", "allow")
    expect(await isEmailAllowed(db, "bob@example.com")).toBe(false)
  })

  it("matches emails case-insensitively", async () => {
    await insertRule("alice@example.com", "allow")
    expect(await isEmailAllowed(db, "ALICE@example.com")).toBe(true)
  })
})
