import { create } from "zustand"

type UserMenuState = {
  menuOpen: boolean
  setMenuOpen: (v: boolean) => void
  changeUsernameOpen: boolean
  setChangeUsernameOpen: (v: boolean) => void
  changePasswordOpen: boolean
  setChangePasswordOpen: (v: boolean) => void
  deleteAccountOpen: boolean
  setDeleteAccountOpen: (v: boolean) => void
}

export const useUserMenuStore = create<UserMenuState>((set) => ({
  menuOpen: false,
  setMenuOpen: (v) => set({ menuOpen: v }),
  changeUsernameOpen: false,
  setChangeUsernameOpen: (v) => set({ changeUsernameOpen: v }),
  changePasswordOpen: false,
  setChangePasswordOpen: (v) => set({ changePasswordOpen: v }),
  deleteAccountOpen: false,
  setDeleteAccountOpen: (v) => set({ deleteAccountOpen: v }),
}))
