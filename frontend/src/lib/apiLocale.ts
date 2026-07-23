import i18n from "@/i18n"
import axios from "axios"

/**
 * Sets the `X-Locale` header from the currently selected in-app language so
 * the backend can render localized content (e.g. transactional emails).
 */
export function setLocaleHeader(headers: {
  set: (key: string, value: string) => void
}): void {
  headers.set("X-Locale", i18n.language)
}

/**
 * Registers a request interceptor on the default axios instance so every
 * request carries the current language.
 */
export function installApiLocale(): void {
  axios.interceptors.request.use((config) => {
    if (config.headers) setLocaleHeader(config.headers)
    return config
  })
}
