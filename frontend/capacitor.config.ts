import { loadEnvFile } from "node:process"
import type { CapacitorConfig } from "@capacitor/cli"

loadEnvFile("../.env")

const url = `https://${process.env.PROD_DOMAIN || "localhost"}`

const config: CapacitorConfig = {
  appId: "com.eggplant.app",
  appName: "Eggplant",
  webDir: "dist",
  server: { url },
  android: {},
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_launcher_foreground",
      iconColor: "#1a1a2e",
    },
  },
}

export default config
