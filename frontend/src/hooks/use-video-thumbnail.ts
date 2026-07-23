import { resolveAbsoluteUrl } from "@/lib/utils"
import { Capacitor } from "@capacitor/core"
import { useEffect, useSyncExternalStore } from "react"

/**
 * Generates a real video-thumbnail on Android.
 */

export interface VideoThumbnail {
  uri: string
  width: number
  height: number
}

const store = {
  cache: new Map<string, VideoThumbnail>(),
  inflight: new Map<string, Promise<VideoThumbnail | undefined>>(),
  listeners: new Set<() => void>(),
  subscribe(listener: () => void) {
    store.listeners.add(listener)
    return () => store.listeners.delete(listener)
  },
  getSnapshot(): ReadonlyMap<string, VideoThumbnail> {
    return store.cache
  },
  notify(): void {
    store.cache = new Map(store.cache)
    for (const l of store.listeners) l()
  },
}

/**
 * Returns the generated thumbnail for a video URL, or undefined while it is
 * being generated / not available.
 */
export function useVideoThumbnail(
  url?: string,
  time = 10000,
): VideoThumbnail | undefined {
  useSyncExternalStore(store.subscribe, store.getSnapshot)

  useEffect(() => {
    if (!url) return
    if (!Capacitor.isNativePlatform()) return

    const absolute = resolveAbsoluteUrl(url)
    if (store.cache.has(absolute)) return

    let pending = store.inflight.get(absolute)
    if (!pending) {
      pending = import("@capgo/capacitor-video-thumbnails")
        .then(async ({ CapgoVideoThumbnails }) => {
          const { uri, width, height } =
            await CapgoVideoThumbnails.getThumbnail({
              sourceUri: absolute,
              time,
              quality: 0.7,
            })
          // The plugin returns a file:// path into the app cache, which the
          // WebView cannot load directly. convertFileSrc rewrites it to
          // the Capacitor-served scheme so the preview renders.
          const thumb = {
            uri: Capacitor.convertFileSrc(uri),
            width,
            height,
          }
          store.cache.set(absolute, thumb)
          store.notify()
          return thumb
        })
        .catch((e) => {
          console.error("Failed to generate video thumbnail:", e)
          return undefined
        })
        .finally(() => store.inflight.delete(absolute))
      store.inflight.set(absolute, pending)
    }
    void pending
  }, [url, time])

  return url ? store.cache.get(resolveAbsoluteUrl(url)) : undefined
}
