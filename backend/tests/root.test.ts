import type { FastifyInstance } from "fastify"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { buildTestApp, closeTestApp } from "./setup.js"

describe("root", () => {
  let app: FastifyInstance

  beforeAll(async () => {
    const ctx = await buildTestApp()
    app = ctx.app
  })

  afterAll(async () => {
    await closeTestApp(app)
  })

  it("GET / responds with status", async () => {
    const res = await app.inject({ method: "GET", url: "/" })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: "Server is running" })
  })
})
