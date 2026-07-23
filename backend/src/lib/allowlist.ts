import type { DB } from "@/db/index"
import { registrationRules } from "@/db/schema"
import { eq, sql } from "drizzle-orm"

export async function isEmailAllowed(db: DB, email: string): Promise<boolean> {
  const rows = await db
    .select({ action: registrationRules.action })
    .from(registrationRules)
    .where(sql`lower(${registrationRules.email}) = lower(${email.trim()})`)
    .limit(1)

  if (rows.length === 0) {
    const allowRows = await db
      .select({ id: registrationRules.id })
      .from(registrationRules)
      .where(eq(registrationRules.action, "allow"))
      .limit(1)
    return allowRows.length === 0
  }

  return rows[0].action === "allow"
}
