import type { RoomResp } from "@eggplant/shared/api"
import { create } from "zustand"

type RoomsState = {
  rooms: RoomResp[]
  setRooms: (r: RoomResp[]) => void
}

export const useRoomsStore = create<RoomsState>((set) => ({
  rooms: [],
  setRooms: (rooms) => set({ rooms }),
}))
