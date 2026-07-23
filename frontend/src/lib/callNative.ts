import { Capacitor, registerPlugin } from "@capacitor/core"

type CallServiceApi = {
  start: () => Promise<void>
  stop: () => Promise<void>
}

const CallService = registerPlugin<CallServiceApi>("CallService")

/** Start or stop the native call foreground service. */
export async function setNativeCallActive(active: boolean): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    if (active) {
      await CallService.start()
    } else {
      await CallService.stop()
    }
  } catch {
    // Foreground service unavailable; the call still works while foregrounded.
  }
}
