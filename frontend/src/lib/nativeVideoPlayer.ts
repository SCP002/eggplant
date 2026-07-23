import { Capacitor } from "@capacitor/core"
import { VideoPlayer } from "@capgo/capacitor-video-player"

/**
 * The plugin's TS types omit `addListener`, but the Capacitor runtime plugin
 * supports the documented `jeepCapVideoPlayerExit` event. Bridge via a minimal
 * local type.
 */
type ExitEvent = { currentTime: number; dismiss: string }
type VideoPlayerWithListeners = typeof VideoPlayer & {
  addListener(
    event: "jeepCapVideoPlayerExit",
    listener: (info: ExitEvent) => void,
  ): Promise<{ remove(): Promise<void> }>
}

/**
 * Store tracking whether the @capgo/capacitor-video-player fullscreen player
 * is currently open. Lets app-level back handling know it should close the
 * player.
 */
const state = {
  isOpen: false,
  listeners: new Set<() => void>(),
  binders: new Set<VideoPlayerBinder>(),
  subscribe(listener: () => void) {
    state.listeners.add(listener)
    return () => state.listeners.delete(listener)
  },
  setOpen(open: boolean) {
    if (state.isOpen === open) return
    state.isOpen = open
    for (const l of state.listeners) l()
  },
}

export const nativeVideoPlayerStore = {
  isOpen: () => state.isOpen,
  subscribe: state.subscribe,
  setOpen: state.setOpen,
  close: async () => {
    for (const binder of state.binders) {
      await binder.close()
    }
    state.binders.clear()
  },
}

export type VideoPlayerBinder = {
  setOpen: (open: boolean) => void
  close: () => Promise<void>
}

/**
 * After calling `initPlayer`, register this to keep the shared open-flag and
 * a close function in sync. Returns refs used for cleanup / back handling.
 */
export async function trackNativePlayer(): Promise<VideoPlayerBinder> {
  const setOpen = state.setOpen

  let exitListener: { remove(): Promise<void> } | null = null
  if (Capacitor.isNativePlatform()) {
    const vp = VideoPlayer as VideoPlayerWithListeners
    const handle = vp.addListener("jeepCapVideoPlayerExit", () => {
      state.setOpen(false)
      for (const b of state.binders) void b.close()
      state.binders.clear()
    })
    exitListener = await handle
  }

  const binder: VideoPlayerBinder = {
    setOpen,
    close: async () => {
      try {
        await VideoPlayer.stopAllPlayers()
        await VideoPlayer.exitPlayer()
      } finally {
        state.setOpen(false)
      }
      if (exitListener) {
        await exitListener.remove()
        exitListener = null
      }
      state.binders.delete(binder)
    },
  }

  state.binders.add(binder)
  return binder
}
