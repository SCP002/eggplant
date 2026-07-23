import { requestMicPermission } from "@/lib/livekit"
import { startNativeSocket } from "@/lib/nativeSocket"
import {
  initAndroidNotificationTapHandler,
  initBackgroundMode,
  initWindowStateTracking,
} from "@/lib/notifications"
import ForgotPasswordPage from "@/pages/ForgotPasswordPage"
import InvitationPage from "@/pages/InvitationPage"
import LoginPage from "@/pages/LoginPage"
import MainPage from "@/pages/MainPage"
import RegisterPage from "@/pages/RegisterPage"
import ResetPasswordPage from "@/pages/ResetPasswordPage"
import { useEffect } from "react"
import { Route, Routes } from "react-router-dom"

function App() {
  useEffect(() => {
    void runStartupPermissionRequests()
    void startNativeSocket()
    const cleanupBackground = initBackgroundMode()
    const cleanupWindow = initWindowStateTracking()
    const cleanupNotificationTap = initAndroidNotificationTapHandler()
    return () => {
      cleanupBackground()
      cleanupWindow()
      cleanupNotificationTap()
    }
  }, [])

  return (
    <Routes>
      <Route path="/" element={<MainPage />} />
      <Route path="/rooms/:roomId" element={<MainPage />} />
      <Route path="/invitation/:token" element={<InvitationPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
    </Routes>
  )
}

async function runStartupPermissionRequests(): Promise<void> {
  await requestNotificationPermissionOnce()
  await requestMicrophonePermissionOnce()
  await requestBackgroundPermissionsOnce()
}

/**
 * Ask the user whether to open the battery-optimization and autostart settings.
 */
async function requestBackgroundPermissionsOnce(): Promise<void> {
  const { Capacitor } = await import("@capacitor/core")
  if (!Capacitor.isNativePlatform()) return
  const {
    checkBatteryOptimizations,
    requestDisableBatteryOptimizations,
    openAutostartSettings,
  } = await import("@/lib/nativeSocket")

  if (!localStorage.getItem("battery_prompted")) {
    localStorage.setItem("battery_prompted", "1")
    const exempt = await checkBatteryOptimizations()
    if (!exempt) {
      await requestDisableBatteryOptimizations()
    }
  }

  if (!localStorage.getItem("autostart_prompted")) {
    localStorage.setItem("autostart_prompted", "1")
    await openAutostartSettings()
  }
}

async function requestMicrophonePermissionOnce(): Promise<void> {
  if (localStorage.getItem("mic_permission_prompted")) return
  try {
    await requestMicPermission()
  } catch {
    // User denied or the platform rejected the request.
  } finally {
    localStorage.setItem("mic_permission_prompted", "1")
  }
}

async function requestNotificationPermissionOnce(): Promise<void> {
  if (localStorage.getItem("notification_permission_prompted")) return
  try {
    const { LocalNotifications } =
      await import("@capacitor/local-notifications")
    const perm = await LocalNotifications.checkPermissions()
    if (perm.display === "granted") return
    if (perm.display === "denied") return
    await LocalNotifications.requestPermissions()
  } catch {
    // Not running in Capacitor context
  } finally {
    localStorage.setItem("notification_permission_prompted", "1")
  }
}

export default App
