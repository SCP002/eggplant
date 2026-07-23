import { wsReqSchema } from "@eggplant/shared/ws"
import { describe, expect, it } from "vitest"

describe("wsReqSchema", () => {
  it("parses a message without file_ids, defaulting to []", () => {
    const parsed = wsReqSchema.safeParse({
      type: "message",
      payload: { text: "hello", parent_id: null },
    })
    expect(parsed.success).toBe(true)
    if (parsed.success && parsed.data.type === "message") {
      expect(parsed.data.payload.file_ids).toEqual([])
    }
  })

  it("parses a message with a parent and attachments", () => {
    const parsed = wsReqSchema.safeParse({
      type: "message",
      payload: { text: "hello", parent_id: 3, file_ids: ["a.png"] },
    })
    expect(parsed.success).toBe(true)
  })

  it("parses a message with only text (no parent, no files)", () => {
    const parsed = wsReqSchema.safeParse({
      type: "message",
      payload: { text: "just text" },
    })
    expect(parsed.success).toBe(true)
    if (parsed.success && parsed.data.type === "message") {
      expect(parsed.data.payload.parent_id).toBeUndefined()
      expect(parsed.data.payload.file_ids).toEqual([])
    }
  })

  it("parses an edit_message without optional file fields", () => {
    const parsed = wsReqSchema.safeParse({
      type: "edit_message",
      payload: { message_id: 1, text: "edited" },
    })
    expect(parsed.success).toBe(true)
  })

  it("parses a typing message", () => {
    const parsed = wsReqSchema.safeParse({ type: "typing", payload: {} })
    expect(parsed.success).toBe(true)
  })

  it("rejects an unknown message type", () => {
    const parsed = wsReqSchema.safeParse({ type: "explode", payload: {} })
    expect(parsed.success).toBe(false)
  })

  it("rejects a message missing its text", () => {
    const parsed = wsReqSchema.safeParse({
      type: "message",
      payload: { parent_id: null },
    })
    expect(parsed.success).toBe(false)
  })

  it("rejects a react with a non-string emoji", () => {
    const parsed = wsReqSchema.safeParse({
      type: "react",
      payload: { message_id: 1, emoji: 42 },
    })
    expect(parsed.success).toBe(false)
  })

  it("parses call_start, call_join and call_leave messages", () => {
    for (const type of ["call_start", "call_join", "call_leave"]) {
      const parsed = wsReqSchema.safeParse({ type, payload: {} })
      expect(parsed.success).toBe(true)
    }
  })
})
