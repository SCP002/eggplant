import { useAuthStore } from "@/hooks/useAuthStore"
import { Capacitor, registerPlugin } from "@capacitor/core"

/**
 * Wrapper around the native NotificationSocketService + plugin.
 */

export type NotificationSocketApi = {
  configure: (options: { token: string; baseUrl: string }) => Promise<void>
  setToken: (options: { token: string }) => Promise<void>
  checkBatteryOptimizations: () => Promise<{ enabled: boolean }>
  requestDisableBatteryOptimizations: () => Promise<{ enabled: boolean }>
  start: () => Promise<void>
  stop: () => Promise<void>
  openAutostartSettings: () => Promise<{ opened: boolean }>
}

const NotificationSocket =
  registerPlugin<NotificationSocketApi>("NotificationSocket")

let nativeSocketActive = false

/** Whether the native socket service is currently running. */
export function isNativeSocketActive(): boolean {
  return nativeSocketActive
}

const PROD_DOMAIN = import.meta.env.VITE_PROD_DOMAIN || "localhost"
const PROD_BASE_URL = `https://${PROD_DOMAIN}`

export function getBaseUrl(): string {
  if (Capacitor.isNativePlatform() && window.location.origin) {
    return window.location.origin
  }
  return PROD_BASE_URL
}

/** Persist credentials and start the native socket service. */
export async function startNativeSocket(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  if (nativeSocketActive) return
  const token = useAuthStore.getState().token
  if (!token) return
  try {
    await NotificationSocket.configure({ token, baseUrl: getBaseUrl() })
    await NotificationSocket.start()
    nativeSocketActive = true
  } catch (e) {
    console.error("startNativeSocket error:", e)
  }
}

/** Update the stored token without touching the running service. */
export async function updateNativeSocketToken(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  const token = useAuthStore.getState().token
  if (!token) return
  try {
    await NotificationSocket.setToken({ token })
  } catch (e) {
    console.error("updateNativeSocketToken error:", e)
  }
}

/**
 * Check whether the app is exempt from battery optimizations.
 * Returns true when already exempt.
 */
export async function checkBatteryOptimizations(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true
  try {
    const res = await NotificationSocket.checkBatteryOptimizations()
    return res.enabled
  } catch (e) {
    console.error("checkBatteryOptimizations error:", e)
    return true
  }
}

/**
 * Show the system dialog asking the user to allow the app to ignore battery
 * optimizations. No-op if already exempt.
 */
export async function requestDisableBatteryOptimizations(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    const { enabled } = await NotificationSocket.checkBatteryOptimizations()
    if (!enabled) {
      await NotificationSocket.requestDisableBatteryOptimizations()
    }
  } catch (e) {
    console.error("requestDisableBatteryOptimizations error:", e)
  }
}

/** Stop the native socket service (e.g. when app returns to foreground). */
export async function stopNativeSocket(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  // Always send the stop: after a process restart the service may be running
  // even though the JS-side flag is false (START_STICKY). The native stop is
  // idempotent.
  try {
    await NotificationSocket.stop()
    nativeSocketActive = false
  } catch (e) {
    console.error("stopNativeSocket error:", e)
  }
}

/**
 * Open the manufacturer's autostart settings (MIUI/HyperOS).
 */
export async function openAutostartSettings(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await NotificationSocket.openAutostartSettings()
  } catch (e) {
    console.error("openAutostartSettings error:", e)
  }
}
