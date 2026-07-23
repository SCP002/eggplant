import { createAdminApp } from "@/admin"
import { buildApp } from "@/app"

async function main(): Promise<void> {
  const app = await buildApp()
  try {
    await app.listen({
      host: "0.0.0.0",
      port: Number(process.env["PORT"] ?? 8000),
    })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }

  const adminApp = await createAdminApp()
  try {
    await adminApp.listen({
      host: "0.0.0.0",
      port: Number(process.env["ADMIN_PORT"] ?? 8001),
    })
  } catch (err) {
    adminApp.log.error(err)
    process.exit(1)
  }
}

void main()
