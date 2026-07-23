import "dotenv/config"

export function getEnvVar(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Environment variable '${name}' is not set.`)
  }
  return value
}

export function isTesting(): boolean {
  return process.env["TESTING"] === "true"
}

export function setTesting(): void {
  process.env["TESTING"] = "true"
}
