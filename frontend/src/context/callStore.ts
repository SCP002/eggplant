import type { CallStateResp } from "@eggplant/shared/ws"
import type { Room } from "livekit-client"
import { create } from "zustand"

type CallStoreState = {
  call: CallStateResp | null
  joined: boolean
  muted: boolean
  participantCount: number
  ringDismissed: boolean
  livekitRoom: Room | null
  setCall: (call: CallStateResp | null) => void
  clearCall: () => void
  setJoined: (joined: boolean) => void
  setMuted: (muted: boolean) => void
  setRingDismissed: (dismissed: boolean) => void
  setLivekitRoom: (room: Room | null) => void
  reset: () => void
}

export const useCallStore = create<CallStoreState>((set) => ({
  call: null,
  joined: false,
  muted: false,
  participantCount: 0,
  ringDismissed: false,
  livekitRoom: null,
  setCall: (call) =>
    set({
      call,
      participantCount: call ? call.payload.participants.length : 0,
    }),
  clearCall: () =>
    set({
      call: null,
      joined: false,
      muted: false,
      participantCount: 0,
      ringDismissed: false,
    }),
  setJoined: (joined) => set({ joined }),
  setMuted: (muted) => set({ muted }),
  setRingDismissed: (ringDismissed) => set({ ringDismissed }),
  setLivekitRoom: (livekitRoom) => set({ livekitRoom }),
  reset: () =>
    set({
      call: null,
      joined: false,
      muted: false,
      participantCount: 0,
      ringDismissed: false,
      livekitRoom: null,
    }),
}))
