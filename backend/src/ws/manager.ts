export interface SocketLike {
  send(data: string | Buffer | ArrayBuffer | Buffer[]): void
  readyState: number
}

export interface RoomConnection {
  ws: SocketLike
  user_id: number
}

class RoomConnections {
  private rooms = new Map<number, RoomConnection[]>()

  add(roomId: number, ws: SocketLike, userId: number): void {
    const list = this.rooms.get(roomId)
    if (list) list.push({ ws, user_id: userId })
    else this.rooms.set(roomId, [{ ws, user_id: userId }])
  }

  remove(roomId: number, ws: SocketLike, userId: number): void {
    const conns = this.rooms.get(roomId)
    if (!conns) return
    const idx = conns.findIndex((c) => c.ws === ws && c.user_id === userId)
    if (idx !== -1) conns.splice(idx, 1)
    if (conns.length === 0) this.rooms.delete(roomId)
  }

  get(roomId: number): RoomConnection[] {
    return this.rooms.get(roomId) ?? []
  }

  has(roomId: number): boolean {
    return this.rooms.has(roomId)
  }

  allSockets(): SocketLike[] {
    const out: SocketLike[] = []
    for (const list of this.rooms.values()) out.push(...list.map((c) => c.ws))
    return out
  }

  isUserConnectedToRoom(roomId: number, userId: number): boolean {
    return this.get(roomId).some((c) => c.user_id === userId)
  }
}

export const roomConnections = new RoomConnections()
export const chatConnections = new RoomConnections()

class UpdateListeners {
  private users = new Map<number, Set<SocketLike>>()

  add(userId: number, ws: SocketLike): void {
    const set = this.users.get(userId)
    if (set) set.add(ws)
    else this.users.set(userId, new Set([ws]))
  }

  remove(userId: number, ws: SocketLike): void {
    const set = this.users.get(userId)
    if (!set) return
    set.delete(ws)
    if (set.size === 0) this.users.delete(userId)
  }

  onlineUserIds(): Set<number> {
    const ids = new Set<number>()
    for (const [uid, set] of this.users.entries()) {
      if (set.size > 0) ids.add(uid)
    }
    return ids
  }

  allSockets(): SocketLike[] {
    const out: SocketLike[] = []
    for (const set of this.users.values()) out.push(...set)
    return out
  }

  socketsForUser(userId: number): SocketLike[] {
    return Array.from(this.users.get(userId) ?? [])
  }
}

export const updateListeners = new UpdateListeners()

class RoomsListeners {
  private users = new Map<number, Set<SocketLike>>()

  add(userId: number, ws: SocketLike): void {
    const set = this.users.get(userId)
    if (set) set.add(ws)
    else this.users.set(userId, new Set([ws]))
  }

  remove(userId: number, ws: SocketLike): void {
    const set = this.users.get(userId)
    if (!set) return
    set.delete(ws)
    if (set.size === 0) this.users.delete(userId)
  }

  socketsForUser(userId: number): SocketLike[] {
    return Array.from(this.users.get(userId) ?? [])
  }

  allSockets(): SocketLike[] {
    const out: SocketLike[] = []
    for (const set of this.users.values()) out.push(...set)
    return out
  }
}

export const roomsListeners = new RoomsListeners()

type Jsonable = Record<string, unknown>

function isOpen(ws: SocketLike): boolean {
  return ws.readyState === 1
}

async function safeSend(ws: SocketLike, data: Jsonable): Promise<void> {
  if (!isOpen(ws)) return
  try {
    ws.send(JSON.stringify(data))
  } catch {
    // ignore send failures to single connections
  }
}

export async function sendToSockets(
  sockets: SocketLike[],
  data: Jsonable,
): Promise<void> {
  await Promise.all(sockets.map((ws) => safeSend(ws, data)))
}

export async function broadcastToRoom(
  roomId: number,
  data: Jsonable,
): Promise<void> {
  if (!roomConnections.has(roomId)) return
  await sendToSockets(
    roomConnections.get(roomId).map((c) => c.ws),
    data,
  )
}

export async function broadcastToUserSockets(
  userId: number,
  data: Jsonable,
): Promise<void> {
  await sendToSockets(updateListeners.socketsForUser(userId), data)
}

export async function broadcastUserUpdate(data: Jsonable): Promise<void> {
  await sendToSockets(updateListeners.allSockets(), data)
}
