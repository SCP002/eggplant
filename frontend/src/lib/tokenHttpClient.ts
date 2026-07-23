import { useAuthStore } from "@/hooks/useAuthStore"
import { setLocaleHeader } from "@/lib/apiLocale"
import axios from "axios"
import createAuthRefreshInterceptor from "axios-auth-refresh"

const tokenHttpClient = axios.create()

tokenHttpClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (config.headers) {
    setLocaleHeader(config.headers)
    if (token) {
      config.headers.setAuthorization(`Bearer ${token}`)
    }
  }
  return config
})

const refreshAuthLogic = async (_: unknown) => {
  await useAuthStore.getState().refreshToken()
  return Promise.resolve()
}

createAuthRefreshInterceptor(tokenHttpClient, refreshAuthLogic, {
  statusCodes: [401],
  deduplicateRefresh: false,
  onRetry: (config) => {
    const token = useAuthStore.getState().token
    if (config.headers) {
      setLocaleHeader(config.headers)
      if (token) {
        config.headers.setAuthorization(`Bearer ${token}`)
      }
    }
    return config
  },
})

export default tokenHttpClient
