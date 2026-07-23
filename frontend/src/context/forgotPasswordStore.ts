import { create } from "zustand"

type ForgotPasswordState = {
  submitted: boolean
  setSubmitted: (v: boolean) => void
}

export const useForgotPasswordStore = create<ForgotPasswordState>((set) => ({
  submitted: false,
  setSubmitted: (v) => set({ submitted: v }),
}))
