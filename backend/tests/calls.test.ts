import { and, eq, isNull } from "drizzle-orm"
import type { FastifyInstance } from "fastify"
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import type { DB } from "../src/db/index.js"
import { roomMembers, roomMessages, rooms, users } from "../src/db/schema.js"
import type { Room, User } from "../src/db/schema.js"
import {
  getCall,
  joinCall,
  leaveCall,
  RING_TIMEOUT_MS,
  startCall,
} from "../src/ws/calls.js"
import { roomConnections, type SocketLike } from "../src/ws/manager.js"
import { buildTestApp, closeTestApp } from "./setup.js"

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

/**
 * Captures the ring timeout (the only setTimeout whose delay equals
 * RING_TIMEOUT_MS) so tests can fire it deterministically without touching the
 * real clock or the timers PGlite relies on.
 */
function stubRingTimeout() {
  const captured: Array<() => Promise<void> | void> = []
  const realSetTimeout = globalThis.setTimeout
  const spy = vi
    .spyOn(globalThis, "setTimeout")
    .mockImplementation((callback, delay, ...args) => {
      if (delay === RING_TIMEOUT_MS) {
        captured.push(callback as () => Promise<void> | void)
        return 1 as unknown as NodeJS.Timeout
      }
      return realSetTimeout(callback, delay, ...args)
    })
  return {
    spy,
    captured,
    async fire(): Promise<void> {
      const pending = captured.splice(0)
      for (const cb of pending) await cb()
    },
  }
}

let activeRingStub: { spy: { mockRestore: () => void } } | null = null

afterEach(() => {
  activeRingStub?.spy.mockRestore()
  activeRingStub = null
})

