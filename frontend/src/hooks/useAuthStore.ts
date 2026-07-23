import type { TokenResp } from "@eggplant/shared/api"
import axios from "axios"
import { create } from "zustand"

const TOKEN_KEY = "token"

type AuthState = {
  isAuthenticated: boolean
  token: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshToken: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => {
  const setToken = (token: string | null) => {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token)
    } else {
      localStorage.removeItem(TOKEN_KEY)
    }
    set({ token, isAuthenticated: !!token })
  }

  const login = async (email: string, password: string) => {
    const formData = new URLSearchParams()
    formData.append("email", email)
    formData.append("password", password)

    const tokenResp = await axios.post<TokenResp>("/auth/token", formData, {
      withCredentials: true,
    })

    setToken(tokenResp.data.access_token)
  }

  const logout = async () => {
    try {
      await axios.post<void>("/auth/logout", {}, { withCredentials: true })
    } catch (err) {
      console.error("Failed to logout", err)
    } finally {
      setToken(null)
    }
  }

  const refreshToken = async () => {
    try {
      const refreshResp = await axios.post<TokenResp>(
        "/auth/refresh",
        {},
        { withCredentials: true },
      )
      setToken(refreshResp.data.access_token)
    } catch {
      await logout()
    }
  }

  const initialToken = localStorage.getItem(TOKEN_KEY)

  return {
    isAuthenticated: !!initialToken,
    token: initialToken,
    login,
    logout,
    refreshToken,
  }
})
