import i18n from "@/i18n"
import {
  isNativeSocketActive,
  startNativeSocket,
  stopNativeSocket,
  updateNativeSocketToken,
} from "@/lib/nativeSocket"
import { Capacitor } from "@capacitor/core"
import { Howl } from "howler"

export type SystemNotificationData = {
  roomId?: number
  invitationToken?: string
}

export type NavigationTarget =
  { type: "room"; roomId: number } | { type: "invitation"; token: string }

declare global {
  interface Window {
    electronAPI?: {
      showNotification: (
        title: string,
        body: string,
        data?: SystemNotificationData,
      ) => void
      onWindowStateChanged: (
        callback: (state: { isInTray: boolean; isMinimized: boolean }) => void,
      ) => () => void
      onNavigateTo: (callback: (target: NavigationTarget) => void) => () => void
      setTrayLabels: (labels: { show: string; quit: string }) => void
      isElectron: boolean
    }
  }
}

let notificationAudio: Howl | null = null

export function getNotificationAudio(): Howl {
  if (!notificationAudio) {
    notificationAudio = new Howl({
      src: ["/notification.mp3"],
      preload: true,
    })
  }
  return notificationAudio
}

let callRingAudio: Howl | null = null

export function getCallRingAudio(): Howl {
  if (!callRingAudio) {
    callRingAudio = new Howl({
      src: ["/call.mp3"],
      loop: true,
      preload: true,
    })
  }
  return callRingAudio
}

/** Starts the looping incoming-call ring (idempotent). */
export function playRingTone(): void {
  const ring = getCallRingAudio()
  if (ring.playing()) return
  ring.play()
}

/** Stops and releases the incoming-call ring. */
export function stopRingTone(): void {
  if (!callRingAudio) return
  callRingAudio.stop()
  callRingAudio.unload()
  callRingAudio = null
}

export function ensureAudioUnlocked(): void {
  getNotificationAudio()
  getCallRingAudio()
}

/* ---------- App visibility ---------- */

let _isFocused = !document.hidden && document.hasFocus()
let _isInTray = false
let _isAppBackgrounded = false

export function isFocused(): boolean {
  return _isFocused
}

export function isInTray(): boolean {
  return _isInTray
}

export function isAndroidBackgrounded(): boolean {
  return Capacitor.isNativePlatform() && _isAppBackgrounded
}

export type Visibility = "focused" | "minimized" | "hidden"

export function getVisibility(): Visibility {
  if (Capacitor.isNativePlatform()) {
    return _isAppBackgrounded ? "hidden" : "focused"
  }
  if (_isInTray) return "hidden"
  return _isFocused ? "focused" : "minimized"
}

export function initWindowStateTracking(): () => void {
  const onVisibilityChange = () => {
    _isFocused = !document.hidden && document.hasFocus()
    // Keep the native service's stored token fresh.
    void updateNativeSocketToken()
  }
  const onFocus = () => {
    _isFocused = true
  }
  const onBlur = () => {
    _isFocused = false
  }

  document.addEventListener("visibilitychange", onVisibilityChange)
  window.addEventListener("focus", onFocus)
  window.addEventListener("blur", onBlur)

  const cleanups: Array<() => void> = [
    () => document.removeEventListener("visibilitychange", onVisibilityChange),
    () => window.removeEventListener("focus", onFocus),
    () => window.removeEventListener("blur", onBlur),
  ]

  if (window.electronAPI?.onWindowStateChanged) {
    const cleanupIpc = window.electronAPI.onWindowStateChanged((state) => {
      _isInTray = state.isInTray
      if (!state.isInTray && !state.isMinimized) {
        _isFocused = true
      }
    })
    cleanups.push(cleanupIpc)
  }

  return () => {
    for (const c of cleanups) c()
  }
}

export function initBackgroundMode(): () => void {
  if (!Capacitor.isNativePlatform()) return () => {}
  let handle: { remove: () => Promise<void> } | null = null
  void import("@capacitor/app").then(({ App }) => {
    void App.addListener("appStateChange", ({ isActive }) => {
      _isAppBackgrounded = !isActive
      if (isActive) {
        void stopNativeSocket()
      } else {
        void startNativeSocket()
      }
    }).then((h) => {
      handle = h
    })
  })
  return () => {
    void handle?.remove()
  }
}