describe("voice calls", () => {
  let app: FastifyInstance
  let db: DB

  beforeAll(async () => {
    const ctx = await buildTestApp()
    app = ctx.app
    db = ctx.db
  }, 30_000)

  afterAll(async () => {
    await closeTestApp(app)
  }, 30_000)

  async function createUser(email: string, username: string) {
    const res = await app.inject({
      method: "POST",
      url: "/api/test/create_user",
      payload: { email, username, password: "password12345" },
    })
    return res.json() as {
      access_token: string
      room_id: number
    }
  }

  async function createRoom(accessToken: string, name: string) {
    const res = await app.inject({
      method: "POST",
      url: "/api/rooms",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name },
    })
    return res.json() as { id: number }
  }

  async function userByEmail(email: string): Promise<User> {
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1)
    return rows[0]
  }

  async function getRoom(roomId: number): Promise<Room> {
    const rows = await db
      .select()
      .from(rooms)
      .where(eq(rooms.id, roomId))
      .limit(1)
    return rows[0]
  }

  async function systemMessageKeys(roomId: number): Promise<string[]> {
    const rows = await db
      .select()
      .from(roomMessages)
      .where(
        and(eq(roomMessages.room_id, roomId), isNull(roomMessages.sender_id)),
      )
    return rows.map((r) => (JSON.parse(r.text) as { key: string }).key)
  }

  function connectMockSocket(roomId: number, userId: number): MockSocket {
    const socket = makeMockSocket()
    roomConnections.add(roomId, socket, userId)
    return socket
  }

  function lastCallState(socket: MockSocket): {
    type: string
    payload: { status: string }
  } {
    const frames = socket.sent
      .map(
        (raw) =>
          JSON.parse(raw) as { type: string; payload: { status: string } },
      )
      .filter((frame) => frame.type === "call_state")
    return frames[frames.length - 1]
  }

  it("rejects starting a call in the General room", async () => {
    const { room_id: generalRoomId } = await createUser(
      "call-general@example.com",
      "callgeneral",
    )
    const user = await userByEmail("call-general@example.com")
    const generalRoom = await getRoom(generalRoomId)

    await expect(
      startCall(db, generalRoom.id, user, generalRoom),
    ).rejects.toMatchObject({ wsErrorCode: "calls_disabled_in_general" })
  })

  it("rejects starting a second call in the same room", async () => {
    const { access_token: token } = await createUser(
      "call-double@example.com",
      "calldouble",
    )
    const user = await userByEmail("call-double@example.com")
    const roomRow = await getRoom((await createRoom(token, "Double Call")).id)
    const socket = connectMockSocket(roomRow.id, user.id)
    const ring = stubRingTimeout()
    activeRingStub = ring

    await startCall(db, roomRow.id, user, roomRow)
    await expect(
      startCall(db, roomRow.id, user, roomRow),
    ).rejects.toMatchObject({ wsErrorCode: "call_already_active" })

    await leaveCall(db, roomRow.id, user)
    roomConnections.remove(roomRow.id, socket, user.id)
  })

  it("reopens a hidden DM for a member on an incoming call", async () => {
    const { access_token: tokenA } = await createUser(
      "call-hide-a@example.com",
      "callhideat",
    )
    await createUser("call-hide-b@example.com", "callhidebt")
    const userA = await userByEmail("call-hide-a@example.com")
    const userB = await userByEmail("call-hide-b@example.com")

    const dmRes = await app.inject({
      method: "POST",
      url: `/api/dms/${userB.id}`,
      headers: { authorization: `Bearer ${tokenA}` },
    })
    expect(dmRes.statusCode).toBe(200)
    const dmId = (dmRes.json() as { id: number }).id

    // A hides the DM
    const hideRes = await app.inject({
      method: "DELETE",
      url: `/api/rooms/${dmId}/members/${userA.id}`,
      headers: { authorization: `Bearer ${tokenA}` },
    })
    expect(hideRes.statusCode).toBe(200)
    const hidden = await db
      .select()
      .from(roomMembers)
      .where(
        and(eq(roomMembers.room_id, dmId), eq(roomMembers.user_id, userA.id)),
      )
    expect(hidden[0].hidden).toBe(true)

    const dmRoom = await getRoom(dmId)
    const ring = stubRingTimeout()
    activeRingStub = ring

    // B starts a call -> A's DM membership is un-hidden so the room reappears
    await startCall(db, dmId, userB, dmRoom)
    const after = await db
      .select()
      .from(roomMembers)
      .where(
        and(eq(roomMembers.room_id, dmId), eq(roomMembers.user_id, userA.id)),
      )
    expect(after[0].hidden).toBe(false)

    await leaveCall(db, dmId, userB)
  })

  it("runs the full lifecycle: ringing -> active -> call_ended", async () => {
    const { access_token: tokenA } = await createUser(
      "call-a@example.com",
      "calla",
    )
    await createUser("call-b@example.com", "callb")
    const userA = await userByEmail("call-a@example.com")
    const userB = await userByEmail("call-b@example.com")
    const roomRow = await getRoom(
      (await createRoom(tokenA, "Lifecycle Call")).id,
    )

    await db.insert(roomMembers).values({
      room_id: roomRow.id,
      user_id: userB.id,
      role: "member",
      status: "active",
    })
    const socketA = connectMockSocket(roomRow.id, userA.id)
    const socketB = connectMockSocket(roomRow.id, userB.id)
    const ring = stubRingTimeout()
    activeRingStub = ring

    await startCall(db, roomRow.id, userA, roomRow)
    let call = getCall(roomRow.id)
    expect(call?.status).toBe("ringing")
    expect(await systemMessageKeys(roomRow.id)).toContain("call_started")
    expect(lastCallState(socketA).payload.status).toBe("ringing")

    await joinCall(db, roomRow.id, userB)
    call = getCall(roomRow.id)
    expect(call?.status).toBe("active")
    expect(await systemMessageKeys(roomRow.id)).toContain("call_joined")
    expect(lastCallState(socketA).payload.status).toBe("active")

    // Initiator leaves while active -> call continues with userB
    await leaveCall(db, roomRow.id, userA)
    expect(getCall(roomRow.id)?.status).toBe("active")
    expect(getCall(roomRow.id)?.participants.has(userB.id)).toBe(true)

    // Last participant leaves -> call_ended + state deleted
    await leaveCall(db, roomRow.id, userB)
    expect(getCall(roomRow.id)).toBeUndefined()
    expect(await systemMessageKeys(roomRow.id)).toContain("call_ended")
    expect(lastCallState(socketA).payload.status).toBe("ended")

    roomConnections.remove(roomRow.id, socketA, userA.id)
    roomConnections.remove(roomRow.id, socketB, userB.id)
  })

  it("cancels the call when the initiator hangs up while ringing", async () => {
    const { access_token: tokenA } = await createUser(
      "call-cancel@example.com",
      "callcancel",
    )
    const userA = await userByEmail("call-cancel@example.com")
    const roomRow = await getRoom((await createRoom(tokenA, "Cancel Call")).id)
    const socket = connectMockSocket(roomRow.id, userA.id)
    const ring = stubRingTimeout()
    activeRingStub = ring

    await startCall(db, roomRow.id, userA, roomRow)
    await leaveCall(db, roomRow.id, userA)
    expect(getCall(roomRow.id)).toBeUndefined()
    expect(await systemMessageKeys(roomRow.id)).toContain("call_cancelled")

    roomConnections.remove(roomRow.id, socket, userA.id)
  })

  it("marks the call as missed when nobody answers before the ring timeout", async () => {
    const { access_token: tokenA } = await createUser(
      "call-missed@example.com",
      "callmissed",
    )
    const userA = await userByEmail("call-missed@example.com")
    const roomRow = await getRoom((await createRoom(tokenA, "Missed Call")).id)
    const socket = connectMockSocket(roomRow.id, userA.id)
    const ring = stubRingTimeout()
    activeRingStub = ring

    await startCall(db, roomRow.id, userA, roomRow)
    expect(getCall(roomRow.id)?.status).toBe("ringing")

    await ring.fire()

    expect(getCall(roomRow.id)).toBeUndefined()
    expect(await systemMessageKeys(roomRow.id)).toContain("call_missed")
    expect(lastCallState(socket).payload.status).toBe("ended")

    roomConnections.remove(roomRow.id, socket, userA.id)
  })

  it("issues a LiveKit token only while a call exists in a non-General room", async () => {
    const { access_token: tokenA } = await createUser(
      "call-token@example.com",
      "calltoken",
    )
    const userA = await userByEmail("call-token@example.com")
    const roomRow = await getRoom((await createRoom(tokenA, "Token Call")).id)
    const ring = stubRingTimeout()
    activeRingStub = ring

    // No call -> 400
    let res = await app.inject({
      method: "GET",
      url: `/api/rooms/${roomRow.id}/call/token`,
      headers: { authorization: `Bearer ${tokenA}` },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe("call_not_found")

    await startCall(db, roomRow.id, userA, roomRow)

    // Active call -> { url, token }
    res = await app.inject({
      method: "GET",
      url: `/api/rooms/${roomRow.id}/call/token`,
      headers: { authorization: `Bearer ${tokenA}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.url).toBe("ws://localhost:7880")
    expect(typeof body.token).toBe("string")
    expect(body.token.split(".")).toHaveLength(3)

    // Non-member -> 403
    const { access_token: tokenC } = await createUser(
      "call-outsider@example.com",
      "calloutsider",
    )
    res = await app.inject({
      method: "GET",
      url: `/api/rooms/${roomRow.id}/call/token`,
      headers: { authorization: `Bearer ${tokenC}` },
    })
    expect(res.statusCode).toBe(403)

    // General room -> 400 even with a call in progress elsewhere
    const generalRoom = await getRoom(
      (await createUser("call-general2@example.com", "callgeneral2")).room_id,
    )
    res = await app.inject({
      method: "GET",
      url: `/api/rooms/${generalRoom.id}/call/token`,
      headers: { authorization: `Bearer ${tokenA}` },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe("calls_disabled_in_general")

    await leaveCall(db, roomRow.id, userA)
  })
})
