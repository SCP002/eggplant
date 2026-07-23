import type { RoomMemberResp, User } from "@eggplant/shared/api"
import { create } from "zustand"

type RoomMembersState = {
  members: RoomMemberResp[]
  setMembers: (m: RoomMemberResp[]) => void
  updateMember: (u: User) => void
}

export const useRoomMembersStore = create<RoomMembersState>((set) => ({
  members: [],
  setMembers: (members) => set({ members }),
  updateMember: (user) =>
    set((state) => ({
      members: state.members.map((m) =>
        m.id === user.id
          ? {
              ...m,
              username: user.username,
              avatar_url: user.avatar_url ?? null,
            }
          : m,
      ),
    })),
}))
