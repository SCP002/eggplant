import { describe, expect, it } from "vitest"
import { heartbeatSweep } from "../src/routes/ws.js"
import {
  chatConnections,
  roomConnections,
  updateListeners,
  type SocketLike,
} from "../src/ws/manager.js"

interface MockSocket extends SocketLike {
  isAlive?: boolean
  pingCalls: number
  terminateCalls: number
  on: (event: string, listener: (...args: unknown[]) => void) => unknown
  ping: () => void
  terminate: () => void
}

function makeMockSocket(): MockSocket {
  return {
    readyState: 1,
    pingCalls: 0,
    terminateCalls: 0,
    on: () => undefined,
    ping: function () {
      this.pingCalls++
    },
    terminate: function () {
      this.terminateCalls++
    },
    send: () => undefined,
  }
}

describe("websocket heartbeat sweep", () => {
  it("does not terminate a healthy socket registered in multiple registries", () => {
    const socket = makeMockSocket()
    socket.isAlive = true
    roomConnections.add(1, socket, 1)
    chatConnections.add(1, socket, 1)

    heartbeatSweep()

    expect(socket.terminateCalls).toBe(0)
    expect(socket.pingCalls).toBe(1)
  })

  it("keeps a healthy socket alive across sweeps", () => {
    const socket = makeMockSocket()
    socket.isAlive = true
    updateListeners.add(1, socket)

    heartbeatSweep()
    socket.isAlive = true
    heartbeatSweep()
    socket.isAlive = true
    heartbeatSweep()

    expect(socket.terminateCalls).toBe(0)
    expect(socket.pingCalls).toBe(3)
  })

  it("terminates a socket that missed a heartbeat", () => {
    const socket = makeMockSocket()
    socket.isAlive = false
    roomConnections.add(1, socket, 1)

    heartbeatSweep()

    expect(socket.terminateCalls).toBe(1)
    expect(socket.pingCalls).toBe(0)
  })
})
