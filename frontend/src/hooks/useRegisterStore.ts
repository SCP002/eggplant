import { create } from "zustand"

interface RegisterState {
  codeSent: boolean
  sending: boolean
  verifying: boolean
  setCodeSent: (v: boolean) => void
  setSending: (v: boolean) => void
  setVerifying: (v: boolean) => void
}

export const useRegisterStore = create<RegisterState>((set) => ({
  codeSent: false,
  sending: false,
  verifying: false,

  setCodeSent: (v: boolean) => set({ codeSent: v }),
  setSending: (v: boolean) => set({ sending: v }),
  setVerifying: (v: boolean) => set({ verifying: v }),
}))
