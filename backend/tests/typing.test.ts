import { describe, expect, it } from "vitest"
import { isTypingThrottled } from "../src/routes/ws.js"
import { roomConnections, type SocketLike } from "../src/ws/manager.js"
import { broadcastTyping } from "../src/ws/rooms.js"

interface MockSocket extends SocketLike {
  sent: string[]
}

function makeMockSocket(): MockSocket {
  return {
    readyState: 1,
    sent: [],
    send: function (data: string | Buffer | ArrayBuffer | Buffer[]) {
      this.sent.push(String(data))
    },
  }
}

describe("typing indicator", () => {
  it("broadcasts a typing event to every connection in the room", async () => {
    const socketA = makeMockSocket()
    const socketB = makeMockSocket()
    roomConnections.add(7, socketA, 1)
    roomConnections.add(7, socketB, 2)

    await broadcastTyping(7, { id: 1, username: "alice" })

    for (const socket of [socketA, socketB]) {
      const parsed = JSON.parse(socket.sent[0]) as {
        type: string
        payload: { user_id: number; username: string }
      }
      expect(parsed.type).toBe("typing")
      expect(parsed.payload.user_id).toBe(1)
      expect(parsed.payload.username).toBe("alice")
    }
  })

  it("throttles repeated typing events from the same socket", () => {
    const socket: { lastTypingAt?: number } = {}

    expect(isTypingThrottled(socket, 1000)).toBe(false)
    socket.lastTypingAt = 1000

    expect(isTypingThrottled(socket, 2999)).toBe(true)
    expect(isTypingThrottled(socket, 3001)).toBe(false)
  })
})