/* ---------- Message notification decision ---------- */

export type MessageNotificationPlan = {
  sound: boolean
  systemNotification: boolean
}

export function planMessageNotification(
  visibility: Visibility,
  isReadingRoom: boolean,
): MessageNotificationPlan {
  if (visibility === "focused" && isReadingRoom) {
    return { sound: false, systemNotification: false }
  }

  if (visibility === "focused" || visibility === "minimized") {
    return { sound: true, systemNotification: false }
  }

  return { sound: false, systemNotification: true }
}

export function notifyNewMessage(opts: {
  roomId: number
  messageId: number
  title: string
  body: string
  isReadingRoom: boolean
}): void {
  const plan = planMessageNotification(getVisibility(), opts.isReadingRoom)

  if (plan.sound) {
    getNotificationAudio().play()
  }

  if (plan.systemNotification) {
    // Android: the native socket service posts the OS notification itself
    // when it owns the WebSocket; skip the JS duplicate.
    if (isAndroidBackgrounded() && isNativeSocketActive()) return
    triggerSystemNotification(opts.title, opts.body, { roomId: opts.roomId })
  }
}

export function notifyIncomingCall(
  roomId: number,
  roomName: string,
  callerName?: string | null,
): void {
  // Android: the native socket service posts the OS notification itself when
  // it owns the WebSocket; skip the JS duplicate.
  if (isAndroidBackgrounded() && isNativeSocketActive()) return
  const body = callerName
    ? i18n.t("call.incomingFrom", { username: callerName })
    : roomName
  triggerSystemNotification(i18n.t("call.incoming"), body, { roomId })
}

/* ---------- Primitives ---------- */

export function syncAppBadge(totalUnread: number): void {
  try {
    if (totalUnread > 0) {
      if ("setAppBadge" in navigator) void navigator.setAppBadge(totalUnread)
    } else if ("clearAppBadge" in navigator) {
      void navigator.clearAppBadge()
    }
  } catch {
    // Badge API not supported
  }
}

export function triggerSystemNotification(
  title: string,
  body: string,
  data?: SystemNotificationData,
): void {
  if (window.electronAPI) {
    window.electronAPI.showNotification(title, body, data)
  } else {
    void showAndroidNotification(title, body, data?.roomId)
  }
}

/* ---------- Android / Capacitor ---------- */

let notificationIdCounter = 0

function nextNotificationId(): number {
  notificationIdCounter = (notificationIdCounter + 1) % 2147483647
  return notificationIdCounter
}

function openNativeNotificationRoom(roomId: number): void {
  const win = window as Window & { nativeNotificationRoomId?: number }
  win.nativeNotificationRoomId = roomId
  window.dispatchEvent(new Event("nativeNotificationRoomId"))
}

export function initAndroidNotificationTapHandler(): () => void {
  if (!Capacitor.isNativePlatform()) return () => {}
  let handle: { remove: () => Promise<void> } | null = null
  void import("@capacitor/local-notifications").then(
    ({ LocalNotifications }) => {
      void LocalNotifications.addListener(
        "localNotificationActionPerformed",
        (event) => {
          const extra = event.notification.extra as
            { roomId?: number } | undefined
          if (extra?.roomId) {
            openNativeNotificationRoom(extra.roomId)
          }
        },
      ).then((h) => {
        handle = h
      })
    },
  )
  return () => {
    void handle?.remove()
  }
}

async function showAndroidNotification(
  title: string,
  body: string,
  roomId?: number,
): Promise<void> {
  try {
    const { LocalNotifications } =
      await import("@capacitor/local-notifications")
    const perm = await LocalNotifications.checkPermissions()
    if (perm.display !== "granted") return
    await LocalNotifications.schedule({
      notifications: [
        {
          id: nextNotificationId(),
          title,
          body,
          smallIcon: "ic_stat_notification",
          iconColor: "#FFFFFF",
          channelId: "messages",
          extra: roomId ? { roomId } : undefined,
        },
      ],
    })
  } catch (e) {
    console.error("showAndroidNotification error:", e)
  }
}
