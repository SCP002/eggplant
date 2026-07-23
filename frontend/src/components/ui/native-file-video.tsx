import { useVideoThumbnail } from "@/hooks/use-video-thumbnail"
import { useCloseOnBack } from "@/hooks/useCloseOnBack"
import i18n from "@/i18n"
import {
  nativeVideoPlayerStore,
  trackNativePlayer,
} from "@/lib/nativeVideoPlayer"
import { Capacitor } from "@capacitor/core"
import { NavigationBar } from "@capawesome/capacitor-navigation-bar"
import { VideoPlayer } from "@capgo/capacitor-video-player"
import { Play } from "lucide-react"
import { useState, useSyncExternalStore } from "react"
import type { Dispatch, SetStateAction } from "react"
import { useTranslation } from "react-i18next"

/**
 * Inline preview tile for video messages on Android.
 */
export function NativeFileVideo({
  url,
  playerId,
}: {
  url: string
  playerId: string
}) {
  const { t } = useTranslation()
  const thumbnail = useVideoThumbnail(url)
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "opening" } | { kind: "error"; message: string }
  >({ kind: "idle" })

  // Register a closer so the Android back button closes the player.
  const playerOpen = useSyncExternalStore(
    nativeVideoPlayerStore.subscribe,
    nativeVideoPlayerStore.isOpen,
  )
  useCloseOnBack(playerOpen, () => void nativeVideoPlayerStore.close())

  return (
    <div
      id={playerId}
      className="relative aspect-video w-full overflow-hidden rounded-sm bg-muted"
    >
      {thumbnail ? (
        // The generated preview frame
        <img
          src={thumbnail.uri}
          alt=""
          className="absolute inset-0 size-full object-cover"
        />
      ) : null}

      <button
        type="button"
        aria-label={t("media.playVideo")}
        disabled={state.kind === "opening"}
        className="absolute inset-0 z-10 grid place-items-center"
        onClick={() => {
          openNativePlayer(url, playerId, setState)
        }}
      >
        <span className="grid size-14 place-items-center rounded-full bg-black/60 text-white transition hover:bg-black/80">
          <Play className="size-7 translate-x-0.5" fill="currentColor" />
        </span>
      </button>

      {state.kind === "error" && (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center overflow-hidden bg-black/85 p-2 text-center">
          <span className="wrap-break-word text-xs whitespace-normal text-white">
            {state.message}
          </span>
        </div>
      )}
    </div>
  )
}

async function openNativePlayer(
  url: string,
  playerId: string,
  setState: Dispatch<
    SetStateAction<
      | { kind: "idle" }
      | { kind: "opening" }
      | { kind: "error"; message: string }
    >
  >,
) {
  if (!Capacitor.isNativePlatform()) return
  setState({ kind: "opening" })
  const tracker = await trackNativePlayer()
  tracker.setOpen(true)

  try {
    await VideoPlayer.initPlayer({
      mode: "fullscreen",
      playerId,
      url,
      title: i18n.t("media.video"),
      showControls: true,
      exitOnEnd: true,
      // Back button triggers Picture in Picture, it fails and overrides player close behavior.
      pipEnabled: false,
    })

    // Keep the OS navigation bar.
    try {
      await NavigationBar.show()
    } catch {
      // Not available
    }

    setState({ kind: "idle" })
  } catch (e) {
    await tracker.close()
    console.error("Failed to open native video player:", e)
    setState({ kind: "error", message: String(e) })
  }
}
