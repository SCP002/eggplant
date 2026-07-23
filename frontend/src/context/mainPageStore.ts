import type { RoomResp, User } from "@eggplant/shared/api"
import { create } from "zustand"

type MobileView = "rooms" | "chat" | "members"

type MainPageState = {
  user: User | null
  setUser: (u: User | null) => void
  updateUser: (u: User) => void
  room: RoomResp | null
  setRoom: (r: RoomResp | null) => void
  userUpdateEvent: User | null
  setUserUpdateEvent: (u: User | null) => void
  disconnectedNoticeShown: boolean
  setDisconnectedNoticeShown: (v: boolean) => void
  mobileView: MobileView
  setMobileView: (v: MobileView) => void
}

export const useMainPageStore = create<MainPageState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  updateUser: (updated) =>
    set((state) => ({
      user: state.user
        ? {
            ...state.user,
            username: updated.username,
            avatar_url: updated.avatar_url,
          }
        : state.user,
    })),
  room: null,
  setRoom: (room) => set({ room }),
  userUpdateEvent: null,
  setUserUpdateEvent: (u) => set({ userUpdateEvent: u }),
  disconnectedNoticeShown: false,
  setDisconnectedNoticeShown: (v) => set({ disconnectedNoticeShown: v }),
  mobileView: "rooms",
  setMobileView: (v) => set({ mobileView: v }),
}))
