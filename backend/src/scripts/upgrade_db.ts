import { execSync } from "node:child_process"
import { createInterface } from "node:readline/promises"

const rl = createInterface({ input: process.stdin, output: process.stdout })

async function promptYesNo(prompt: string): Promise<boolean> {
  while (true) {
    const resp = (await rl.question(prompt)).trim().toLowerCase()
    if (resp === "y") return true
    if (resp === "n") return false
    console.log("Please answer 'y' or 'n'.")
  }
}

async function upgradeDb(): Promise<void> {
  if (await promptYesNo("Generate new migration from schema changes? ")) {
    const msg = (await rl.question("Enter revision message: ")).trim()
    if (!msg) throw new Error("Revision message is required")
    execSync(`npx drizzle-kit generate --name "${msg}"`, {
      stdio: "inherit",
      cwd: process.cwd(),
    })
  }

  if (await promptYesNo("Apply pending migrations? ")) {
    execSync("npx drizzle-kit migrate", {
      stdio: "inherit",
      cwd: process.cwd(),
    })
  }

  rl.close()
}

upgradeDb().catch((e) => {
  console.error(e)
  rl.close()
  process.exit(1)
})
