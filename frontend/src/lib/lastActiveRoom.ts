const KEY = "last_active_room_id"

export function getLastActiveRoomId(): number | null {
  const raw = localStorage.getItem(KEY)
  if (!raw) return null
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

export function setLastActiveRoomId(id: number): void {
  localStorage.setItem(KEY, String(id))
}
