import { create } from "zustand"

type ResetPasswordState = {
  success: boolean
  setSuccess: (v: boolean) => void
}

export const useResetPasswordStore = create<ResetPasswordState>((set) => ({
  success: false,
  setSuccess: (v) => set({ success: v }),
}))
