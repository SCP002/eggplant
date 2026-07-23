import { getDb, resetDbInstance } from "@/db"
import { adminUsers } from "@/db/schema"
import { hashPassword } from "@/lib/password"

async function createAdmin(username: string, password: string): Promise<void> {
  const db = getDb()
  try {
    const hashed_password = await hashPassword(password)
    await db.insert(adminUsers).values({ username, hashed_password })
    console.log(`Admin user '${username}' created successfully`)
  } catch (e) {
    console.error(`Error creating admin:`, e)
  } finally {
    resetDbInstance()
  }
}

const [_bin, _script, username, password] = process.argv
if (!username || !password) {
  console.error(
    "Usage: npx tsx src/scripts/create_admin.ts <username> <password>",
  )
  process.exit(1)
}

createAdmin(username, password)
